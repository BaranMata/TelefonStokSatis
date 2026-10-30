// İş kuralları: alış, satış, takas, kâr hesabı, raporlar, sayım, dışa aktarma, yedekleme
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let s, c, customerId, supplierId;

before(async () => {
  s = h.baseScenario();
  c = await h.login(s.A.adminEmail);
  customerId = (await c.post('/api/customers').send({ full_name: 'Ayşe Müşteri', phone: '0555 000 00 00' })).body.item.id;
  supplierId = (await c.post('/api/suppliers').send({ name: 'Toptancı A.Ş.' })).body.item.id;
});

test('Geçersiz IMEI (Luhn) reddedilir', async () => {
  const res = await c.post('/api/purchases').send({ devices: [h.device({ imei: '123456789012345' })], paymentMethod: 'cash' });
  assert.equal(res.status, 400);
});

test('Toplu alış: barkod üretilir, stok hareketi yazılır, ödeme toplamı hesaplanır', async () => {
  const res = await h.buy(c, [h.device({ cost: 10000 }), h.device({ cost: 15000 }), h.device({ cost: 20000 })], { supplierId, paidAmount: 30000 });
  assert.equal(res.deviceIds.length, 3);
  const tx = (await c.get(`/api/transactions/${res.transactionId}`)).body.item;
  assert.equal(tx.total_in, 45000);
  assert.equal(tx.net_amount, -45000);
  assert.equal(tx.payment_status, 'partial');
  const d = (await c.get(`/api/devices/${res.deviceIds[0]}`)).body;
  assert.match(d.item.barcode, /^TS\d{8}$/);
  assert.equal(d.movements[0].type, 'purchase_in');
  // Barkod ile hızlı arama
  const look = await c.get(`/api/devices/lookup?code=${d.item.barcode}`);
  assert.equal(look.body.item.id, d.item.id);
});

test('Satış: stok otomatik güncellenir, cihaz bazında kâr ve marj hesaplanır', async () => {
  const { deviceIds: [id] } = await h.buy(c, [h.device({ cost: 20000 })]);
  const sale = await c.post('/api/sales').send({ customerId, items: [{ deviceId: id, price: 25000 }], paymentMethod: 'card' });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.profit, 5000);
  const d = (await c.get(`/api/devices/${id}`)).body;
  assert.equal(d.item.status, 'sold');
  assert.equal(d.item.profit, 5000);
  assert.equal(d.item.margin, 20);
  assert.deepEqual(d.movements.map((m) => m.type), ['sale_out', 'purchase_in']);
});

test('Takas: gelen cihaz takas değeriyle stoka girer, fark (takas bedeli) hesaplanır', async () => {
  const { deviceIds: [out] } = await h.buy(c, [h.device({ cost: 30000 })]);
  const incoming = { ...h.device({ brand: 'Samsung', model: 'Galaxy A55' }), value: 12000 };
  const res = await c.post('/api/trades').send({ customerId, incoming: [incoming], outgoing: [{ deviceId: out, price: 34000 }], paymentMethod: 'cash' });
  assert.equal(res.status, 201);
  assert.equal(res.body.tradeDifference, 22000); // müşteri 34.000 - 12.000 öder
  assert.equal(res.body.profit, 4000);
  const inDev = (await c.get(`/api/devices/${res.body.incomingIds[0]}`)).body.item;
  assert.equal(inDev.status, 'in_stock');
  assert.equal(inDev.purchase_price, 12000);
  // Takasta alınan cihaz daha sonra satılınca kârı takas değerine göre hesaplanır
  const sale = await c.post('/api/sales').send({ items: [{ deviceId: inDev.id, price: 14500 }], paymentMethod: 'cash' });
  assert.equal(sale.body.profit, 2500);
});

test('Daha önce satılmış IMEI geri alınınca aynı cihaz kaydı yeniden stoka girer', async () => {
  const dev = h.device({ cost: 10000 });
  const { deviceIds: [id] } = await h.buy(c, [dev]);
  await c.post('/api/sales').send({ items: [{ deviceId: id, price: 12000 }], paymentMethod: 'cash' });
  const again = await h.buy(c, [{ ...dev, cost: 8000 }], { customerId });
  assert.equal(again.deviceIds[0], id);
  const d = (await c.get(`/api/devices/${id}`)).body;
  assert.equal(d.item.status, 'in_stock');
  assert.equal(d.item.purchase_price, 8000);
  assert.equal(d.transactions.length, 3); // alış, satış, geri alış
});

test('Dönem raporu gelir, maliyet ve kârı kalemlerden doğru toplar', async () => {
  const r = (await c.get('/api/reports/period?groupBy=month')).body;
  const items = h.db.all("SELECT i.* FROM transaction_items i WHERE i.tenant_id = ? AND i.direction = 'out'", s.A.id);
  const revenue = items.reduce((x, i) => x + i.unit_price, 0);
  const cost = items.reduce((x, i) => x + i.unit_cost, 0);
  assert.equal(r.totals.revenue, revenue);
  assert.equal(r.totals.cost, cost);
  assert.equal(r.totals.profit, revenue - cost);
  // Filtreler: işlem türü ve IMEI
  const onlyTrade = (await c.get('/api/reports/device-profit?type=trade')).body;
  assert.equal(onlyTrade.rows.length, 1);
  assert.equal(onlyTrade.rows[0].profit, 4000);
  const byImei = (await c.get(`/api/transactions?imei=${onlyTrade.rows[0].imei}`)).body;
  assert.ok(byImei.items.length >= 2);
  const dist = (await c.get('/api/reports/distribution?status=all')).body;
  assert.ok(dist.brands.find((b) => b.brand === 'Samsung'));
});

test('Excel ve PDF dışa aktarma dosya döndürür', async () => {
  const x = await c.get('/api/reports/export?report=period&format=xlsx&groupBy=day').buffer(true);
  assert.equal(x.status, 200);
  assert.match(x.headers['content-type'], /spreadsheetml/);
  const p = await c.get('/api/reports/export?report=device-profit&format=pdf').buffer(true);
  assert.equal(p.status, 200);
  assert.equal(p.headers['content-type'], 'application/pdf');
  const t = await c.get('/api/transactions/export?format=pdf&type=sale').buffer(true);
  assert.equal(t.status, 200);
});

test('Stok sayımı eksik ve bilinmeyen cihazları raporlar', async () => {
  const { deviceIds } = await h.buy(c, [h.device(), h.device()]);
  const start = await c.post('/api/stock-counts').send({ note: 'Ay sonu' });
  assert.equal(start.status, 201);
  const cid = start.body.id;
  assert.equal((await c.post('/api/stock-counts').send({})).status, 409); // tek açık sayım
  const inStock = h.db.all("SELECT id, imei FROM devices WHERE tenant_id = ? AND status <> 'sold'", s.A.id);
  for (const d of inStock.filter((x) => x.id !== deviceIds[1])) {
    assert.equal((await c.post(`/api/stock-counts/${cid}/scan`).send({ code: d.imei })).body.result, 'ok');
  }
  assert.equal((await c.post(`/api/stock-counts/${cid}/scan`).send({ code: inStock[0].imei })).status, 409);
  assert.equal((await c.post(`/api/stock-counts/${cid}/scan`).send({ code: '999999999999999' })).body.result, 'unknown');
  const close = await c.post(`/api/stock-counts/${cid}/close`);
  assert.deepEqual(close.body, { expected: inStock.length, found: inStock.length - 1, missing: 1, unexpected: 1 });
  const detail = (await c.get(`/api/stock-counts/${cid}`)).body;
  assert.deepEqual(detail.missing.map((d) => d.id), [deviceIds[1]]);
});

test('Müşteri işlem geçmişi varsa silinemez', async () => {
  assert.equal((await c.delete(`/api/customers/${customerId}`)).status, 409);
  const tmp = (await c.post('/api/customers').send({ full_name: 'Silinecek' })).body.item.id;
  assert.equal((await c.delete(`/api/customers/${tmp}`)).status, 200);
});

test('Yedek alma ve geri yükleme', async () => {
  const sup = await h.login('super@test.local');
  const b = await sup.post('/api/admin/backups');
  assert.equal(b.status, 201);
  const before = h.db.one('SELECT COUNT(*) c FROM customers').c;
  await c.post('/api/customers').send({ full_name: 'Yedekten sonra eklenen' });
  assert.equal(h.db.one('SELECT COUNT(*) c FROM customers').c, before + 1);
  assert.equal((await sup.post('/api/admin/backups/restore').send({ fileName: '../data/app.db' })).status, 400);
  const r = await sup.post('/api/admin/backups/restore').send({ fileName: b.body.fileName });
  assert.equal(r.status, 200);
  assert.equal(h.db.one('SELECT COUNT(*) c FROM customers').c, before);
  const list = (await sup.get('/api/admin/backups')).body.items.map((x) => x.kind);
  assert.ok(list.includes('manual') && list.includes('pre_restore'));
});

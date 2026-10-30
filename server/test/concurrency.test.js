// Eş zamanlı işlem güvenliği: aynı cihaz iki kez satılamaz, yarım kalan işlem geri alınır.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let s, admin, seller;

before(async () => {
  s = h.baseScenario();
  admin = await h.login(s.A.adminEmail);
  seller = await h.login(s.A.sellerEmail);
});

test('Satılmış cihaz ikinci kez satılamaz (409)', async () => {
  const { deviceIds: [id] } = await h.buy(admin, [h.device()]);
  const first = await admin.post('/api/sales').send({ items: [{ deviceId: id, price: 25000 }], paymentMethod: 'cash' });
  assert.equal(first.status, 201);
  const second = await seller.post('/api/sales').send({ items: [{ deviceId: id, price: 26000 }], paymentMethod: 'cash' });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'DEVICE_NOT_AVAILABLE');
});

test('Aynı cihaz için eş zamanlı 10 satış isteğinden yalnızca biri başarılı olur', async () => {
  const { deviceIds: [id] } = await h.buy(admin, [h.device()]);
  const clients = [admin, seller];
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => clients[i % 2].post('/api/sales').send({ items: [{ deviceId: id, price: 25000 + i }], paymentMethod: 'cash' })),
  );
  const ok = results.filter((r) => r.status === 201);
  assert.equal(ok.length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 9);
  assert.equal(h.db.one("SELECT COUNT(*) c FROM transaction_items WHERE device_id = ? AND direction = 'out'", id).c, 1);
  assert.equal(h.db.one("SELECT COUNT(*) c FROM stock_movements WHERE device_id = ? AND type = 'sale_out'", id).c, 1);
});

test('Çok kalemli satışta bir cihaz müsait değilse işlemin tamamı geri alınır', async () => {
  const { deviceIds: [x, y] } = await h.buy(admin, [h.device(), h.device()]);
  await admin.post('/api/sales').send({ items: [{ deviceId: y, price: 1000 }], paymentMethod: 'cash' });
  const txBefore = h.db.one('SELECT COUNT(*) c FROM transactions').c;
  const res = await admin.post('/api/sales').send({ items: [{ deviceId: x, price: 1000 }, { deviceId: y, price: 1000 }], paymentMethod: 'cash' });
  assert.equal(res.status, 409);
  assert.equal(h.db.one('SELECT status FROM devices WHERE id = ?', x).status, 'in_stock');
  assert.equal(h.db.one('SELECT COUNT(*) c FROM transactions').c, txBefore);
});

test('Bir müşteriye rezerve edilen cihaz başka müşteriye satılamaz', async () => {
  const c1 = (await admin.post('/api/customers').send({ full_name: 'Rezerve Eden' })).body.item.id;
  const c2 = (await admin.post('/api/customers').send({ full_name: 'Başka Müşteri' })).body.item.id;
  const { deviceIds: [id] } = await h.buy(admin, [h.device()]);
  assert.equal((await admin.post(`/api/devices/${id}/reserve`).send({ customerId: c1, note: 'kapora' })).status, 200);
  assert.equal((await admin.post(`/api/devices/${id}/reserve`).send({ customerId: c2 })).status, 409);
  assert.equal((await admin.post('/api/sales').send({ customerId: c2, items: [{ deviceId: id, price: 1 }], paymentMethod: 'cash' })).status, 409);
  assert.equal((await admin.post('/api/sales').send({ customerId: c1, items: [{ deviceId: id, price: 30000 }], paymentMethod: 'cash' })).status, 201);
});

test('İyimser kilitleme: eski sürümle yapılan güncelleme reddedilir', async () => {
  const { deviceIds: [id] } = await h.buy(admin, [h.device()]);
  const d = (await admin.get(`/api/devices/${id}`)).body.item;
  const body = { brand: d.brand, model: d.model, storage: d.storage, color: 'Beyaz', imei: d.imei, serial_no: null, condition: d.condition, list_price: 1, notes: null, version: d.version };
  assert.equal((await admin.put(`/api/devices/${id}`).send(body)).status, 200);
  const stale = await seller.put(`/api/devices/${id}`).send({ ...body, color: 'Kırmızı' });
  assert.equal(stale.status, 403); // satıcıda stock.edit yok
  const stale2 = await admin.put(`/api/devices/${id}`).send({ ...body, color: 'Kırmızı' });
  assert.equal(stale2.status, 409);
  assert.equal(stale2.body.error.code, 'STALE_VERSION');
});

test('Aynı IMEI ile eş zamanlı iki alış isteğinden yalnızca biri kabul edilir', async () => {
  const dev = h.device();
  const results = await Promise.all([1, 2].map(() => admin.post('/api/purchases').send({ devices: [dev], paymentMethod: 'cash' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

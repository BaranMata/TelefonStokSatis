// Kiracı veri izolasyonu: bir işletme, başka bir işletmenin hiçbir kaydını okuyamaz / değiştiremez.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let s, a, b, deviceId, deviceImei, customerId, txId;

before(async () => {
  s = h.baseScenario();
  a = await h.login(s.A.adminEmail);
  b = await h.login(s.B.adminEmail);
  const dev = h.device();
  deviceImei = dev.imei;
  const p = await h.buy(a, [dev]);
  deviceId = p.deviceIds[0];
  txId = p.transactionId;
  customerId = (await a.post('/api/customers').send({ full_name: 'A Müşterisi' })).body.item.id;
});

test('B işletmesi A cihazını listede göremez', async () => {
  const res = await b.get('/api/devices');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.find((d) => d.id === deviceId), undefined);
  assert.equal(res.body.total, 0);
});

test('B işletmesi A cihazına doğrudan ID ile erişemez (404)', async () => {
  assert.equal((await b.get(`/api/devices/${deviceId}`)).status, 404);
  assert.equal((await b.get(`/api/devices/lookup?code=${deviceImei}`)).status, 404);
  assert.equal((await b.post(`/api/devices/${deviceId}/reserve`).send({})).status, 404);
  const put = await b.put(`/api/devices/${deviceId}`).send({ ...h.device({ imei: deviceImei }), version: 1 });
  assert.equal(put.status, 404);
});

test('B işletmesi A cihazını satamaz ve cihaz durumu değişmez', async () => {
  const res = await b.post('/api/sales').send({ items: [{ deviceId, price: 1 }], paymentMethod: 'cash' });
  assert.equal(res.status, 404);
  const check = await a.get(`/api/devices/${deviceId}`);
  assert.equal(check.body.item.status, 'in_stock');
  // Başarısız işlemden geriye işlem kaydı kalmaz
  assert.equal(h.db.one('SELECT COUNT(*) c FROM transactions WHERE tenant_id = ?', s.B.id).c, 0);
});

test('B işletmesi A müşterisini ve işlemini göremez, A müşterisiyle satış yapamaz', async () => {
  assert.equal((await b.get(`/api/customers/${customerId}`)).status, 404);
  assert.equal((await b.put(`/api/customers/${customerId}`).send({ full_name: 'Değişti' })).status, 404);
  assert.equal((await b.delete(`/api/customers/${customerId}`)).status, 404);
  assert.equal((await b.get(`/api/transactions/${txId}`)).status, 404);
  const own = await h.buy(b, [h.device()]);
  const sale = await b.post('/api/sales').send({ customerId, items: [{ deviceId: own.deviceIds[0], price: 1000 }], paymentMethod: 'cash' });
  assert.equal(sale.status, 400);
  assert.equal(sale.body.error.code, 'INVALID_REFERENCE');
});

test('İstemciden gönderilen tenant_id parametresi dikkate alınmaz', async () => {
  const res = await b.get(`/api/devices?tenant_id=${s.A.id}&tenantId=${s.A.id}`);
  assert.ok(res.body.items.every((d) => d.tenant_id === s.B.id));
  const created = await b.post('/api/customers').send({ full_name: 'Sızma denemesi', tenant_id: s.A.id });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.tenant_id, s.B.id);
});

test('Raporlar yalnızca kendi işletmesinin verisini içerir', async () => {
  const ra = await a.get('/api/reports/dashboard');
  const rb = await b.get('/api/reports/dashboard');
  const count = (tid) => h.db.one("SELECT COUNT(*) c, SUM(purchase_price) cost FROM devices WHERE tenant_id = ? AND status = 'in_stock'", tid);
  assert.equal(ra.body.stock.in_stock, count(s.A.id).c);
  assert.equal(ra.body.stock.stock_cost, count(s.A.id).cost);
  assert.equal(rb.body.stock.in_stock, count(s.B.id).c);
  assert.notEqual(h.db.one('SELECT COUNT(*) c FROM devices').c, ra.body.stock.in_stock);
});

test('Aynı IMEI farklı işletmelerde ayrı ayrı kayıtlı olabilir, aynı işletmede olamaz', async () => {
  const again = await b.post('/api/purchases').send({ devices: [h.device({ imei: deviceImei })], paymentMethod: 'cash' });
  assert.equal(again.status, 201);
  const dup = await a.post('/api/purchases').send({ devices: [h.device({ imei: deviceImei })], paymentMethod: 'cash' });
  assert.equal(dup.status, 409);
});

test('İşletme admini başka işletmenin personelini düzenleyemez', async () => {
  const res = await b.put(`/api/business/staff/${s.A.seller}`).send({ full_name: 'Ele geçirildi', role: 'tenant_admin', permissions: [], is_active: true });
  assert.equal(res.status, 404);
  const row = h.db.one('SELECT role FROM users WHERE id = ?', s.A.seller);
  assert.equal(row.role, 'user');
});

test('Faaliyet geçmişi yalnızca kendi işletmesinin kayıtlarını gösterir', async () => {
  const res = await b.get('/api/business/activity?pageSize=200');
  assert.ok(res.body.items.length > 0);
  assert.ok(res.body.items.every((x) => x.tenant_id === s.B.id));
});

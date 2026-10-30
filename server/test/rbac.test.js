// Rol ve yetki kontrolleri API katmanında zorunlu
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let s, admin, seller, depot, sup, depotId;

before(async () => {
  s = h.baseScenario();
  depotId = h.user(s.A.id, 'depot@test.local', 'user', ['stock.view', 'stock.count']);
  admin = await h.login(s.A.adminEmail);
  seller = await h.login(s.A.sellerEmail);
  depot = await h.login('depot@test.local');
  sup = await h.login('super@test.local');
});

test('Oturum açmadan korumalı uç noktalara erişilemez (401)', async () => {
  const anon = h.client();
  for (const url of ['/api/devices', '/api/reports/dashboard', '/api/business/staff', '/api/admin/tenants', '/api/profile']) {
    assert.equal((await anon.get(url)).status, 401, url);
  }
});

test('CSRF başlığı olmayan değişiklik isteği reddedilir', async () => {
  const res = await admin.agent.post('/api/customers').send({ full_name: 'Başlıksız' });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CSRF');
});

test('Kullanıcı yetkisi olmayan işlemi yapamaz', async () => {
  const p = await h.buy(admin, [h.device()]);
  // Depo kullanıcısı satış yapamaz, alış yapamaz, rapor göremez, müşteri oluşturamaz
  assert.equal((await depot.post('/api/sales').send({ items: [{ deviceId: p.deviceIds[0], price: 1 }], paymentMethod: 'cash' })).status, 403);
  assert.equal((await depot.post('/api/purchases').send({ devices: [h.device()], paymentMethod: 'cash' })).status, 403);
  assert.equal((await depot.get('/api/reports/dashboard')).status, 403);
  assert.equal((await depot.post('/api/customers').send({ full_name: 'X' })).status, 403);
  // Ama stoku görebilir ve sayım yapabilir
  assert.equal((await depot.get('/api/devices')).status, 200);
  assert.equal((await depot.post('/api/stock-counts').send({})).status, 201);
  // Satış kullanıcısı satış yapabilir ama alış yapamaz
  assert.equal((await seller.post('/api/purchases').send({ devices: [h.device()], paymentMethod: 'cash' })).status, 403);
  assert.equal((await seller.post('/api/sales').send({ items: [{ deviceId: p.deviceIds[0], price: 25000 }], paymentMethod: 'card' })).status, 201);
});

test('Kullanıcı rolü işletme admini ve süper admin alanlarına giremez', async () => {
  assert.equal((await seller.get('/api/business/staff')).status, 403);
  assert.equal((await seller.get('/api/business/subscription')).status, 403);
  assert.equal((await seller.get('/api/admin/tenants')).status, 403);
  assert.equal((await admin.get('/api/admin/tenants')).status, 403);
  assert.equal((await admin.post('/api/admin/backups')).status, 403);
});

test('Süper admin işletmelerin iş verisine (stok, satış) erişemez', async () => {
  assert.equal((await sup.get('/api/devices')).status, 403);
  assert.equal((await sup.get('/api/reports/dashboard')).status, 403);
  assert.equal((await sup.get('/api/business/staff')).status, 403);
  assert.equal((await sup.get('/api/admin/tenants')).status, 200);
});

test('Yetki değiştirildiğinde kullanıcının mevcut oturumu geçersiz olur', async () => {
  const before = await depot.get('/api/devices');
  assert.equal(before.status, 200);
  const res = await admin.put(`/api/business/staff/${depotId}`).send({ full_name: 'Depo', role: 'user', permissions: ['stock.view'], is_active: true });
  assert.equal(res.status, 200);
  assert.equal((await depot.get('/api/devices')).status, 401);
  const relog = await h.login('depot@test.local');
  assert.equal((await relog.post('/api/stock-counts').send({})).status, 403); // stock.count kaldırıldı
});

test('Devre dışı bırakılan kullanıcı oturumunu kaybeder ve giriş yapamaz', async () => {
  const uid = h.user(s.A.id, 'temp@test.local', 'user', ['stock.view']);
  const c = await h.login('temp@test.local');
  await admin.put(`/api/business/staff/${uid}`).send({ full_name: 'Geçici', role: 'user', permissions: ['stock.view'], is_active: false });
  assert.equal((await c.get('/api/devices')).status, 401);
  const res = await h.client().post('/api/auth/login').send({ email: 'temp@test.local', password: h.PASSWORD });
  assert.equal(res.status, 403);
});

test('Son işletme admini kendini düşüremez', async () => {
  const res = await admin.put(`/api/business/staff/${s.A.admin}`).send({ full_name: 'Admin', role: 'user', permissions: [], is_active: true });
  assert.equal(res.status, 400);
});

test('Askıya alınan işletmenin kullanıcıları anında erişimini kaybeder; yeniden etkinleştirilince erişir', async () => {
  const b = await h.login(s.B.adminEmail);
  assert.equal((await b.get('/api/devices')).status, 200);
  assert.equal((await sup.patch(`/api/admin/tenants/${s.B.id}/status`).send({ status: 'suspended', reason: 'Ödeme yapılmadı' })).status, 200);
  const r = await b.get('/api/devices');
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'TENANT_INACTIVE');
  assert.equal((await h.client().post('/api/auth/login').send({ email: s.B.adminEmail, password: h.PASSWORD })).status, 403);
  await sup.patch(`/api/admin/tenants/${s.B.id}/status`).send({ status: 'active' });
  assert.equal((await (await h.login(s.B.adminEmail)).get('/api/devices')).status, 200);
  // Bu işlemler denetim kaydına yazılır
  const logs = h.db.all("SELECT action FROM audit_logs WHERE entity = 'tenant' AND entity_id = ?", s.B.id).map((x) => x.action);
  assert.ok(logs.includes('admin.tenant_suspend') && logs.includes('admin.tenant_activate'));
});

test('Rapor yetkisi olmayan kullanıcı işlem listesinde yalnızca kendi işlemlerini görür', async () => {
  await h.buy(admin, [h.device()]); // admin'in işlemi
  const res = await seller.get('/api/transactions');
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length >= 1);
  assert.ok(res.body.items.every((t) => t.user_id === s.A.seller));
});

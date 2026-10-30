// Abonelik: plan limitleri, modüller, süre dolumu ve ödeme
const { test } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

test('Stok limiti aşılınca yeni cihaz eklenemez', async () => {
  const p = h.plan('limit-dev', { maxDevices: 3 });
  const t = h.tenant('Limitli', p);
  h.user(t, 'lim@test.local', 'tenant_admin');
  const c = await h.login('lim@test.local');
  await h.buy(c, [h.device(), h.device()]);
  const over = await c.post('/api/purchases').send({ devices: [h.device(), h.device()], paymentMethod: 'cash' });
  assert.equal(over.status, 403);
  assert.equal(over.body.error.code, 'LIMIT_EXCEEDED');
  await h.buy(c, [h.device()]); // tam sınıra kadar izin var
  // Satılan cihaz limitten düşer
  const id = h.db.one('SELECT id FROM devices WHERE tenant_id = ? LIMIT 1', t).id;
  await c.post('/api/sales').send({ items: [{ deviceId: id, price: 1 }], paymentMethod: 'cash' });
  await h.buy(c, [h.device()]);
});

test('Kullanıcı limiti dolunca personel daveti yapılamaz', async () => {
  const p = h.plan('limit-user', { maxUsers: 2 });
  const t = h.tenant('Az Kullanıcılı', p);
  h.user(t, 'few@test.local', 'tenant_admin');
  const c = await h.login('few@test.local');
  assert.equal((await c.post('/api/business/staff/invite').send({ email: 'p1@test.local', role: 'user', permissions: ['stock.view'] })).status, 201);
  const res = await c.post('/api/business/staff/invite').send({ email: 'p2@test.local', role: 'user', permissions: [] });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'LIMIT_EXCEEDED');
});

test('Planda olmayan modül kullanılamaz', async () => {
  const p = h.plan('basic', { modules: ['stock', 'sales', 'reports'] });
  const t = h.tenant('Temel', p);
  h.user(t, 'basic@test.local', 'tenant_admin');
  const c = await h.login('basic@test.local');
  const { deviceIds: [id] } = await h.buy(c, [h.device()]);
  const trade = await c.post('/api/trades').send({ customerId: 1, incoming: [{ ...h.device(), value: 1000 }], outgoing: [{ deviceId: id, price: 5000 }], paymentMethod: 'cash' });
  assert.equal(trade.status, 403);
  assert.equal(trade.body.error.code, 'MODULE_NOT_IN_PLAN');
  assert.equal((await c.get('/api/reports/export?report=period&format=xlsx')).status, 403);
  assert.equal((await c.get('/api/stock-counts')).status, 403);
  assert.equal((await c.get('/api/reports/dashboard')).status, 200);
});

test('Süresi dolan abonelikte sistem salt okunur olur, yenileme yapılabilir', async () => {
  const p = h.plan('expiring');
  const t = h.tenant('Süresi Dolan', p);
  h.user(t, 'exp@test.local', 'tenant_admin');
  const c = await h.login('exp@test.local');
  await h.buy(c, [h.device()]);
  h.db.run("UPDATE subscriptions SET ends_at = '2020-01-01 00:00:00' WHERE tenant_id = ?", t);

  assert.equal((await c.get('/api/devices')).status, 200); // okuma serbest
  const w = await c.post('/api/purchases').send({ devices: [h.device()], paymentMethod: 'cash' });
  assert.equal(w.status, 402);
  assert.equal(w.body.error.code, 'SUBSCRIPTION_EXPIRED');
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.subscription.expired, true);

  // Başarısız ödeme kaydedilir, abonelik açılmaz
  const fail = await c.post('/api/business/subscription/checkout').send({ planId: p, cycle: 'monthly', paymentToken: 'tok_fail' });
  assert.equal(fail.status, 402);
  assert.equal(fail.body.error.code, 'PAYMENT_FAILED');
  // Başarılı ödeme aboneliği yeniler
  const ok = await c.post('/api/business/subscription/checkout').send({ planId: p, cycle: 'yearly', paymentToken: 'tok_success' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.amount, 1000);
  assert.equal((await c.post('/api/purchases').send({ devices: [h.device()], paymentMethod: 'cash' })).status, 201);

  const sub = await c.get('/api/business/subscription');
  assert.deepEqual(sub.body.payments.map((x) => x.status), ['succeeded', 'failed']);
  assert.equal(sub.body.current.subscription.billing_cycle, 'yearly');
  assert.ok(sub.body.current.daysLeft >= 364);
  assert.ok(sub.body.history.length >= 2);
});

test('Süper admin plan oluşturup işletmeye atayabilir', async () => {
  h.baseScenario();
  const sup = await h.login('super@test.local');
  const created = await sup.post('/api/admin/plans').send({ code: 'ozel', name: 'Özel', price_monthly: 50, price_yearly: 500, max_users: 1, max_devices: 5, modules: ['stock'] });
  assert.equal(created.status, 201);
  const t = await sup.post('/api/admin/tenants').send({ name: 'Yeni Bayi', adminName: 'Bayi Admin', adminEmail: 'bayi@test.local', adminPassword: 'Bayi1234', planId: created.body.plan.id, cycle: 'monthly' });
  assert.equal(t.status, 201);
  assert.equal(t.body.tenant.plan.max_devices, 5);
  const bayi = await h.login('bayi@test.local', 'Bayi1234');
  const me = await bayi.get('/api/auth/me');
  assert.deepEqual(me.body.subscription.plan.modules, ['stock']);
});

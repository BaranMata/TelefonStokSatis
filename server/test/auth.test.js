// Oturum, şifre yenileme, hesap kilitleme ve davet akışları
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let s;
before(() => {
  s = h.baseScenario();
  h.plan('trial', { trial: true });
});

const lastMailToken = (to) => {
  const m = h.db.one('SELECT body FROM mail_outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1', to);
  return m.body.match(/token=([a-f0-9]+)/)[1];
};

test('Oturum çerezi HttpOnly ve SameSite=Strict', async () => {
  const res = await h.client().post('/api/auth/login').send({ email: s.A.adminEmail, password: h.PASSWORD });
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.equal(res.body.user.password_hash, undefined);
});

test('5 hatalı denemeden sonra hesap geçici olarak kilitlenir', async () => {
  const email = 'lock@test.local';
  h.user(s.A.id, email, 'user', []);
  const c = h.client();
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login').send({ email, password: 'yanlis' })).status, 401);
  const locked = await c.post('/api/auth/login').send({ email, password: h.PASSWORD });
  assert.equal(locked.status, 423);
});

test('Var olmayan e-posta ile şifre yenileme aynı yanıtı verir (hesap sızdırmaz)', async () => {
  const a = await h.client().post('/api/auth/forgot-password').send({ email: 'yok@test.local' });
  const b = await h.client().post('/api/auth/forgot-password').send({ email: s.A.adminEmail });
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, b.body);
});

test('Şifre yenileme: token tek kullanımlık, eski oturumlar düşer', async () => {
  const email = 'reset@test.local';
  h.user(s.A.id, email, 'user', ['stock.view']);
  const old = await h.login(email);
  await h.client().post('/api/auth/forgot-password').send({ email });
  const token = lastMailToken(email);
  assert.equal((await h.client().post('/api/auth/reset-password').send({ token, password: 'kisa' })).status, 400);
  assert.equal((await h.client().post('/api/auth/reset-password').send({ token, password: 'YeniSifre9' })).status, 200);
  assert.equal((await h.client().post('/api/auth/reset-password').send({ token, password: 'BaskaSifre9' })).status, 400);
  assert.equal((await old.get('/api/devices')).status, 401);
  await h.login(email, 'YeniSifre9');
});

test('Profil şifre değişimi mevcut şifreyi doğrular', async () => {
  const email = 'pw@test.local';
  h.user(s.A.id, email, 'user', []);
  const c = await h.login(email);
  assert.equal((await c.put('/api/profile/password').send({ currentPassword: 'yanlis', newPassword: 'Yeni12345' })).status, 400);
  assert.equal((await c.put('/api/profile/password').send({ currentPassword: h.PASSWORD, newPassword: 'Yeni12345' })).status, 200);
  assert.equal((await c.get('/api/profile')).status, 200); // bu cihazdaki oturum yenilendi
  await h.login(email, 'Yeni12345');
});

test('Personel daveti kabul edilince atanan yetkilerle hesap oluşur', async () => {
  const admin = await h.login(s.A.adminEmail);
  const inv = await admin.post('/api/business/staff/invite').send({ email: 'yeni@test.local', role: 'user', permissions: ['stock.view', 'gecersiz.yetki'] });
  assert.equal(inv.status, 201);
  const token = lastMailToken('yeni@test.local');
  const info = await h.client().get(`/api/auth/invitation/${token}`);
  assert.equal(info.body.email, 'yeni@test.local');
  const c = h.client();
  const acc = await c.post('/api/auth/accept-invite').send({ token, fullName: 'Yeni Personel', password: 'Personel1' });
  assert.equal(acc.status, 201);
  assert.deepEqual(acc.body.user.permissions, ['stock.view']); // geçersiz yetki ayıklandı
  assert.equal(acc.body.user.tenant_id, s.A.id);
  assert.equal((await c.get('/api/devices')).status, 200);
  assert.equal((await h.client().post('/api/auth/accept-invite').send({ token, fullName: 'Tekrar', password: 'Personel1' })).status, 400);
});

test('Self servis kayıt yeni işletme ve ücretsiz deneme oluşturur', async () => {
  const c = h.client();
  const res = await c.post('/api/auth/register').send({ businessName: 'Çağrı İletişim', fullName: 'Çağrı Bey', email: 'cagri@test.local', password: 'Cagri1234' });
  assert.equal(res.status, 201);
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.user.role, 'tenant_admin');
  assert.equal(me.body.subscription.billing_cycle, 'trial');
  assert.equal(me.body.subscription.plan.is_trial, true);
  assert.equal(me.body.tenant.slug, 'cagri-iletisim');
});

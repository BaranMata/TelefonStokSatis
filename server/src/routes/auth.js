const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const subscription = require('../services/subscription');
const { audit } = require('../services/audit');
const { sendMail } = require('../services/mail');
const { issueSession, clearSession, authenticate } = require('../middleware/auth');
const { clockNow, AppError, now, addMinutes, randomToken, sha256, parseJson, validate, ah } = require('../utils/common');
const { password: passwordSchema, slugify } = require('../utils/schemas');

const router = express.Router();

// Kullanıcı bulunamadığında da karşılaştırma yapılabilmesi için sabit bir sahte hash
const DUMMY_HASH = bcrypt.hashSync('dummy-password-0', 10);

// Kaba kuvvet saldırılarına karşı IP bazlı sınırlama (hesap bazlı kilitleme ayrıca uygulanır)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.env === 'test',
  handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_REQUESTS', 'Çok fazla deneme yaptınız, biraz sonra tekrar deneyin')),
});

function publicUser(u) {
  return { id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, role: u.role, tenant_id: u.tenant_id, permissions: Array.isArray(u.permissions) ? u.permissions : parseJson(u.permissions, []) };
}

router.post(
  '/login',
  limiter,
  validate(z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) })),
  ah(async (req, res) => {
    const { email, password } = req.body;
    const user = db.one('SELECT * FROM users WHERE email = ?', email);
    const ts = now();
    if (user?.locked_until && user.locked_until > ts) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Çok sayıda hatalı deneme nedeniyle hesap geçici olarak kilitlendi. 15 dakika sonra tekrar deneyin.');
    }
    // Kullanıcı yoksa da hash karşılaştırması yapılır (zamanlama farkıyla e-posta tespiti zorlaşır)
    const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        const fails = user.failed_login_count + 1;
        const lock = fails >= config.maxFailedLogins ? addMinutes(clockNow(), config.lockMinutes) : null;
        db.run('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?', lock ? 0 : fails, lock, user.id);
        audit(req, 'auth.login_failed', { tenantId: user.tenant_id, userId: user.id, details: { locked: !!lock } });
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-posta veya şifre hatalı');
    }
    if (!user.is_active) throw new AppError(403, 'USER_INACTIVE', 'Hesabınız devre dışı bırakılmış');
    if (user.tenant_id) {
      const tenant = db.one('SELECT status FROM tenants WHERE id = ?', user.tenant_id);
      if (tenant.status !== 'active') throw new AppError(403, 'TENANT_INACTIVE', tenant.status === 'closed' ? 'İşletme hesabı kapatılmış' : 'İşletme hesabı askıya alınmış');
    }
    db.run('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', ts, user.id);
    issueSession(res, user);
    audit(req, 'auth.login', { tenantId: user.tenant_id, userId: user.id });
    res.json({ user: publicUser(user) });
  }),
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  const u = req.user;
  const result = { user: publicUser(u), tenant: null, subscription: null };
  if (u.tenant_id) {
    const s = subscription.getCurrent(u.tenant_id);
    result.tenant = { id: req.tenant.id, name: req.tenant.name, slug: req.tenant.slug };
    result.subscription = {
      plan: s.plan && { id: s.plan.id, name: s.plan.name, code: s.plan.code, modules: s.plan.modules, max_users: s.plan.max_users, max_devices: s.plan.max_devices, is_trial: s.plan.is_trial },
      billing_cycle: s.subscription?.billing_cycle,
      ends_at: s.subscription?.ends_at,
      expired: s.expired,
      daysLeft: s.daysLeft,
    };
  }
  res.json(result);
});

// Self servis kayıt: yeni işletme + işletme admini + ücretsiz deneme
router.post(
  '/register',
  limiter,
  validate(z.object({
    businessName: z.string().trim().min(2).max(120),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(30).optional(),
    password: passwordSchema,
  })),
  ah(async (req, res) => {
    const { businessName, fullName, email, phone, password } = req.body;
    if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new AppError(409, 'DUPLICATE', 'Bu e-posta adresiyle kayıtlı bir hesap var');
    const hash = await bcrypt.hash(password, 10);
    const user = db.tx(() => {
      const ts = now();
      let slug = slugify(businessName);
      if (db.one('SELECT id FROM tenants WHERE slug = ?', slug)) slug = `${slug}-${Date.now().toString(36)}`;
      const t = db.run('INSERT INTO tenants (name, slug, phone, email, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', businessName, slug, phone || null, email, 'active', ts, ts);
      const tenantId = Number(t.lastInsertRowid);
      const u = db.run(
        "INSERT INTO users (tenant_id, email, password_hash, full_name, phone, role, created_at, updated_at) VALUES (?,?,?,?,?, 'tenant_admin', ?, ?)",
        tenantId, email, hash, fullName, phone || null, ts, ts,
      );
      subscription.startTrial(tenantId);
      return db.one('SELECT * FROM users WHERE id = ?', Number(u.lastInsertRowid));
    });
    audit(req, 'tenant.register', { tenantId: user.tenant_id, userId: user.id, entity: 'tenant', entityId: user.tenant_id });
    issueSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/forgot-password',
  limiter,
  validate(z.object({ email: z.string().trim().email() })),
  (req, res) => {
    const user = db.one('SELECT * FROM users WHERE email = ? AND is_active = 1', req.body.email);
    if (user) {
      const token = randomToken();
      db.run('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?)', user.id, sha256(token), addMinutes(clockNow(), 60), now());
      sendMail(user.email, 'Şifre yenileme', `Merhaba ${user.full_name},\nŞifrenizi yenilemek için bağlantı (60 dk geçerli):\n/sifre-yenile?token=${token}`);
      audit(req, 'auth.password_reset_requested', { tenantId: user.tenant_id, userId: user.id });
    }
    // Hesabın var olup olmadığı dışarıya sızdırılmaz
    res.json({ ok: true, message: 'Bu e-posta kayıtlıysa şifre yenileme bağlantısı gönderildi.' });
  },
);

router.post(
  '/reset-password',
  limiter,
  validate(z.object({ token: z.string().min(10), password: passwordSchema })),
  ah(async (req, res) => {
    const row = db.one('SELECT * FROM password_resets WHERE token_hash = ?', sha256(req.body.token));
    if (!row || row.used_at || row.expires_at < now()) throw new AppError(400, 'INVALID_TOKEN', 'Bağlantı geçersiz veya süresi dolmuş');
    const hash = await bcrypt.hash(req.body.password, 10);
    db.tx(() => {
      db.run('UPDATE password_resets SET used_at = ? WHERE id = ?', now(), row.id);
      // token_version artırılarak eski tüm oturumlar geçersiz kılınır
      db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?', hash, now(), row.user_id);
    });
    const user = db.one('SELECT tenant_id FROM users WHERE id = ?', row.user_id);
    audit(req, 'auth.password_reset', { tenantId: user.tenant_id, userId: row.user_id });
    res.json({ ok: true });
  }),
);

function findInvitation(token) {
  const inv = db.one('SELECT i.*, t.name tenant_name FROM invitations i JOIN tenants t ON t.id = i.tenant_id WHERE i.token_hash = ?', sha256(token));
  if (!inv || inv.accepted_at || inv.revoked_at || inv.expires_at < now()) throw new AppError(400, 'INVALID_TOKEN', 'Davet bağlantısı geçersiz veya süresi dolmuş');
  return inv;
}

router.get('/invitation/:token', (req, res) => {
  const inv = findInvitation(req.params.token);
  res.json({ email: inv.email, full_name: inv.full_name, role: inv.role, tenant_name: inv.tenant_name });
});

router.post(
  '/accept-invite',
  limiter,
  validate(z.object({ token: z.string().min(10), fullName: z.string().trim().min(2).max(120), password: passwordSchema })),
  ah(async (req, res) => {
    const inv = findInvitation(req.body.token);
    if (db.one('SELECT id FROM users WHERE email = ?', inv.email)) throw new AppError(409, 'DUPLICATE', 'Bu e-posta ile zaten bir hesap var');
    const hash = await bcrypt.hash(req.body.password, 10);
    const user = db.tx(() => {
      const ts = now();
      const r = db.run(
        'INSERT INTO users (tenant_id, email, password_hash, full_name, role, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        inv.tenant_id, inv.email, hash, req.body.fullName, inv.role, inv.permissions, ts, ts,
      );
      db.run('UPDATE invitations SET accepted_at = ? WHERE id = ?', ts, inv.id);
      return db.one('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid));
    });
    audit(req, 'staff.invite_accepted', { tenantId: user.tenant_id, userId: user.id, entity: 'user', entityId: user.id });
    issueSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  }),
);

module.exports = router;
module.exports.publicUser = publicUser;

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const subscription = require('../services/subscription');
const backup = require('../services/backup');
const { audit } = require('../services/audit');
const { clockNow, AppError, now, validate, ah, paging, addDays } = require('../utils/common');
const { password, optText, id, slugify } = require('../utils/schemas');
const { MODULES } = require('../utils/permissions');

const router = express.Router();

// ------------------------------------------------------------ Kullanım istatistikleri
router.get('/stats', (req, res) => {
  const since30 = addDays(clockNow(), -30);
  const totals = {
    tenants: db.one('SELECT COUNT(*) c FROM tenants').c,
    activeTenants: db.one("SELECT COUNT(*) c FROM tenants WHERE status = 'active'").c,
    suspendedTenants: db.one("SELECT COUNT(*) c FROM tenants WHERE status = 'suspended'").c,
    closedTenants: db.one("SELECT COUNT(*) c FROM tenants WHERE status = 'closed'").c,
    users: db.one('SELECT COUNT(*) c FROM users WHERE tenant_id IS NOT NULL AND is_active = 1').c,
    devices: db.one('SELECT COUNT(*) c FROM devices').c,
    transactions30d: db.one('SELECT COUNT(*) c FROM transactions WHERE occurred_at >= ?', since30).c,
    revenue30d: db.one("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status = 'succeeded' AND created_at >= ?", since30).s,
    revenueTotal: db.one("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status = 'succeeded'").s,
    errors7d: db.one('SELECT COUNT(*) c FROM error_logs WHERE created_at >= ?', addDays(clockNow(), -7)).c,
  };
  const planDistribution = db.all(
    "SELECT p.name, COUNT(*) count FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.status IN ('active','expired') GROUP BY p.id ORDER BY count DESC",
  );
  const dailyActivity = db.all(
    'SELECT substr(occurred_at,1,10) day, COUNT(*) count FROM transactions WHERE occurred_at >= ? GROUP BY day ORDER BY day',
    since30,
  );
  res.json({ totals, planDistribution, dailyActivity });
});

// ------------------------------------------------------------ İşletmeler
function tenantSummary(t) {
  const s = subscription.getCurrent(t.id);
  const u = subscription.usage(t.id);
  const last = db.one('SELECT MAX(created_at) m FROM audit_logs WHERE tenant_id = ?', t.id).m;
  const txCount = db.one('SELECT COUNT(*) c FROM transactions WHERE tenant_id = ?', t.id).c;
  return {
    ...t,
    plan: s.plan && { id: s.plan.id, name: s.plan.name, max_users: s.plan.max_users, max_devices: s.plan.max_devices },
    subscription: s.subscription && { billing_cycle: s.subscription.billing_cycle, status: s.subscription.status, ends_at: s.subscription.ends_at, daysLeft: s.daysLeft },
    usage: { ...u, transactions: txCount },
    last_activity_at: last,
  };
}

router.get('/tenants', (req, res) => {
  const { q, status } = req.query;
  const where = [];
  const params = [];
  if (q) {
    where.push('(name LIKE ? OR email LIKE ? OR slug LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const rows = db.all(`SELECT * FROM tenants ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`, ...params);
  res.json({ items: rows.map(tenantSummary) });
});

router.get('/tenants/:id', (req, res) => {
  const t = db.one('SELECT * FROM tenants WHERE id = ?', Number(req.params.id));
  if (!t) throw new AppError(404, 'NOT_FOUND', 'İşletme bulunamadı');
  res.json({
    tenant: tenantSummary(t),
    admins: db.all("SELECT id, email, full_name, role, is_active, last_login_at FROM users WHERE tenant_id = ? ORDER BY role, id", t.id),
    subscriptions: db.all('SELECT s.*, p.name plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE tenant_id = ? ORDER BY s.id DESC', t.id),
    payments: db.all('SELECT p.*, pl.name plan_name FROM payments p JOIN plans pl ON pl.id = p.plan_id WHERE tenant_id = ? ORDER BY p.id DESC', t.id),
  });
});

const tenantFields = {
  name: z.string().trim().min(2).max(120),
  tax_no: optText(20),
  phone: optText(30),
  email: z.string().trim().email().optional().nullable(),
  address: optText(300),
};

router.post(
  '/tenants',
  validate(z.object({
    ...tenantFields,
    adminName: z.string().trim().min(2).max(120),
    adminEmail: z.string().trim().email(),
    adminPassword: password,
    planId: id,
    cycle: z.enum(['trial', 'monthly', 'yearly']),
  })),
  ah(async (req, res) => {
    const b = req.body;
    if (db.one('SELECT id FROM users WHERE email = ?', b.adminEmail)) throw new AppError(409, 'DUPLICATE', 'Admin e-postası zaten kayıtlı');
    const hash = await bcrypt.hash(b.adminPassword, 10);
    const tenantId = db.tx(() => {
      const ts = now();
      let slug = slugify(b.name);
      if (db.one('SELECT id FROM tenants WHERE slug = ?', slug)) slug = `${slug}-${Date.now().toString(36)}`;
      const r = db.run(
        "INSERT INTO tenants (name, slug, tax_no, phone, email, address, status, created_at, updated_at) VALUES (?,?,?,?,?,?, 'active', ?, ?)",
        b.name, slug, b.tax_no, b.phone, b.email || b.adminEmail, b.address, ts, ts,
      );
      const tid = Number(r.lastInsertRowid);
      db.run("INSERT INTO users (tenant_id, email, password_hash, full_name, role, created_at, updated_at) VALUES (?,?,?,?, 'tenant_admin', ?, ?)", tid, b.adminEmail, hash, b.adminName, ts, ts);
      subscription.activate(tid, b.planId, b.cycle);
      return tid;
    });
    audit(req, 'admin.tenant_create', { entity: 'tenant', entityId: tenantId, details: { name: b.name, planId: b.planId, cycle: b.cycle } });
    res.status(201).json({ tenant: tenantSummary(db.one('SELECT * FROM tenants WHERE id = ?', tenantId)) });
  }),
);

router.put('/tenants/:id', validate(z.object(tenantFields)), (req, res) => {
  const tid = Number(req.params.id);
  const b = req.body;
  const r = db.run('UPDATE tenants SET name = ?, tax_no = ?, phone = ?, email = ?, address = ?, updated_at = ? WHERE id = ?', b.name, b.tax_no, b.phone, b.email, b.address, now(), tid);
  if (!r.changes) throw new AppError(404, 'NOT_FOUND', 'İşletme bulunamadı');
  audit(req, 'admin.tenant_update', { entity: 'tenant', entityId: tid });
  res.json({ tenant: tenantSummary(db.one('SELECT * FROM tenants WHERE id = ?', tid)) });
});

router.patch(
  '/tenants/:id/status',
  validate(z.object({ status: z.enum(['active', 'suspended', 'closed']), reason: optText(300) })),
  (req, res) => {
    const tid = Number(req.params.id);
    const t = db.one('SELECT * FROM tenants WHERE id = ?', tid);
    if (!t) throw new AppError(404, 'NOT_FOUND', 'İşletme bulunamadı');
    if (t.status === 'closed' && req.body.status !== 'closed') {
      // Kapatılmış işletme yeniden açılabilir; bu bilinçli bir işlemdir ve günlüğe ayrıca yazılır
      audit(req, 'admin.tenant_reopen', { entity: 'tenant', entityId: tid });
    }
    db.run('UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?', req.body.status, now(), tid);
    audit(req, `admin.tenant_${req.body.status === 'active' ? 'activate' : req.body.status === 'suspended' ? 'suspend' : 'close'}`, {
      entity: 'tenant', entityId: tid, details: { from: t.status, to: req.body.status, reason: req.body.reason },
    });
    res.json({ tenant: tenantSummary(db.one('SELECT * FROM tenants WHERE id = ?', tid)) });
  },
);

// Manuel plan ataması (ör. havale ile ödeme alınan işletme için)
router.put(
  '/tenants/:id/subscription',
  validate(z.object({ planId: id, cycle: z.enum(['trial', 'monthly', 'yearly']) })),
  (req, res) => {
    const tid = Number(req.params.id);
    if (!db.one('SELECT id FROM tenants WHERE id = ?', tid)) throw new AppError(404, 'NOT_FOUND', 'İşletme bulunamadı');
    const subId = subscription.activate(tid, req.body.planId, req.body.cycle);
    audit(req, 'admin.subscription_assign', { entity: 'subscription', entityId: subId, details: { tenantId: tid, ...req.body } });
    res.json({ tenant: tenantSummary(db.one('SELECT * FROM tenants WHERE id = ?', tid)) });
  },
);

// ------------------------------------------------------------ Planlar ve limitler
const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_-]{2,30}$/, 'Kod küçük harf, rakam, - ve _ içerebilir'),
  name: z.string().trim().min(2).max(60),
  price_monthly: z.coerce.number().min(0),
  price_yearly: z.coerce.number().min(0),
  max_users: z.coerce.number().int().min(-1),
  max_devices: z.coerce.number().int().min(-1),
  modules: z.array(z.enum(Object.keys(MODULES))),
  is_trial: z.boolean().default(false),
  trial_days: z.coerce.number().int().min(0).max(365).default(0),
  is_active: z.boolean().default(true),
});

router.get('/plans', (req, res) => {
  const plans = db.all('SELECT * FROM plans ORDER BY is_trial DESC, price_monthly').map(subscription.planRow);
  for (const p of plans) p.tenant_count = db.one("SELECT COUNT(DISTINCT tenant_id) c FROM subscriptions WHERE plan_id = ? AND status IN ('active','expired')", p.id).c;
  res.json({ items: plans });
});

router.post('/plans', validate(planSchema), (req, res) => {
  const p = req.body;
  const r = db.run(
    'INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_devices, modules, is_trial, trial_days, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    p.code, p.name, p.price_monthly, p.price_yearly, p.max_users, p.max_devices, JSON.stringify(p.modules), p.is_trial ? 1 : 0, p.trial_days, p.is_active ? 1 : 0, now(),
  );
  audit(req, 'admin.plan_create', { entity: 'plan', entityId: Number(r.lastInsertRowid), details: p });
  res.status(201).json({ plan: subscription.planRow(db.one('SELECT * FROM plans WHERE id = ?', r.lastInsertRowid)) });
});

router.put('/plans/:id', validate(planSchema), (req, res) => {
  const p = req.body;
  const pid = Number(req.params.id);
  const r = db.run(
    'UPDATE plans SET code = ?, name = ?, price_monthly = ?, price_yearly = ?, max_users = ?, max_devices = ?, modules = ?, is_trial = ?, trial_days = ?, is_active = ? WHERE id = ?',
    p.code, p.name, p.price_monthly, p.price_yearly, p.max_users, p.max_devices, JSON.stringify(p.modules), p.is_trial ? 1 : 0, p.trial_days, p.is_active ? 1 : 0, pid,
  );
  if (!r.changes) throw new AppError(404, 'NOT_FOUND', 'Plan bulunamadı');
  audit(req, 'admin.plan_update', { entity: 'plan', entityId: pid, details: p });
  res.json({ plan: subscription.planRow(db.one('SELECT * FROM plans WHERE id = ?', pid)) });
});

// ------------------------------------------------------------ Günlükler
router.get('/audit-logs', (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  if (req.query.tenantId) { where.push('a.tenant_id = ?'); params.push(Number(req.query.tenantId)); }
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`%${req.query.action}%`); }
  if (req.query.from) { where.push('a.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.one(`SELECT COUNT(*) c FROM audit_logs a ${w}`, ...params).c;
  const items = db.all(
    `SELECT a.*, u.full_name user_name, u.email user_email, t.name tenant_name FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id LEFT JOIN tenants t ON t.id = a.tenant_id ${w}
     ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset,
  );
  res.json({ items, total, page, pageSize });
});

router.get('/error-logs', (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = [];
  const params = [];
  if (req.query.status) { where.push('e.status = ?'); params.push(Number(req.query.status)); }
  if (req.query.tenantId) { where.push('e.tenant_id = ?'); params.push(Number(req.query.tenantId)); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.one(`SELECT COUNT(*) c FROM error_logs e ${w}`, ...params).c;
  const items = db.all(
    `SELECT e.*, t.name tenant_name, u.email user_email FROM error_logs e LEFT JOIN tenants t ON t.id = e.tenant_id LEFT JOIN users u ON u.id = e.user_id ${w} ORDER BY e.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset,
  );
  res.json({ items, total, page, pageSize });
});

// ------------------------------------------------------------ Yedekleme
router.get('/backups', (req, res) => {
  res.json({ items: backup.listBackups(), history: db.all('SELECT b.*, u.email user_email FROM backup_logs b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.id DESC LIMIT 50') });
});

router.post('/backups', (req, res) => {
  const b = backup.createBackup('manual', req.user.id);
  audit(req, 'admin.backup_create', { details: b });
  res.status(201).json(b);
});

router.post('/backups/restore', validate(z.object({ fileName: z.string().min(1).max(100) })), (req, res) => {
  const result = backup.restoreBackup(req.body.fileName, req.user.id);
  audit(req, 'admin.backup_restore', { details: result });
  res.json(result);
});

module.exports = router;

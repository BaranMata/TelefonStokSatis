// İşletme Admini paneli: işletme profili, personel, faaliyet geçmişi, abonelik
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const subscription = require('../services/subscription');
const { audit } = require('../services/audit');
const { sendMail } = require('../services/mail');
const { clockNow, AppError, now, addDays, randomToken, sha256, parseJson, validate, ah, paging } = require('../utils/common');
const { optText, id } = require('../utils/schemas');
const { PERMISSIONS, sanitizePermissions } = require('../utils/permissions');

const router = express.Router();

// ------------------------------------------------------------ İşletme profili
router.get('/profile', (req, res) => {
  res.json({ tenant: db.one('SELECT * FROM tenants WHERE id = ?', req.tenantId) });
});

router.put(
  '/profile',
  validate(z.object({ name: z.string().trim().min(2).max(120), tax_no: optText(20), phone: optText(30), email: z.string().trim().email().optional().nullable(), address: optText(300) })),
  (req, res) => {
    const b = req.body;
    db.run('UPDATE tenants SET name = ?, tax_no = ?, phone = ?, email = ?, address = ?, updated_at = ? WHERE id = ?', b.name, b.tax_no, b.phone, b.email, b.address, now(), req.tenantId);
    audit(req, 'business.profile_update', { entity: 'tenant', entityId: req.tenantId });
    res.json({ tenant: db.one('SELECT * FROM tenants WHERE id = ?', req.tenantId) });
  },
);

// ------------------------------------------------------------ Personel
const staffRow = (u) => ({ ...u, permissions: parseJson(u.permissions, []), is_active: !!u.is_active });

router.get('/staff', (req, res) => {
  const items = db
    .all('SELECT id, email, full_name, phone, role, permissions, is_active, last_login_at, created_at FROM users WHERE tenant_id = ? ORDER BY role DESC, full_name', req.tenantId)
    .map(staffRow);
  const invitations = db.all(
    'SELECT i.id, i.email, i.full_name, i.role, i.permissions, i.expires_at, i.created_at, u.full_name invited_by FROM invitations i JOIN users u ON u.id = i.created_by WHERE i.tenant_id = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? ORDER BY i.id DESC',
    req.tenantId, now(),
  ).map(staffRow);
  res.json({ items, invitations, permissions: PERMISSIONS });
});

router.post(
  '/staff/invite',
  validate(z.object({
    email: z.string().trim().email(),
    full_name: optText(120),
    role: z.enum(['tenant_admin', 'user']),
    permissions: z.array(z.string()).default([]),
  })),
  (req, res) => {
    const b = req.body;
    if (req.subscription.expired) throw new AppError(402, 'SUBSCRIPTION_EXPIRED', 'Abonelik süreniz doldu, yeni personel davet edilemez');
    if (db.one('SELECT id FROM users WHERE email = ?', b.email)) throw new AppError(409, 'DUPLICATE', 'Bu e-posta ile kayıtlı bir kullanıcı var');
    if (db.one('SELECT id FROM invitations WHERE tenant_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?', req.tenantId, b.email, now())) {
      throw new AppError(409, 'DUPLICATE', 'Bu e-postaya bekleyen bir davet zaten var');
    }
    subscription.assertCanAddUser(req.tenantId);
    const token = randomToken();
    const perms = b.role === 'user' ? sanitizePermissions(b.permissions) : [];
    const r = db.run(
      'INSERT INTO invitations (tenant_id, email, full_name, role, permissions, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      req.tenantId, b.email, b.full_name, b.role, JSON.stringify(perms), sha256(token), addDays(clockNow(), 7), req.user.id, now(),
    );
    const link = `/davet?token=${token}`;
    sendMail(b.email, `${req.tenant.name} sizi davet ediyor`, `Telefon Stok ve Satış Takip Sistemi'ne katılmak için bağlantı (7 gün geçerli):\n${link}`);
    audit(req, 'staff.invite', { entity: 'invitation', entityId: Number(r.lastInsertRowid), details: { email: b.email, role: b.role, permissions: perms } });
    // Gerçek e-posta altyapısı olmadığından demo amaçlı bağlantı yanıtta da döndürülür
    res.status(201).json({ id: Number(r.lastInsertRowid), inviteLink: link });
  },
);

router.delete('/staff/invitations/:id', (req, res) => {
  const r = db.run('UPDATE invitations SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND accepted_at IS NULL', now(), Number(req.params.id), req.tenantId);
  if (!r.changes) throw new AppError(404, 'NOT_FOUND', 'Davet bulunamadı');
  audit(req, 'staff.invite_revoke', { entity: 'invitation', entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.put(
  '/staff/:id',
  validate(z.object({
    full_name: z.string().trim().min(2).max(120),
    phone: optText(30),
    role: z.enum(['tenant_admin', 'user']),
    permissions: z.array(z.string()).default([]),
    is_active: z.boolean(),
  })),
  (req, res) => {
    const uid = Number(req.params.id);
    // Kiracı filtresi: başka işletmenin kullanıcısı bulunamaz
    const target = db.one('SELECT * FROM users WHERE id = ? AND tenant_id = ?', uid, req.tenantId);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'Personel bulunamadı');
    const b = req.body;
    if (uid === req.user.id && (!b.is_active || b.role !== 'tenant_admin')) throw new AppError(400, 'SELF_LOCKOUT', 'Kendi yönetici yetkinizi kaldıramaz veya hesabınızı devre dışı bırakamazsınız');
    if (target.role === 'tenant_admin' && (b.role !== 'tenant_admin' || !b.is_active)) {
      const admins = db.one("SELECT COUNT(*) c FROM users WHERE tenant_id = ? AND role = 'tenant_admin' AND is_active = 1", req.tenantId).c;
      if (admins <= 1) throw new AppError(400, 'LAST_ADMIN', 'İşletmede en az bir aktif yönetici kalmalı');
    }
    if (!target.is_active && b.is_active) subscription.assertCanAddUser(req.tenantId);
    const perms = b.role === 'user' ? sanitizePermissions(b.permissions) : [];
    const oldPerms = parseJson(target.permissions, []);
    // Rol, yetki veya aktiflik değiştiyse mevcut oturumlar geçersiz kılınır
    const sessionReset = target.role !== b.role || !!target.is_active !== b.is_active || JSON.stringify(oldPerms) !== JSON.stringify(perms) ? 1 : 0;
    db.run(
      'UPDATE users SET full_name = ?, phone = ?, role = ?, permissions = ?, is_active = ?, token_version = token_version + ?, updated_at = ? WHERE id = ? AND tenant_id = ?',
      b.full_name, b.phone, b.role, JSON.stringify(perms), b.is_active ? 1 : 0, sessionReset, now(), uid, req.tenantId,
    );
    audit(req, target.is_active && !b.is_active ? 'staff.deactivate' : 'staff.update', {
      entity: 'user', entityId: uid, details: { role: { from: target.role, to: b.role }, permissions: perms, is_active: b.is_active },
    });
    res.json({ user: staffRow(db.one('SELECT id, email, full_name, phone, role, permissions, is_active, last_login_at, created_at FROM users WHERE id = ?', uid)) });
  },
);

// ------------------------------------------------------------ Faaliyet geçmişi
router.get('/activity', (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = ['a.tenant_id = ?'];
  const params = [req.tenantId];
  if (req.query.userId) { where.push('a.user_id = ?'); params.push(Number(req.query.userId)); }
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`${req.query.action}%`); }
  if (req.query.from) { where.push('a.created_at >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('a.created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }
  const w = where.join(' AND ');
  const total = db.one(`SELECT COUNT(*) c FROM audit_logs a WHERE ${w}`, ...params).c;
  const items = db.all(
    `SELECT a.*, u.full_name user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset,
  );
  res.json({ items, total, page, pageSize });
});

// ------------------------------------------------------------ Abonelik
router.get('/subscription', (req, res) => {
  const current = subscription.getCurrent(req.tenantId);
  res.json({
    current,
    usage: subscription.usage(req.tenantId),
    plans: db.all('SELECT * FROM plans WHERE is_active = 1 AND is_trial = 0 ORDER BY price_monthly').map(subscription.planRow),
    history: db.all('SELECT s.*, p.name plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? ORDER BY s.id DESC', req.tenantId),
    payments: db.all('SELECT p.*, pl.name plan_name FROM payments p JOIN plans pl ON pl.id = p.plan_id WHERE p.tenant_id = ? ORDER BY p.id DESC', req.tenantId),
  });
});

router.post(
  '/subscription/checkout',
  validate(z.object({ planId: id, cycle: z.enum(['monthly', 'yearly']), paymentToken: z.string().min(1).max(200) })),
  ah(async (req, res) => {
    const b = req.body;
    try {
      const result = await subscription.checkout(req.tenantId, b.planId, b.cycle, b.paymentToken);
      audit(req, 'subscription.purchase', { entity: 'payment', entityId: result.paymentId, details: { planId: b.planId, cycle: b.cycle, amount: result.amount } });
      res.status(201).json(result);
    } catch (e) {
      if (e.code === 'PAYMENT_FAILED') audit(req, 'subscription.payment_failed', { details: { planId: b.planId, cycle: b.cycle, reason: e.message } });
      throw e;
    }
  }),
);

module.exports = router;

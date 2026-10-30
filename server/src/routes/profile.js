const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../services/audit');
const { issueSession } = require('../middleware/auth');
const { AppError, now, validate, ah } = require('../utils/common');
const { password, optText } = require('../utils/schemas');
const { publicUser } = require('./auth');

const router = express.Router();

router.get('/', (req, res) => res.json({ user: publicUser(req.user) }));

router.put(
  '/',
  validate(z.object({ full_name: z.string().trim().min(2).max(120), phone: optText(30) })),
  (req, res) => {
    db.run('UPDATE users SET full_name = ?, phone = ?, updated_at = ? WHERE id = ?', req.body.full_name, req.body.phone, now(), req.user.id);
    audit(req, 'profile.update', { entity: 'user', entityId: req.user.id });
    res.json({ user: publicUser({ ...req.user, ...req.body }) });
  },
);

router.put(
  '/password',
  validate(z.object({ currentPassword: z.string().min(1), newPassword: password })),
  ah(async (req, res) => {
    const row = db.one('SELECT password_hash FROM users WHERE id = ?', req.user.id);
    if (!(await bcrypt.compare(req.body.currentPassword, row.password_hash))) throw new AppError(400, 'WRONG_PASSWORD', 'Mevcut şifre hatalı');
    const hash = await bcrypt.hash(req.body.newPassword, 10);
    db.run('UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?', hash, now(), req.user.id);
    // Diğer cihazlardaki oturumlar düşer; bu cihaz için yeni oturum verilir
    issueSession(res, { id: req.user.id, token_version: req.user.token_version + 1 });
    audit(req, 'profile.password_change', { entity: 'user', entityId: req.user.id });
    res.json({ ok: true });
  }),
);

module.exports = router;

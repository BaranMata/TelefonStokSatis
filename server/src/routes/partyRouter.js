// Müşteri ve tedarikçi kayıtları için ortak, kiracıya kapalı CRUD yönlendiricisi
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../services/audit');
const { requirePermission } = require('../middleware/auth');
const { AppError, now, validate, paging } = require('../utils/common');

/**
 * @param {object} o
 * @param {'customers'|'suppliers'} o.table
 * @param {string} o.entity   denetim kaydındaki varlık adı
 * @param {string} o.label    hata mesajlarında görünen ad
 * @param {object} o.fields   zod alan tanımları
 * @param {string[]} o.searchCols  arama yapılacak sütunlar
 * @param {string} o.managePerm    yazma yetkisi
 * @param {string[]} o.readPerms   okuma için yeterli yetkiler (ör. satış yapan müşteri seçebilmeli)
 * @param {string} o.fk       transactions tablosundaki yabancı anahtar
 */
function partyRouter({ table, entity, label, fields, searchCols, managePerm, readPerms, fk, orderBy }) {
  const router = express.Router();
  const schema = z.object(fields);
  const cols = Object.keys(fields);

  router.get('/', requirePermission(managePerm, ...readPerms), (req, res) => {
    const { page, pageSize, offset } = paging(req.query);
    const where = ['tenant_id = ?'];
    const params = [req.tenantId];
    if (req.query.q) {
      where.push(`(${searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
      params.push(...searchCols.map(() => `%${req.query.q}%`));
    }
    const w = where.join(' AND ');
    const total = db.one(`SELECT COUNT(*) c FROM ${table} WHERE ${w}`, ...params).c;
    const items = db.all(
      `SELECT p.*, (SELECT COUNT(*) FROM transactions t WHERE t.${fk} = p.id AND t.tenant_id = p.tenant_id) tx_count
       FROM ${table} p WHERE ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      ...params, pageSize, offset,
    );
    res.json({ items, total, page, pageSize });
  });

  function find(req) {
    const row = db.one(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`, Number(req.params.id), req.tenantId);
    if (!row) throw new AppError(404, 'NOT_FOUND', `${label} bulunamadı`);
    return row;
  }

  router.get('/:id', requirePermission(managePerm, ...readPerms), (req, res) => {
    const row = find(req);
    const transactions = db.all(
      `SELECT t.*, u.full_name user_name FROM transactions t JOIN users u ON u.id = t.user_id WHERE t.${fk} = ? AND t.tenant_id = ? ORDER BY t.occurred_at DESC`,
      row.id, req.tenantId,
    );
    res.json({ item: row, transactions });
  });

  router.post('/', requirePermission(managePerm), validate(schema), (req, res) => {
    const ts = now();
    const r = db.run(
      `INSERT INTO ${table} (tenant_id, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
      req.tenantId, ...cols.map((c) => req.body[c] ?? null), ts, ts,
    );
    audit(req, `${entity}.create`, { entity, entityId: Number(r.lastInsertRowid) });
    res.status(201).json({ item: db.one(`SELECT * FROM ${table} WHERE id = ?`, r.lastInsertRowid) });
  });

  router.put('/:id', requirePermission(managePerm), validate(schema), (req, res) => {
    const row = find(req);
    db.run(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND tenant_id = ?`,
      ...cols.map((c) => req.body[c] ?? null), now(), row.id, req.tenantId,
    );
    audit(req, `${entity}.update`, { entity, entityId: row.id });
    res.json({ item: db.one(`SELECT * FROM ${table} WHERE id = ?`, row.id) });
  });

  router.delete('/:id', requirePermission(managePerm), (req, res) => {
    const row = find(req);
    const used = db.one(`SELECT COUNT(*) c FROM transactions WHERE ${fk} = ? AND tenant_id = ?`, row.id, req.tenantId).c;
    if (used) throw new AppError(409, 'IN_USE', `${label} işlem geçmişine sahip olduğu için silinemez`);
    if (table === 'customers') db.run('UPDATE devices SET reserved_for = NULL WHERE reserved_for = ? AND tenant_id = ?', row.id, req.tenantId);
    db.run(`DELETE FROM ${table} WHERE id = ? AND tenant_id = ?`, row.id, req.tenantId);
    audit(req, `${entity}.delete`, { entity, entityId: row.id, details: { name: row.full_name || row.name } });
    res.json({ ok: true });
  });

  return router;
}

module.exports = partyRouter;

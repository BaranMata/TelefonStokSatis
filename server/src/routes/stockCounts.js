// Stok sayımı: sayım oturumu açılır, cihazlar okutulur, kapanışta eksik / fazla listesi çıkar.
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../services/audit');
const { movement } = require('../services/inventory');
const { requirePermission, requireModule } = require('../middleware/auth');
const { AppError, now, validate } = require('../utils/common');
const { optText } = require('../utils/schemas');

const router = express.Router();
router.use(requireModule('stock_count'), requirePermission('stock.count'));

function find(req) {
  const c = db.one('SELECT sc.*, u.full_name started_by_name FROM stock_counts sc JOIN users u ON u.id = sc.started_by WHERE sc.id = ? AND sc.tenant_id = ?', Number(req.params.id), req.tenantId);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Sayım bulunamadı');
  return c;
}

// Sayımda bulunması beklenen cihazlar: satılmamış olanlar
const EXPECTED = "SELECT id, brand, model, storage, color, imei, barcode, status FROM devices WHERE tenant_id = ? AND status <> 'sold'";

router.get('/', (req, res) => {
  res.json({ items: db.all('SELECT sc.*, u.full_name started_by_name FROM stock_counts sc JOIN users u ON u.id = sc.started_by WHERE sc.tenant_id = ? ORDER BY sc.id DESC', req.tenantId) });
});

router.post('/', validate(z.object({ note: optText(200) })), (req, res) => {
  if (db.one("SELECT id FROM stock_counts WHERE tenant_id = ? AND status = 'open'", req.tenantId)) throw new AppError(409, 'COUNT_OPEN', 'Zaten açık bir sayım var; önce onu kapatın');
  const expected = db.one("SELECT COUNT(*) c FROM devices WHERE tenant_id = ? AND status <> 'sold'", req.tenantId).c;
  const r = db.run("INSERT INTO stock_counts (tenant_id, status, note, expected, started_by, started_at) VALUES (?, 'open', ?, ?, ?, ?)", req.tenantId, req.body.note, expected, req.user.id, now());
  audit(req, 'stock_count.start', { entity: 'stock_count', entityId: Number(r.lastInsertRowid) });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.get('/:id', (req, res) => {
  const c = find(req);
  const scans = db.all(
    'SELECT s.*, d.brand, d.model, d.storage, d.imei, d.status device_status FROM stock_count_scans s LEFT JOIN devices d ON d.id = s.device_id WHERE s.count_id = ? AND s.tenant_id = ? ORDER BY s.id DESC',
    c.id, req.tenantId,
  );
  let missing = [];
  if (c.status === 'open') {
    const scanned = new Set(scans.filter((s) => s.device_id).map((s) => s.device_id));
    missing = db.all(EXPECTED, req.tenantId).filter((d) => !scanned.has(d.id));
  } else {
    missing = db.all(
      "SELECT d.id, d.brand, d.model, d.storage, d.color, d.imei, d.barcode, d.status FROM stock_movements m JOIN devices d ON d.id = m.device_id WHERE m.tenant_id = ? AND m.type = 'count_missing' AND m.note = ?",
      req.tenantId, `Sayım #${c.id}`,
    );
  }
  res.json({ item: c, scans, missing });
});

router.post('/:id/scan', validate(z.object({ code: z.string().trim().min(3).max(60) })), (req, res) => {
  const c = find(req);
  if (c.status !== 'open') throw new AppError(409, 'COUNT_CLOSED', 'Sayım kapatılmış');
  const code = req.body.code;
  const d = db.one('SELECT * FROM devices WHERE tenant_id = ? AND (imei = ? OR barcode = ? OR serial_no = ?)', req.tenantId, code, code.toUpperCase(), code);
  const result = !d ? 'unknown' : d.status === 'sold' ? 'not_in_stock' : 'ok';
  if (d && db.one('SELECT id FROM stock_count_scans WHERE count_id = ? AND device_id = ?', c.id, d.id)) {
    throw new AppError(409, 'ALREADY_SCANNED', `${d.brand} ${d.model} bu sayımda zaten okutuldu`);
  }
  db.run(
    'INSERT INTO stock_count_scans (tenant_id, count_id, code, device_id, result, scanned_by, created_at) VALUES (?,?,?,?,?,?,?)',
    req.tenantId, c.id, code, d?.id ?? null, result, req.user.id, now(),
  );
  res.status(201).json({ result, device: d ? { id: d.id, brand: d.brand, model: d.model, storage: d.storage, imei: d.imei, status: d.status } : null });
});

router.post('/:id/close', (req, res) => {
  const c = find(req);
  if (c.status !== 'open') throw new AppError(409, 'COUNT_CLOSED', 'Sayım zaten kapatılmış');
  const summary = db.tx(() => {
    const scans = db.all('SELECT * FROM stock_count_scans WHERE count_id = ?', c.id);
    const scanned = new Set(scans.filter((s) => s.result === 'ok').map((s) => s.device_id));
    const expected = db.all(EXPECTED, req.tenantId);
    const missing = expected.filter((d) => !scanned.has(d.id));
    for (const d of expected) {
      if (scanned.has(d.id)) movement(req.tenantId, d.id, 'count_found', d.status, d.status, { userId: req.user.id, note: `Sayım #${c.id}` });
      else movement(req.tenantId, d.id, 'count_missing', d.status, d.status, { userId: req.user.id, note: `Sayım #${c.id}` });
    }
    const s = { expected: expected.length, found: scanned.size, missing: missing.length, unexpected: scans.filter((x) => x.result !== 'ok').length };
    db.run("UPDATE stock_counts SET status = 'closed', expected = ?, found = ?, missing = ?, unexpected = ?, closed_at = ? WHERE id = ?", s.expected, s.found, s.missing, s.unexpected, now(), c.id);
    return s;
  });
  audit(req, 'stock_count.close', { entity: 'stock_count', entityId: c.id, details: summary });
  res.json(summary);
});

module.exports = router;

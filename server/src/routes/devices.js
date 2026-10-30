const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { audit } = require('../services/audit');
const { movement } = require('../services/inventory');
const { requirePermission, requireModule } = require('../middleware/auth');
const { AppError, now, money, validate, paging } = require('../utils/common');
const { imei, optText, price, id } = require('../utils/schemas');

const router = express.Router();
router.use(requireModule('stock'));

const canView = requirePermission('stock.view', 'sale.create', 'trade.create', 'stock.edit');

function withProfit(d) {
  const profit = d.status === 'sold' && d.sale_price != null ? money(d.sale_price - d.purchase_price) : null;
  return { ...d, profit, margin: profit != null && d.sale_price > 0 ? Math.round((profit / d.sale_price) * 1000) / 10 : null };
}

function find(req) {
  const d = db.one(
    'SELECT d.*, c.full_name reserved_for_name FROM devices d LEFT JOIN customers c ON c.id = d.reserved_for WHERE d.id = ? AND d.tenant_id = ?',
    Number(req.params.id), req.tenantId,
  );
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Cihaz bulunamadı');
  return d;
}

router.get('/', canView, (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  const where = ['d.tenant_id = ?'];
  const params = [req.tenantId];
  const { q, status, brand, model, condition } = req.query;
  if (q) {
    where.push('(d.imei LIKE ? OR d.barcode = ? OR d.serial_no LIKE ? OR d.brand LIKE ? OR d.model LIKE ?)');
    params.push(`%${q}%`, q, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    const list = String(status).split(',').filter((s) => ['in_stock', 'reserved', 'sold'].includes(s));
    if (list.length) {
      where.push(`d.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
  }
  if (brand) { where.push('d.brand = ?'); params.push(brand); }
  if (model) { where.push('d.model = ?'); params.push(model); }
  if (condition) { where.push('d.condition = ?'); params.push(condition); }
  const w = where.join(' AND ');
  const total = db.one(`SELECT COUNT(*) c FROM devices d WHERE ${w}`, ...params).c;
  const items = db.all(
    `SELECT d.*, c.full_name reserved_for_name FROM devices d LEFT JOIN customers c ON c.id = d.reserved_for WHERE ${w} ORDER BY d.updated_at DESC, d.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, offset,
  );
  const summary = db.one(
    `SELECT COUNT(*) count, COALESCE(SUM(CASE WHEN d.status <> 'sold' THEN d.purchase_price END),0) stock_cost FROM devices d WHERE ${w}`,
    ...params,
  );
  res.json({ items: items.map(withProfit), total, page, pageSize, summary });
});

// Marka / model listeleri (form ve filtre önerileri için)
router.get('/meta/brands', canView, (req, res) => {
  res.json({
    brands: db.all('SELECT brand, COUNT(*) count FROM devices WHERE tenant_id = ? GROUP BY brand ORDER BY brand', req.tenantId),
    models: db.all('SELECT brand, model, COUNT(*) count FROM devices WHERE tenant_id = ? GROUP BY brand, model ORDER BY brand, model', req.tenantId),
  });
});

// IMEI, barkod veya seri no ile hızlı arama (okuyucu ile tarama)
router.get('/lookup', canView, (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) throw new AppError(400, 'VALIDATION_ERROR', 'Kod girin');
  const d = db.one(
    'SELECT d.*, c.full_name reserved_for_name FROM devices d LEFT JOIN customers c ON c.id = d.reserved_for WHERE d.tenant_id = ? AND (d.imei = ? OR d.barcode = ? OR d.serial_no = ?)',
    req.tenantId, code, code.toUpperCase(), code,
  );
  if (!d) throw new AppError(404, 'NOT_FOUND', `"${code}" ile eşleşen cihaz yok`);
  res.json({ item: withProfit(d) });
});

// Barkod etiketi yazdırmak için toplu cihaz bilgisi
router.get('/labels', requirePermission('stock.view', 'stock.edit'), requireModule('barcode'), (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => n > 0).slice(0, 500);
  if (!ids.length) return res.json({ items: [] });
  const items = db.all(
    `SELECT id, brand, model, storage, color, imei, barcode, list_price FROM devices WHERE tenant_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
    req.tenantId, ...ids,
  );
  res.json({ items });
});

router.get('/:id', canView, (req, res) => {
  const d = find(req);
  const movements = db.all(
    `SELECT m.*, u.full_name user_name, t.type tx_type FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
     LEFT JOIN transactions t ON t.id = m.transaction_id WHERE m.device_id = ? AND m.tenant_id = ? ORDER BY m.id DESC`,
    d.id, req.tenantId,
  );
  const transactions = db.all(
    `SELECT t.id, t.type, t.occurred_at, i.direction, i.unit_price, i.unit_cost, c.full_name customer_name, s.name supplier_name
     FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN suppliers s ON s.id = t.supplier_id
     WHERE i.device_id = ? AND i.tenant_id = ? ORDER BY t.occurred_at DESC`,
    d.id, req.tenantId,
  );
  res.json({ item: withProfit(d), movements, transactions });
});

router.put(
  '/:id',
  requirePermission('stock.edit'),
  validate(z.object({
    brand: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(100),
    storage: optText(20),
    color: optText(40),
    imei,
    serial_no: optText(60),
    condition: z.enum(['new', 'used', 'refurbished']),
    list_price: price.optional().nullable(),
    notes: optText(500),
    version: z.coerce.number().int(),
  })),
  (req, res) => {
    const d = find(req);
    const b = req.body;
    // İyimser kilitleme: başkası arada güncellediyse 409
    const r = db.run(
      `UPDATE devices SET brand = ?, model = ?, storage = ?, color = ?, imei = ?, serial_no = ?, condition = ?, list_price = ?, notes = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND version = ?`,
      b.brand, b.model, b.storage, b.color, b.imei, b.serial_no, b.condition, b.list_price ?? null, b.notes, now(), d.id, req.tenantId, b.version,
    );
    if (!r.changes) throw new AppError(409, 'STALE_VERSION', 'Cihaz siz düzenlerken başka biri tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
    const changed = Object.keys(b).filter((k) => k !== 'version' && (b[k] ?? null) !== (d[k] ?? null));
    movement(req.tenantId, d.id, 'update', d.status, d.status, { userId: req.user.id, note: `Güncellenen alanlar: ${changed.join(', ') || '-'}` });
    audit(req, 'device.update', { entity: 'device', entityId: d.id, details: { changed } });
    res.json({ item: withProfit(find(req)) });
  },
);

router.post(
  '/:id/reserve',
  requirePermission('stock.edit'),
  validate(z.object({ customerId: id.optional().nullable(), note: optText(200) })),
  (req, res) => {
    const d = find(req);
    if (req.body.customerId && !db.one('SELECT id FROM customers WHERE id = ? AND tenant_id = ?', req.body.customerId, req.tenantId)) {
      throw new AppError(400, 'INVALID_REFERENCE', 'Müşteri bulunamadı');
    }
    db.tx(() => {
      const r = db.run(
        "UPDATE devices SET status = 'reserved', reserved_for = ?, reserved_note = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'in_stock'",
        req.body.customerId ?? null, req.body.note, now(), d.id, req.tenantId,
      );
      if (!r.changes) throw new AppError(409, 'DEVICE_NOT_AVAILABLE', 'Yalnızca stoktaki cihaz rezerve edilebilir');
      movement(req.tenantId, d.id, 'reserve', 'in_stock', 'reserved', { userId: req.user.id, note: req.body.note });
    });
    audit(req, 'device.reserve', { entity: 'device', entityId: d.id, details: { customerId: req.body.customerId } });
    res.json({ item: withProfit(find(req)) });
  },
);

router.post('/:id/unreserve', requirePermission('stock.edit'), (req, res) => {
  const d = find(req);
  db.tx(() => {
    const r = db.run(
      "UPDATE devices SET status = 'in_stock', reserved_for = NULL, reserved_note = NULL, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'reserved'",
      now(), d.id, req.tenantId,
    );
    if (!r.changes) throw new AppError(409, 'DEVICE_NOT_AVAILABLE', 'Cihaz rezerve durumda değil');
    movement(req.tenantId, d.id, 'unreserve', 'reserved', 'in_stock', { userId: req.user.id });
  });
  audit(req, 'device.unreserve', { entity: 'device', entityId: d.id });
  res.json({ item: withProfit(find(req)) });
});

module.exports = router;

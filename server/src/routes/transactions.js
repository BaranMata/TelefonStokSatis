// Alış, satış ve takas işlemleri
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const subscription = require('../services/subscription');
const inventory = require('../services/inventory');
const exporter = require('../services/exporter');
const { audit } = require('../services/audit');
const { transactionFilter, describeFilters, TYPE_LABELS, PAYMENT_LABELS, PAYMENT_STATUS_LABELS } = require('../services/filters');
const { requirePermission, requireModule } = require('../middleware/auth');
const { AppError, money, validate, paging, ah } = require('../utils/common');
const { deviceInput, paymentMethod, dateTime, price, id, optText } = require('../utils/schemas');

const router = express.Router();

const normalizeDate = (s) => (s ? (s.length === 10 ? `${s} 12:00:00` : s.length === 16 ? `${s}:00` : s) : undefined);

// ------------------------------------------------------------ Alış (tekli / toplu stok girişi)
const purchaseSchema = z
  .object({
    supplierId: id.optional().nullable(),
    customerId: id.optional().nullable(), // bireysel kişiden alım
    devices: z.array(deviceInput.extend({ cost: price })).min(1).max(500),
    paymentMethod,
    paidAmount: price.optional().nullable(),
    occurredAt: dateTime,
    notes: optText(500),
  })
  .refine((b) => !(b.supplierId && b.customerId), 'Tedarikçi veya müşteriden yalnızca biri seçilebilir');

router.post('/purchases', requireModule('stock'), requirePermission('purchase.create'), validate(purchaseSchema), (req, res) => {
  const b = req.body;
  const tid = req.tenantId;
  const result = db.tx(() => {
    inventory.ensureParty(tid, 'suppliers', b.supplierId, 'Tedarikçi');
    inventory.ensureParty(tid, 'customers', b.customerId, 'Müşteri');
    inventory.ensureNewImeis(tid, b.devices);
    subscription.assertCanAddDevices(tid, b.devices.length);
    const txId = inventory.insertTransaction(tid, req.user.id, { type: 'purchase', supplierId: b.supplierId, customerId: b.customerId, paymentMethod: b.paymentMethod, occurredAt: normalizeDate(b.occurredAt), notes: b.notes });
    const deviceIds = b.devices.map((d) => inventory.addDevice(tid, req.user.id, d, { cost: d.cost, transactionId: txId, movementType: 'purchase_in' }));
    inventory.finalizeTransaction(txId, b.paidAmount);
    return { transactionId: txId, deviceIds };
  });
  audit(req, 'purchase.create', { entity: 'transaction', entityId: result.transactionId, details: { devices: result.deviceIds.length } });
  res.status(201).json(result);
});

// ------------------------------------------------------------ Satış
const saleSchema = z.object({
  customerId: id.optional().nullable(),
  items: z.array(z.object({ deviceId: id, price })).min(1).max(100),
  paymentMethod,
  paidAmount: price.optional().nullable(),
  occurredAt: dateTime,
  notes: optText(500),
});

router.post('/sales', requireModule('sales'), requirePermission('sale.create'), validate(saleSchema), (req, res) => {
  const b = req.body;
  const tid = req.tenantId;
  if (new Set(b.items.map((i) => i.deviceId)).size !== b.items.length) throw new AppError(400, 'VALIDATION_ERROR', 'Aynı cihaz listede iki kez var');
  const result = db.tx(() => {
    inventory.ensureParty(tid, 'customers', b.customerId, 'Müşteri');
    const txId = inventory.insertTransaction(tid, req.user.id, { type: 'sale', customerId: b.customerId, paymentMethod: b.paymentMethod, occurredAt: normalizeDate(b.occurredAt), notes: b.notes });
    const lines = b.items.map((it) => inventory.sellDevice(tid, req.user.id, it, { transactionId: txId, customerId: b.customerId, movementType: 'sale_out' }));
    inventory.finalizeTransaction(txId, b.paidAmount);
    const revenue = lines.reduce((s, l) => s + l.price, 0);
    const cost = lines.reduce((s, l) => s + l.cost, 0);
    return { transactionId: txId, revenue: money(revenue), cost: money(cost), profit: money(revenue - cost) };
  });
  audit(req, 'sale.create', { entity: 'transaction', entityId: result.transactionId, details: { devices: b.items.map((i) => i.deviceId), revenue: result.revenue } });
  res.status(201).json(result);
});

// ------------------------------------------------------------ Takas
// Müşteri cihaz(lar)ını takas değeriyle verir, stoktan cihaz(lar) alır; fark takas bedelidir.
const tradeSchema = z.object({
  customerId: id,
  incoming: z.array(deviceInput.extend({ value: price })).min(1).max(20),
  outgoing: z.array(z.object({ deviceId: id, price })).min(1).max(20),
  paymentMethod,
  paidAmount: price.optional().nullable(),
  occurredAt: dateTime,
  notes: optText(500),
});

router.post('/trades', requireModule('trade'), requirePermission('trade.create'), validate(tradeSchema), (req, res) => {
  const b = req.body;
  const tid = req.tenantId;
  const result = db.tx(() => {
    inventory.ensureParty(tid, 'customers', b.customerId, 'Müşteri');
    inventory.ensureNewImeis(tid, b.incoming);
    const net = b.incoming.length - b.outgoing.length;
    if (net > 0) subscription.assertCanAddDevices(tid, net);
    const txId = inventory.insertTransaction(tid, req.user.id, { type: 'trade', customerId: b.customerId, paymentMethod: b.paymentMethod, occurredAt: normalizeDate(b.occurredAt), notes: b.notes });
    // Önce çıkan cihazlar satılır (müsait değilse işlem burada geri alınır), sonra gelen cihazlar stoka alınır
    const lines = b.outgoing.map((it) => inventory.sellDevice(tid, req.user.id, it, { transactionId: txId, customerId: b.customerId, movementType: 'trade_out' }));
    const incomingIds = b.incoming.map((d) => inventory.addDevice(tid, req.user.id, d, { cost: d.value, transactionId: txId, movementType: 'trade_in' }));
    inventory.finalizeTransaction(txId, b.paidAmount);
    const tx = db.one('SELECT net_amount FROM transactions WHERE id = ?', txId);
    const revenue = lines.reduce((s, l) => s + l.price, 0);
    const cost = lines.reduce((s, l) => s + l.cost, 0);
    return { transactionId: txId, incomingIds, tradeDifference: tx.net_amount, profit: money(revenue - cost) };
  });
  audit(req, 'trade.create', { entity: 'transaction', entityId: result.transactionId, details: { incoming: result.incomingIds, outgoing: b.outgoing.map((o) => o.deviceId), difference: result.tradeDifference } });
  res.status(201).json(result);
});

// ------------------------------------------------------------ Listeleme, detay, dışa aktarma
const canList = requirePermission('report.view', 'sale.create', 'purchase.create', 'trade.create');

function listTransactions(tenantId, q, limit, offset) {
  const f = transactionFilter(tenantId, q);
  const total = db.one(`SELECT COUNT(*) c FROM transactions t WHERE ${f.where}`, ...f.params).c;
  const items = db.all(
    `SELECT t.*, u.full_name user_name, c.full_name customer_name, s.name supplier_name,
       (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id AND i.direction = 'in') items_in,
       (SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id AND i.direction = 'out') items_out,
       (SELECT COALESCE(SUM(i.unit_price - i.unit_cost),0) FROM transaction_items i WHERE i.transaction_id = t.id AND i.direction = 'out') profit,
       (SELECT group_concat(d.brand || ' ' || d.model, ', ') FROM transaction_items i JOIN devices d ON d.id = i.device_id WHERE i.transaction_id = t.id) products
     FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN suppliers s ON s.id = t.supplier_id
     WHERE ${f.where} ORDER BY t.occurred_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    ...f.params, limit, offset,
  );
  const sums = db.one(
    `SELECT COALESCE(SUM(t.total_in),0) total_in, COALESCE(SUM(t.total_out),0) total_out,
       COALESCE((SELECT SUM(i.unit_price - i.unit_cost) FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id WHERE i.direction = 'out' AND ${f.where}),0) profit
     FROM transactions t WHERE ${f.where}`,
    ...f.params, ...f.params,
  );
  return { items, total, sums };
}

router.get('/transactions', canList, (req, res) => {
  const { page, pageSize, offset } = paging(req.query);
  // Rapor yetkisi olmayan kullanıcı yalnızca kendi işlemlerini görür
  const q = { ...req.query };
  if (req.user.role === 'user' && !req.user.permissions.includes('report.view')) q.userId = req.user.id;
  const { items, total, sums } = listTransactions(req.tenantId, q, pageSize, offset);
  res.json({ items, total, page, pageSize, sums });
});

router.get(
  '/transactions/export',
  requirePermission('report.export'),
  requireModule('export'),
  ah(async (req, res) => {
    const { items, sums } = listTransactions(req.tenantId, req.query, 5000, 0);
    const users = db.all('SELECT id, full_name FROM users WHERE tenant_id = ?', req.tenantId);
    await exporter.send(res, req.query.format, {
      title: 'İşlem Listesi',
      subtitle: describeFilters(req.query, users),
      columns: [
        { key: 'id', header: 'No', width: 6, type: 'number' },
        { key: 'occurred_at', header: 'Tarih', width: 16 },
        { key: 'type_label', header: 'Tür', width: 8 },
        { key: 'party', header: 'Müşteri / Tedarikçi', width: 20 },
        { key: 'products', header: 'Ürünler', width: 30 },
        { key: 'total_in', header: 'Giren değer', width: 12, type: 'money' },
        { key: 'total_out', header: 'Satış tutarı', width: 12, type: 'money' },
        { key: 'profit', header: 'Kâr', width: 11, type: 'money' },
        { key: 'payment', header: 'Ödeme', width: 12 },
        { key: 'user_name', header: 'Kullanıcı', width: 14 },
      ],
      rows: items.map((t) => ({
        ...t,
        type_label: TYPE_LABELS[t.type],
        party: t.customer_name || t.supplier_name || '-',
        payment: `${PAYMENT_LABELS[t.payment_method]} / ${PAYMENT_STATUS_LABELS[t.payment_status]}`,
      })),
      totals: { total_in: sums.total_in, total_out: sums.total_out, profit: sums.profit },
    }, 'islemler');
    audit(req, 'report.export', { details: { report: 'transactions', format: req.query.format } });
  }),
);

router.get('/transactions/:id', canList, (req, res) => {
  const t = db.one(
    `SELECT t.*, u.full_name user_name, c.full_name customer_name, c.phone customer_phone, s.name supplier_name FROM transactions t
     JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN suppliers s ON s.id = t.supplier_id
     WHERE t.id = ? AND t.tenant_id = ?`,
    Number(req.params.id), req.tenantId,
  );
  if (!t) throw new AppError(404, 'NOT_FOUND', 'İşlem bulunamadı');
  if (req.user.role === 'user' && !req.user.permissions.includes('report.view') && t.user_id !== req.user.id) throw new AppError(404, 'NOT_FOUND', 'İşlem bulunamadı');
  const items = db.all(
    `SELECT i.*, d.brand, d.model, d.storage, d.color, d.imei, d.barcode, (i.unit_price - i.unit_cost) profit
     FROM transaction_items i JOIN devices d ON d.id = i.device_id WHERE i.transaction_id = ? AND i.tenant_id = ?`,
    t.id, req.tenantId,
  );
  res.json({ item: t, items });
});

module.exports = router;

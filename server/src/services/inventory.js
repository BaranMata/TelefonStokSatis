// Stok ve işlem iş kuralları. Tüm fonksiyonlar db.tx() içinden çağrılmak üzere tasarlanmıştır.
const db = require('../db');
const { AppError, now, money } = require('../utils/common');

function movement(tenantId, deviceId, type, fromStatus, toStatus, { transactionId = null, userId = null, note = null } = {}) {
  db.run(
    'INSERT INTO stock_movements (tenant_id, device_id, type, from_status, to_status, transaction_id, user_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    tenantId, deviceId, type, fromStatus, toStatus, transactionId, userId, note, now(),
  );
}

/**
 * Cihazı stoka ekler; barkod cihaz kimliğinden türetilir (TS + 8 hane, Code128 uyumlu).
 * Aynı IMEI daha önce satılmışsa (ör. müşteri telefonu geri satıyor / takasa veriyor) yeni kayıt
 * açılmaz; mevcut kayıt yeniden stoka alınır, böylece cihazın tüm geçmişi tek yerde kalır.
 */
function addDevice(tenantId, userId, d, { cost, transactionId, movementType }) {
  const ts = now();
  const existing = db.one('SELECT id, status FROM devices WHERE tenant_id = ? AND imei = ?', tenantId, d.imei);
  if (existing && existing.status !== 'sold') throw new AppError(409, 'DUPLICATE', `IMEI zaten stokta kayıtlı: ${d.imei}`);
  if (existing) {
    db.run(
      `UPDATE devices SET brand = ?, model = ?, storage = ?, color = ?, serial_no = COALESCE(?, serial_no), condition = ?, purchase_price = ?, list_price = ?,
         sale_price = NULL, sale_tx_id = NULL, sold_at = NULL, status = 'in_stock', purchase_tx_id = ?, notes = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
      d.brand, d.model, d.storage ?? null, d.color ?? null, d.serial_no ?? null, d.condition || 'used', money(cost),
      d.list_price == null ? null : money(d.list_price), transactionId, d.notes ?? null, ts, existing.id,
    );
    db.run(
      "INSERT INTO transaction_items (tenant_id, transaction_id, device_id, direction, unit_price, unit_cost) VALUES (?,?,?, 'in', ?, ?)",
      tenantId, transactionId, existing.id, money(cost), money(cost),
    );
    movement(tenantId, existing.id, movementType, 'sold', 'in_stock', { transactionId, userId, note: 'Daha önce satılan cihaz yeniden stoka alındı' });
    return existing.id;
  }
  const r = db.run(
    `INSERT INTO devices (tenant_id, brand, model, storage, color, imei, serial_no, barcode, condition, purchase_price, list_price, status, purchase_tx_id, notes, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'in_stock', ?,?,?,?,?)`,
    tenantId, d.brand, d.model, d.storage ?? null, d.color ?? null, d.imei, d.serial_no ?? null, `tmp-${d.imei}`, d.condition || 'used',
    money(cost), d.list_price == null ? null : money(d.list_price), transactionId, d.notes ?? null, userId, ts, ts,
  );
  const deviceId = Number(r.lastInsertRowid);
  db.run("UPDATE devices SET barcode = printf('TS%08d', id) WHERE id = ?", deviceId);
  db.run(
    "INSERT INTO transaction_items (tenant_id, transaction_id, device_id, direction, unit_price, unit_cost) VALUES (?,?,?, 'in', ?, ?)",
    tenantId, transactionId, deviceId, money(cost), money(cost),
  );
  movement(tenantId, deviceId, movementType, null, 'in_stock', { transactionId, userId });
  return deviceId;
}

/**
 * Cihazı satılmış olarak işaretler. Eş zamanlılık güvencesi koşullu UPDATE ile sağlanır:
 * yalnızca hâlâ satılabilir durumdaki (stokta veya bu müşteriye rezerve) satır güncellenir.
 * Aynı cihaz için ikinci bir satış isteği 0 satır günceller ve tüm işlem geri alınır.
 */
function sellDevice(tenantId, userId, { deviceId, price }, { transactionId, customerId, movementType }) {
  const before = db.one('SELECT * FROM devices WHERE id = ? AND tenant_id = ?', deviceId, tenantId);
  if (!before) throw new AppError(404, 'DEVICE_NOT_FOUND', `Cihaz bulunamadı (#${deviceId})`);
  const ts = now();
  const r = db.run(
    `UPDATE devices SET status = 'sold', sale_price = ?, sale_tx_id = ?, sold_at = ?, reserved_for = NULL, reserved_note = NULL, version = version + 1, updated_at = ?
     WHERE id = ? AND tenant_id = ? AND (status = 'in_stock' OR (status = 'reserved' AND (reserved_for IS NULL OR reserved_for IS ?)))`,
    money(price), transactionId, ts, ts, deviceId, tenantId, customerId ?? null,
  );
  if (r.changes !== 1) {
    const msg = before.status === 'sold' ? 'satılmış' : 'başka bir müşteriye rezerve edilmiş';
    throw new AppError(409, 'DEVICE_NOT_AVAILABLE', `${before.brand} ${before.model} (IMEI ${before.imei}) ${msg}; işlem yapılamaz`);
  }
  db.run(
    "INSERT INTO transaction_items (tenant_id, transaction_id, device_id, direction, unit_price, unit_cost) VALUES (?,?,?, 'out', ?, ?)",
    tenantId, transactionId, deviceId, money(price), before.purchase_price,
  );
  movement(tenantId, deviceId, movementType, before.status, 'sold', { transactionId, userId });
  return { cost: before.purchase_price, price: money(price) };
}

function insertTransaction(tenantId, userId, t) {
  const r = db.run(
    `INSERT INTO transactions (tenant_id, type, customer_id, supplier_id, total_in, total_out, net_amount, payment_method, payment_status, paid_amount, occurred_at, user_id, notes, created_at)
     VALUES (?,?,?,?,0,0,0,?,?,?,?,?,?,?)`,
    tenantId, t.type, t.customerId ?? null, t.supplierId ?? null, t.paymentMethod, 'paid', 0, t.occurredAt || now(), userId, t.notes ?? null, now(),
  );
  return Number(r.lastInsertRowid);
}

/** İşlem toplamlarını kalemlerden hesaplar ve ödeme durumunu belirler. */
function finalizeTransaction(transactionId, paidAmount) {
  const s = db.one(
    "SELECT COALESCE(SUM(CASE WHEN direction='in' THEN unit_price END),0) tin, COALESCE(SUM(CASE WHEN direction='out' THEN unit_price END),0) tout FROM transaction_items WHERE transaction_id = ?",
    transactionId,
  );
  const tx = db.one('SELECT type FROM transactions WHERE id = ?', transactionId);
  // net: müşteriden alınan (+) / tedarikçiye veya müşteriye ödenen (-)
  const net = money(tx.type === 'purchase' ? -s.tin : s.tout - s.tin);
  const due = Math.abs(net);
  const paid = paidAmount == null ? due : money(Math.min(paidAmount, due));
  const status = paid >= due ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  db.run('UPDATE transactions SET total_in = ?, total_out = ?, net_amount = ?, paid_amount = ?, payment_status = ? WHERE id = ?', money(s.tin), money(s.tout), net, paid, status, transactionId);
}

function ensureParty(tenantId, table, partyId, label) {
  if (partyId == null) return;
  if (!db.one(`SELECT id FROM ${table} WHERE id = ? AND tenant_id = ?`, partyId, tenantId)) throw new AppError(400, 'INVALID_REFERENCE', `${label} bulunamadı`);
}

/** Bir işlem içindeki IMEI'lerin hem kendi aralarında benzersiz olduğunu hem de stokta (satılmamış) bulunmadığını doğrular. */
function ensureNewImeis(tenantId, devices) {
  const seen = new Set();
  for (const d of devices) {
    if (seen.has(d.imei)) throw new AppError(409, 'DUPLICATE', `IMEI listede birden fazla kez geçiyor: ${d.imei}`);
    seen.add(d.imei);
    const ex = db.one('SELECT id, status FROM devices WHERE tenant_id = ? AND imei = ?', tenantId, d.imei);
    if (ex && ex.status !== 'sold') throw new AppError(409, 'DUPLICATE', `IMEI zaten stokta kayıtlı: ${d.imei}`);
  }
}

module.exports = { movement, addDevice, sellDevice, insertTransaction, finalizeTransaction, ensureParty, ensureNewImeis };

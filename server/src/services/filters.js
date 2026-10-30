// İşlem ve rapor sorgularında ortak kullanılan filtre üreticisi.
// Tüm sorgular kiracı koşuluyla başlar; kiracı kimliği yalnızca oturumdan gelir.

const TYPES = ['purchase', 'sale', 'trade'];

/**
 * @returns {{where:string, params:any[]}} t (transactions) tablosu için WHERE ifadesi
 * Desteklenen filtreler: from, to (YYYY-AA-GG), type, userId, customerId, supplierId,
 * imei (kısmi), product (marka / model metni), brand, model
 */
function transactionFilter(tenantId, q = {}) {
  const where = ['t.tenant_id = ?'];
  const params = [tenantId];
  if (q.from) { where.push('t.occurred_at >= ?'); params.push(String(q.from)); }
  if (q.to) { where.push('t.occurred_at <= ?'); params.push(`${q.to} 23:59:59`); }
  if (q.type) {
    const list = String(q.type).split(',').filter((x) => TYPES.includes(x));
    if (list.length) { where.push(`t.type IN (${list.map(() => '?').join(',')})`); params.push(...list); }
  }
  if (q.userId) { where.push('t.user_id = ?'); params.push(Number(q.userId)); }
  if (q.customerId) { where.push('t.customer_id = ?'); params.push(Number(q.customerId)); }
  if (q.supplierId) { where.push('t.supplier_id = ?'); params.push(Number(q.supplierId)); }
  const dev = [];
  const devParams = [];
  if (q.imei) { dev.push('d.imei LIKE ?'); devParams.push(`%${q.imei}%`); }
  if (q.product) { dev.push("(d.brand || ' ' || d.model || ' ' || COALESCE(d.storage,'')) LIKE ?"); devParams.push(`%${q.product}%`); }
  if (q.brand) { dev.push('d.brand = ?'); devParams.push(q.brand); }
  if (q.model) { dev.push('d.model = ?'); devParams.push(q.model); }
  if (dev.length) {
    where.push(`EXISTS (SELECT 1 FROM transaction_items fi JOIN devices d ON d.id = fi.device_id WHERE fi.transaction_id = t.id AND ${dev.join(' AND ')})`);
    params.push(...devParams);
  }
  return { where: where.join(' AND '), params };
}

/** Kalem düzeyinde filtre (cihaz bazlı raporlar için): i = transaction_items, d = devices, t = transactions */
function itemFilter(tenantId, q = {}) {
  const base = transactionFilter(tenantId, { ...q, imei: undefined, product: undefined, brand: undefined, model: undefined });
  const where = [base.where];
  const params = [...base.params];
  if (q.imei) { where.push('d.imei LIKE ?'); params.push(`%${q.imei}%`); }
  if (q.product) { where.push("(d.brand || ' ' || d.model || ' ' || COALESCE(d.storage,'')) LIKE ?"); params.push(`%${q.product}%`); }
  if (q.brand) { where.push('d.brand = ?'); params.push(q.brand); }
  if (q.model) { where.push('d.model = ?'); params.push(q.model); }
  return { where: where.join(' AND '), params };
}

const TYPE_LABELS = { purchase: 'Alış', sale: 'Satış', trade: 'Takas' };
const PAYMENT_LABELS = { cash: 'Nakit', card: 'Kredi kartı', transfer: 'Havale/EFT', installment: 'Taksit', mixed: 'Karma' };
const PAYMENT_STATUS_LABELS = { paid: 'Ödendi', partial: 'Kısmi', unpaid: 'Ödenmedi' };

function describeFilters(q, users = []) {
  const parts = [];
  if (q.from || q.to) parts.push(`Tarih: ${q.from || '…'} – ${q.to || '…'}`);
  if (q.type) parts.push(`Tür: ${String(q.type).split(',').map((t) => TYPE_LABELS[t] || t).join(', ')}`);
  if (q.userId) parts.push(`Kullanıcı: ${users.find((u) => u.id === Number(q.userId))?.full_name || q.userId}`);
  if (q.imei) parts.push(`IMEI: ${q.imei}`);
  if (q.product) parts.push(`Ürün: ${q.product}`);
  if (q.brand) parts.push(`Marka: ${q.brand}`);
  if (q.model) parts.push(`Model: ${q.model}`);
  return parts.length ? `Filtreler — ${parts.join(' | ')}` : 'Filtre yok (tüm kayıtlar)';
}

module.exports = { transactionFilter, itemFilter, describeFilters, TYPE_LABELS, PAYMENT_LABELS, PAYMENT_STATUS_LABELS };

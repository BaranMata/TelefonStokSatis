const express = require('express');
const db = require('../db');
const exporter = require('../services/exporter');
const { audit } = require('../services/audit');
const { itemFilter, describeFilters } = require('../services/filters');
const { requirePermission, requireModule } = require('../middleware/auth');
const { clockNow, AppError, now, addDays, money, ah } = require('../utils/common');

const router = express.Router();
router.use(requireModule('reports'), requirePermission('report.view'));

const margin = (profit, revenue) => (revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null);

/**
 * Dönem özeti. Gelir = çıkan cihazların satış fiyatı (satış + takas), maliyet = bu cihazların
 * alış/takas maliyeti, alış = işletmeye giren cihazların değeri (alış + takasta alınan).
 */
function summary(tenantId, q) {
  const f = itemFilter(tenantId, q);
  const r = db.one(
    `SELECT
       COALESCE(SUM(CASE WHEN i.direction='in' THEN i.unit_price END),0) purchase_total,
       COUNT(CASE WHEN i.direction='in' THEN 1 END) purchase_count,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_price END),0) revenue,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_cost END),0) cost,
       COUNT(CASE WHEN i.direction='out' THEN 1 END) sold_count
     FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id JOIN devices d ON d.id = i.device_id
     WHERE ${f.where}`,
    ...f.params,
  );
  const profit = money(r.revenue - r.cost);
  return { ...r, purchase_total: money(r.purchase_total), revenue: money(r.revenue), cost: money(r.cost), profit, margin: margin(profit, r.revenue) };
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Pazartesi = 0
  x.setDate(x.getDate() - day);
  return x;
}

router.get('/dashboard', (req, res) => {
  const tid = req.tenantId;
  const today = now().slice(0, 10);
  const weekStart = addDays(startOfWeek(clockNow()), 0).slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const stock = db.one(
    `SELECT COUNT(CASE WHEN status='in_stock' THEN 1 END) in_stock, COUNT(CASE WHEN status='reserved' THEN 1 END) reserved,
       COUNT(CASE WHEN status='sold' THEN 1 END) sold,
       COALESCE(SUM(CASE WHEN status<>'sold' THEN purchase_price END),0) stock_cost,
       COALESCE(SUM(CASE WHEN status<>'sold' THEN list_price END),0) stock_list_value
     FROM devices WHERE tenant_id = ?`,
    tid,
  );
  const from30 = addDays(clockNow(), -29).slice(0, 10);
  const daily = db.all(
    `SELECT substr(t.occurred_at,1,10) day,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_price END),0) revenue,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_price - i.unit_cost END),0) profit,
       COALESCE(SUM(CASE WHEN i.direction='in' THEN i.unit_price END),0) purchases
     FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id
     WHERE t.tenant_id = ? AND t.occurred_at >= ? GROUP BY day ORDER BY day`,
    tid, from30,
  );
  // Boş günleri sıfırla doldur (grafik sürekliliği için)
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const day = addDays(clockNow(), -i).slice(0, 10);
    series.push(byDay.get(day) || { day, revenue: 0, profit: 0, purchases: 0 });
  }
  const brandDistribution = db.all(
    "SELECT brand, COUNT(*) count, COALESCE(SUM(purchase_price),0) cost FROM devices WHERE tenant_id = ? AND status <> 'sold' GROUP BY brand ORDER BY count DESC",
    tid,
  );
  const topModels = db.all(
    `SELECT d.brand, d.model, COUNT(*) count, SUM(i.unit_price - i.unit_cost) profit FROM transaction_items i JOIN devices d ON d.id = i.device_id JOIN transactions t ON t.id = i.transaction_id
     WHERE i.tenant_id = ? AND i.direction = 'out' AND t.occurred_at >= ? GROUP BY d.brand, d.model ORDER BY count DESC LIMIT 5`,
    tid, monthStart,
  );
  const recent = db.all(
    `SELECT t.id, t.type, t.occurred_at, t.total_in, t.total_out, t.net_amount, u.full_name user_name, c.full_name customer_name, s.name supplier_name
     FROM transactions t JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN suppliers s ON s.id = t.supplier_id
     WHERE t.tenant_id = ? ORDER BY t.occurred_at DESC, t.id DESC LIMIT 6`,
    tid,
  );
  res.json({
    stock,
    today: summary(tid, { from: today, to: today }),
    week: summary(tid, { from: weekStart, to: today }),
    month: summary(tid, { from: monthStart, to: today }),
    series,
    brandDistribution,
    topModels,
    recent,
  });
});

// Günlük / haftalık / aylık alış-satış raporu
function periodReport(tenantId, q) {
  const groupBy = ['day', 'week', 'month'].includes(q.groupBy) ? q.groupBy : 'day';
  const expr = {
    day: 'substr(t.occurred_at,1,10)',
    // ISO'ya yakın hafta: yılın hafta numarası (Pazartesi başlangıçlı)
    week: "strftime('%Y', t.occurred_at) || '-H' || strftime('%W', t.occurred_at)",
    month: 'substr(t.occurred_at,1,7)',
  }[groupBy];
  const f = itemFilter(tenantId, q);
  const rows = db.all(
    `SELECT ${expr} period,
       COUNT(DISTINCT CASE WHEN i.direction='in' THEN i.id END) purchase_count,
       COALESCE(SUM(CASE WHEN i.direction='in' THEN i.unit_price END),0) purchase_total,
       COUNT(DISTINCT CASE WHEN i.direction='out' THEN i.id END) sale_count,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_price END),0) revenue,
       COALESCE(SUM(CASE WHEN i.direction='out' THEN i.unit_cost END),0) cost
     FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id JOIN devices d ON d.id = i.device_id
     WHERE ${f.where} GROUP BY period ORDER BY period DESC`,
    ...f.params,
  ).map((r) => {
    const profit = money(r.revenue - r.cost);
    return { ...r, purchase_total: money(r.purchase_total), revenue: money(r.revenue), cost: money(r.cost), profit, margin: margin(profit, r.revenue) };
  });
  return { groupBy, rows, totals: summary(tenantId, q) };
}

router.get('/period', (req, res) => res.json(periodReport(req.tenantId, req.query)));

// Marka / model bazında dağılım
function distribution(tenantId, q) {
  const status = ['in_stock', 'reserved', 'sold'].includes(q.status) ? q.status : null;
  const where = ['tenant_id = ?'];
  const params = [tenantId];
  if (status) { where.push('status = ?'); params.push(status); } else if (q.status !== 'all') { where.push("status <> 'sold'"); }
  if (q.brand) { where.push('brand = ?'); params.push(q.brand); }
  const rows = db.all(
    `SELECT brand, model, COUNT(*) count, COALESCE(SUM(purchase_price),0) cost, COALESCE(SUM(sale_price),0) sales,
       COUNT(CASE WHEN status='in_stock' THEN 1 END) in_stock, COUNT(CASE WHEN status='reserved' THEN 1 END) reserved, COUNT(CASE WHEN status='sold' THEN 1 END) sold
     FROM devices WHERE ${where.join(' AND ')} GROUP BY brand, model ORDER BY brand, count DESC`,
    ...params,
  );
  const brands = db.all(
    `SELECT brand, COUNT(*) count, COALESCE(SUM(purchase_price),0) cost FROM devices WHERE ${where.join(' AND ')} GROUP BY brand ORDER BY count DESC`,
    ...params,
  );
  return { rows, brands };
}

router.get('/distribution', (req, res) => res.json(distribution(req.tenantId, req.query)));

// Cihaz bazında kâr / zarar / marj
function deviceProfit(tenantId, q) {
  const f = itemFilter(tenantId, q);
  const rows = db.all(
    `SELECT d.id device_id, d.brand, d.model, d.storage, d.color, d.imei, t.id transaction_id, t.type, t.occurred_at, u.full_name user_name, c.full_name customer_name,
       i.unit_cost cost, i.unit_price price, (i.unit_price - i.unit_cost) profit
     FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id JOIN devices d ON d.id = i.device_id
     JOIN users u ON u.id = t.user_id LEFT JOIN customers c ON c.id = t.customer_id
     WHERE i.direction = 'out' AND ${f.where} ORDER BY t.occurred_at DESC LIMIT 2000`,
    ...f.params,
  ).map((r) => ({ ...r, profit: money(r.profit), margin: margin(r.profit, r.price) }));
  const totals = rows.reduce((s, r) => ({ cost: s.cost + r.cost, price: s.price + r.price, profit: s.profit + r.profit }), { cost: 0, price: 0, profit: 0 });
  totals.margin = margin(totals.profit, totals.price);
  return { rows, totals: { cost: money(totals.cost), price: money(totals.price), profit: money(totals.profit), margin: totals.margin } };
}

router.get('/device-profit', (req, res) => res.json(deviceProfit(req.tenantId, req.query)));

// Filtrelerde kullanılacak kullanıcı listesi
router.get('/users', (req, res) => {
  res.json({ items: db.all('SELECT id, full_name, role FROM users WHERE tenant_id = ? ORDER BY full_name', req.tenantId) });
});

// ------------------------------------------------------------ Dışa aktarma
router.get(
  '/export',
  requirePermission('report.export'),
  requireModule('export'),
  ah(async (req, res) => {
    const { report, format } = req.query;
    if (!['xlsx', 'pdf'].includes(format)) throw new AppError(400, 'VALIDATION_ERROR', 'format xlsx veya pdf olmalı');
    const users = db.all('SELECT id, full_name FROM users WHERE tenant_id = ?', req.tenantId);
    const subtitle = `${req.tenant.name} — ${describeFilters(req.query, users)}`;
    let def;
    if (report === 'period') {
      const r = periodReport(req.tenantId, req.query);
      const label = { day: 'Günlük', week: 'Haftalık', month: 'Aylık' }[r.groupBy];
      def = {
        title: `${label} Alış-Satış Raporu`,
        columns: [
          { key: 'period', header: 'Dönem', width: 12 },
          { key: 'purchase_count', header: 'Alınan adet', width: 9, type: 'number' },
          { key: 'purchase_total', header: 'Alış tutarı', width: 13, type: 'money' },
          { key: 'sale_count', header: 'Satılan adet', width: 9, type: 'number' },
          { key: 'revenue', header: 'Gelir', width: 13, type: 'money' },
          { key: 'cost', header: 'Maliyet', width: 13, type: 'money' },
          { key: 'profit', header: 'Tahmini kâr', width: 13, type: 'money' },
          { key: 'margin', header: 'Marj', width: 8, type: 'percent' },
        ],
        rows: r.rows,
        totals: { purchase_count: r.totals.purchase_count, purchase_total: r.totals.purchase_total, sale_count: r.totals.sold_count, revenue: r.totals.revenue, cost: r.totals.cost, profit: r.totals.profit, margin: r.totals.margin },
      };
    } else if (report === 'distribution') {
      const r = distribution(req.tenantId, req.query);
      def = {
        title: 'Marka / Model Dağılımı',
        columns: [
          { key: 'brand', header: 'Marka', width: 12 },
          { key: 'model', header: 'Model', width: 22 },
          { key: 'count', header: 'Adet', width: 7, type: 'number' },
          { key: 'in_stock', header: 'Stokta', width: 7, type: 'number' },
          { key: 'reserved', header: 'Rezerve', width: 7, type: 'number' },
          { key: 'sold', header: 'Satıldı', width: 7, type: 'number' },
          { key: 'cost', header: 'Toplam maliyet', width: 14, type: 'money' },
        ],
        rows: r.rows,
        totals: { count: r.rows.reduce((s, x) => s + x.count, 0), cost: money(r.rows.reduce((s, x) => s + x.cost, 0)) },
      };
    } else if (report === 'device-profit') {
      const r = deviceProfit(req.tenantId, req.query);
      def = {
        title: 'Cihaz Bazında Kâr / Zarar',
        columns: [
          { key: 'occurred_at', header: 'Tarih', width: 15 },
          { key: 'product', header: 'Cihaz', width: 24 },
          { key: 'imei', header: 'IMEI', width: 15 },
          { key: 'customer_name', header: 'Müşteri', width: 15 },
          { key: 'cost', header: 'Maliyet', width: 11, type: 'money' },
          { key: 'price', header: 'Satış', width: 11, type: 'money' },
          { key: 'profit', header: 'Kâr/Zarar', width: 11, type: 'money' },
          { key: 'margin', header: 'Marj', width: 7, type: 'percent' },
          { key: 'user_name', header: 'Kullanıcı', width: 12 },
        ],
        rows: r.rows.map((x) => ({ ...x, product: `${x.brand} ${x.model} ${x.storage || ''}`.trim() })),
        totals: r.totals,
      };
    } else {
      throw new AppError(400, 'VALIDATION_ERROR', 'Geçersiz rapor türü');
    }
    await exporter.send(res, format, { ...def, subtitle }, `rapor-${report}`);
    audit(req, 'report.export', { details: { report, format } });
  }),
);

module.exports = router;

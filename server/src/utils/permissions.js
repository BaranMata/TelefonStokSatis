// Kullanıcı rolüne İşletme Admini tarafından tek tek atanabilen yetkiler
const PERMISSIONS = {
  'stock.view': 'Stoku görüntüleme',
  'stock.edit': 'Cihaz ekleme / düzenleme / rezerve etme',
  'stock.count': 'Stok sayımı yapma',
  'purchase.create': 'Alış işlemi yapma',
  'sale.create': 'Satış işlemi yapma',
  'trade.create': 'Takas işlemi yapma',
  'customer.manage': 'Müşteri yönetimi',
  'supplier.manage': 'Tedarikçi yönetimi',
  'report.view': 'Raporları görüntüleme',
  'report.export': 'Raporları Excel / PDF dışa aktarma',
};

// Abonelik planına bağlı modüller
const MODULES = {
  stock: 'Stok yönetimi',
  sales: 'Alış / satış',
  trade: 'Takas',
  reports: 'Raporlama paneli',
  export: 'Excel / PDF dışa aktarma',
  barcode: 'Barkod oluşturma ve yazdırma',
  stock_count: 'Stok sayımı',
};

const DEFAULT_USER_PERMISSIONS = ['stock.view', 'stock.edit', 'purchase.create', 'sale.create', 'customer.manage', 'report.view'];

function sanitizePermissions(list) {
  return [...new Set((list || []).filter((p) => Object.hasOwn(PERMISSIONS, p)))];
}

module.exports = { PERMISSIONS, MODULES, DEFAULT_USER_PERMISSIONS, sanitizePermissions };

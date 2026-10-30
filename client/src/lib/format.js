export const money = (n) =>
  n == null || n === '' ? '—' : `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;

export const pct = (n) => (n == null ? '—' : `%${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);

export const date = (s) => (s ? new Date(s.replace(' ', 'T')).toLocaleDateString('tr-TR') : '—');
export const dateTime = (s) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// Sunucu saatiyle fark (DEMO_NOW kullanılan demoda tarih varsayılanları sunucuyla aynı günü gösterir)
let clockOffset = 0;
export const syncClock = (serverNow) => {
  const t = Date.parse(serverNow.replace(' ', 'T'));
  if (!Number.isNaN(t)) clockOffset = t - Date.now();
};
export const clockNow = () => new Date(Date.now() + clockOffset);

export const today = () => {
  const d = clockNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysAgo = (n) => {
  const d = clockNow();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const STATUS = { in_stock: 'Stokta', reserved: 'Rezerve', sold: 'Satıldı' };
export const CONDITION = { new: 'Sıfır', used: 'İkinci el', refurbished: 'Yenilenmiş' };
export const TX_TYPE = { purchase: 'Alış', sale: 'Satış', trade: 'Takas' };
export const PAYMENT = { cash: 'Nakit', card: 'Kredi kartı', transfer: 'Havale/EFT', installment: 'Taksit', mixed: 'Karma' };
export const PAYMENT_STATUS = { paid: 'Ödendi', partial: 'Kısmi', unpaid: 'Ödenmedi' };
export const ROLE = { super_admin: 'Süper Admin', tenant_admin: 'İşletme Admini', user: 'Kullanıcı' };
export const TENANT_STATUS = { active: 'Aktif', suspended: 'Askıda', closed: 'Kapalı' };
export const CYCLE = { trial: 'Deneme', monthly: 'Aylık', yearly: 'Yıllık' };
export const SUB_STATUS = { active: 'Aktif', expired: 'Süresi doldu', cancelled: 'İptal', replaced: 'Yenilendi' };
export const MOVEMENT = {
  purchase_in: 'Alışla stoka giriş',
  trade_in: 'Takasla stoka giriş',
  sale_out: 'Satış',
  trade_out: 'Takasla çıkış',
  reserve: 'Rezerve edildi',
  unreserve: 'Rezerv kaldırıldı',
  update: 'Bilgi güncellendi',
  count_found: 'Sayımda bulundu',
  count_missing: 'Sayımda bulunamadı',
};

export const ACTIONS = {
  'auth.login': 'Giriş yaptı',
  'auth.login_failed': 'Hatalı giriş denemesi',
  'auth.password_reset_requested': 'Şifre yenileme istedi',
  'auth.password_reset': 'Şifresini yeniledi',
  'tenant.register': 'İşletme kaydı oluşturdu',
  'profile.update': 'Profilini güncelledi',
  'profile.password_change': 'Şifresini değiştirdi',
  'business.profile_update': 'İşletme profilini güncelledi',
  'staff.invite': 'Personel davet etti',
  'staff.invite_revoke': 'Daveti iptal etti',
  'staff.invite_accepted': 'Daveti kabul etti',
  'staff.update': 'Personeli düzenledi',
  'staff.deactivate': 'Personeli devre dışı bıraktı',
  'subscription.purchase': 'Abonelik satın aldı',
  'subscription.payment_failed': 'Ödeme başarısız',
  'purchase.create': 'Alış kaydetti',
  'sale.create': 'Satış yaptı',
  'trade.create': 'Takas yaptı',
  'device.update': 'Cihaz güncelledi',
  'device.reserve': 'Cihaz rezerve etti',
  'device.unreserve': 'Rezervi kaldırdı',
  'customer.create': 'Müşteri ekledi',
  'customer.update': 'Müşteri güncelledi',
  'customer.delete': 'Müşteri sildi',
  'supplier.create': 'Tedarikçi ekledi',
  'supplier.update': 'Tedarikçi güncelledi',
  'supplier.delete': 'Tedarikçi sildi',
  'report.export': 'Rapor dışa aktardı',
  'stock_count.start': 'Stok sayımı başlattı',
  'stock_count.close': 'Stok sayımını kapattı',
  'admin.tenant_create': 'İşletme oluşturdu',
  'admin.tenant_update': 'İşletme bilgisi güncelledi',
  'admin.tenant_activate': 'İşletmeyi etkinleştirdi',
  'admin.tenant_suspend': 'İşletmeyi askıya aldı',
  'admin.tenant_close': 'İşletmeyi kapattı',
  'admin.tenant_reopen': 'Kapalı işletmeyi yeniden açtı',
  'admin.subscription_assign': 'Plan atadı',
  'admin.plan_create': 'Plan oluşturdu',
  'admin.plan_update': 'Plan güncelledi',
  'admin.backup_create': 'Yedek aldı',
  'admin.backup_restore': 'Yedekten geri yükledi',
};

export const limitText = (n) => (n === -1 ? 'Sınırsız' : n);

export const MODULE_LABELS = { stock: 'Stok', sales: 'Alış/satış', trade: 'Takas', reports: 'Raporlar', export: 'Excel/PDF', barcode: 'Barkod', stock_count: 'Stok sayımı' };
export const moduleList = (mods = []) => mods.map((m) => MODULE_LABELS[m] || m).join(', ');

// Demo verisi: veritabanını sıfırlar ve örnek işletmeler, kullanıcılar, cihazlar ve işlemler oluşturur.
// Tüm veriler kurgusaldır (gerçek kişi / işletme / IMEI değildir); sabit tohumlu rastgele üreteçle
// her çalıştırmada aynı veri seti üretilir.
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('./index');
const subscription = require('../services/subscription');
const inventory = require('../services/inventory');
const { clockNow, now, addDays, luhnCheckDigit, formatDate } = require('../utils/common');
const { DEFAULT_USER_PERMISSIONS } = require('../utils/permissions');

// ---------------------------------------------------------------- deterministik rastgele
let state = 20260721;
const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const round50 = (n) => Math.round(n / 50) * 50;

// Kurgusal ama geçerli (Luhn kontrollü) IMEI üretimi
let imeiSeq = 100000;
function fakeImei() {
  const body = `35${String(int(1000, 9999))}${String(imeiSeq++).padStart(8, '0')}`.slice(0, 14);
  return body + luhnCheckDigit(body);
}

const CATALOG = [
  { brand: 'Apple', model: 'iPhone 15 Pro', storages: ['128 GB', '256 GB'], colors: ['Natürel Titanyum', 'Siyah Titanyum'], cost: [52000, 61000] },
  { brand: 'Apple', model: 'iPhone 14', storages: ['128 GB', '256 GB'], colors: ['Mavi', 'Gece Yarısı', 'Mor'], cost: [29000, 35000] },
  { brand: 'Apple', model: 'iPhone 13', storages: ['128 GB'], colors: ['Yıldız Işığı', 'Kırmızı', 'Mavi'], cost: [21000, 25000] },
  { brand: 'Apple', model: 'iPhone 12', storages: ['64 GB', '128 GB'], colors: ['Siyah', 'Beyaz'], cost: [14000, 17500] },
  { brand: 'Samsung', model: 'Galaxy S24', storages: ['128 GB', '256 GB'], colors: ['Onyx Siyah', 'Mermer Gri'], cost: [30000, 36000] },
  { brand: 'Samsung', model: 'Galaxy S23 FE', storages: ['128 GB'], colors: ['Mint', 'Grafit'], cost: [17000, 20000] },
  { brand: 'Samsung', model: 'Galaxy A55', storages: ['128 GB', '256 GB'], colors: ['Lacivert', 'Lila'], cost: [13500, 16000] },
  { brand: 'Samsung', model: 'Galaxy A35', storages: ['128 GB'], colors: ['Siyah', 'Buz Mavisi'], cost: [10000, 12000] },
  { brand: 'Xiaomi', model: 'Redmi Note 13 Pro', storages: ['256 GB'], colors: ['Siyah', 'Mor'], cost: [11000, 13000] },
  { brand: 'Xiaomi', model: '13T', storages: ['256 GB'], colors: ['Siyah', 'Mavi'], cost: [18000, 21000] },
  { brand: 'Huawei', model: 'nova 11', storages: ['256 GB'], colors: ['Siyah', 'Yeşil'], cost: [12000, 14000] },
  { brand: 'Oppo', model: 'Reno 11 F', storages: ['256 GB'], colors: ['Okyanus Mavisi', 'Siyah'], cost: [10500, 12500] },
];

const FIRST = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Zeynep', 'Emre', 'Elif', 'Burak', 'Merve', 'Hasan', 'Esra', 'Murat', 'Selin', 'Kemal', 'Derya', 'Oğuz', 'Gizem'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Koç', 'Kurt', 'Aksoy', 'Erdoğan', 'Karadeniz', 'Bulut'];

function makeDevice(model, condition) {
  const cost = round50(model.cost[0] + rnd() * (model.cost[1] - model.cost[0]));
  return {
    brand: model.brand,
    model: model.model,
    storage: pick(model.storages),
    color: pick(model.colors),
    imei: fakeImei(),
    serial_no: `${model.brand.slice(0, 2).toUpperCase()}${int(10000000, 99999999)}`,
    condition: condition || pick(['used', 'used', 'used', 'new', 'refurbished']),
    cost,
    list_price: round50(cost * (1.12 + rnd() * 0.1)),
  };
}

function dateAt(daysAgo, hour) {
  const d = clockNow();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour ?? int(9, 19), int(0, 59), int(0, 59), 0);
  // Bugüne düşen kayıtlar gelecekteki bir saate yazılmasın
  const limit = new Date(clockNow().getTime() - 5 * 60000);
  return formatDate(d > limit ? limit : d);
}

async function main() {
  if (config.env === 'production' && !process.argv.includes('--force')) {
    console.error('Üretim ortamında seed çalıştırmak için --force gerekir.');
    process.exit(1);
  }
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + ext, { force: true });
  db.open(config.dbPath);
  const ts = now();
  const hash = (p) => bcrypt.hashSync(p, 10);

  // ------------------------------------------------------------ planlar
  const ALL = ['stock', 'sales', 'trade', 'reports', 'export', 'barcode', 'stock_count'];
  const plans = [
    ['deneme', 'Ücretsiz Deneme', 0, 0, 3, 100, ALL, 1, 14],
    ['baslangic', 'Başlangıç', 499, 4990, 2, 150, ['stock', 'sales', 'reports', 'barcode'], 0, 0],
    ['profesyonel', 'Profesyonel', 999, 9990, 10, 1500, ALL, 0, 0],
    ['kurumsal', 'Kurumsal', 2499, 24990, -1, -1, ALL, 0, 0],
  ];
  const planId = {};
  for (const p of plans) {
    const r = db.run(
      'INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_devices, modules, is_trial, trial_days, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)',
      p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), p[7], p[8], ts,
    );
    planId[p[0]] = Number(r.lastInsertRowid);
  }

  // ------------------------------------------------------------ süper admin
  db.run("INSERT INTO users (tenant_id, email, password_hash, full_name, role, created_at, updated_at) VALUES (NULL, ?, ?, ?, 'super_admin', ?, ?)", 'admin@telefonsaas.local', hash('Admin1234'), 'Platform Yöneticisi', ts, ts);

  // ------------------------------------------------------------ işletmeler
  function createTenant(name, slug, extra) {
    const r = db.run("INSERT INTO tenants (name, slug, tax_no, phone, email, address, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)", name, slug, extra.tax_no, extra.phone, extra.email, extra.address, extra.status || 'active', dateAt(extra.since), ts);
    return Number(r.lastInsertRowid);
  }
  function createUser(tenantId, email, name, role, permissions = []) {
    const r = db.run('INSERT INTO users (tenant_id, email, password_hash, full_name, role, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', tenantId, email, hash('Demo1234'), name, role, JSON.stringify(permissions), ts, ts);
    return Number(r.lastInsertRowid);
  }
  function payHistory(tenantId, code, cycle, monthsAgoList) {
    const plan = db.one('SELECT * FROM plans WHERE code = ?', code);
    for (const m of monthsAgoList) {
      db.run(
        "INSERT INTO payments (tenant_id, plan_id, billing_cycle, amount, currency, provider, provider_ref, status, created_at) VALUES (?,?,?,?, 'TRY', 'mock', ?, 'succeeded', ?)",
        tenantId, plan.id, cycle, cycle === 'yearly' ? plan.price_yearly : plan.price_monthly, `mock_seed_${tenantId}_${m}`, dateAt(m * 30, 10),
      );
    }
  }

  const t1 = createTenant('Yıldız İletişim', 'yildiz-iletisim', { tax_no: '9876543210', phone: '0454 000 00 01', email: 'info@yildiziletisim.example', address: 'Merkez, Giresun', since: 120 });
  const t1Admin = createUser(t1, 'yonetici@yildiz.example', 'Kerem Yıldız', 'tenant_admin');
  const t1Sales = createUser(t1, 'satis@yildiz.example', 'Elif Aydın', 'user', [...DEFAULT_USER_PERMISSIONS, 'trade.create', 'supplier.manage', 'report.export']);
  const t1Depot = createUser(t1, 'depo@yildiz.example', 'Murat Koç', 'user', ['stock.view', 'stock.count']);
  subscription.activate(t1, planId.profesyonel, 'monthly');
  payHistory(t1, 'profesyonel', 'monthly', [3, 2, 1, 0]);
  const t1Sub = db.one("SELECT id FROM subscriptions WHERE tenant_id = ? AND status = 'active'", t1).id;
  db.run('UPDATE payments SET subscription_id = ? WHERE tenant_id = ? AND id = (SELECT MAX(id) FROM payments WHERE tenant_id = ?)', t1Sub, t1, t1);

  const t2 = createTenant('Karadeniz Mobil', 'karadeniz-mobil', { tax_no: '1234509876', phone: '0462 000 00 02', email: 'iletisim@karadenizmobil.example', address: 'Ortahisar, Trabzon', since: 60 });
  const t2Admin = createUser(t2, 'yonetici@karadeniz.example', 'Selin Karadeniz', 'tenant_admin');
  const t2User = createUser(t2, 'personel@karadeniz.example', 'Oğuz Bulut', 'user', DEFAULT_USER_PERMISSIONS);
  subscription.activate(t2, planId.baslangic, 'yearly');
  payHistory(t2, 'baslangic', 'yearly', [1]);

  const t3 = createTenant('Doğa GSM', 'doga-gsm', { phone: '0452 000 00 03', email: 'doga@dogagsm.example', address: 'Altınordu, Ordu', since: 11 });
  const t3Admin = createUser(t3, 'yonetici@doga.example', 'Derya Doğan', 'tenant_admin');
  subscription.startTrial(t3);
  // Deneme süresinin bitmesine 3 gün kalmış gibi göster
  db.run("UPDATE subscriptions SET starts_at = ?, ends_at = ? WHERE tenant_id = ? AND status = 'active'", dateAt(11, 9), addDays(clockNow(), 3), t3);

  const t4 = createTenant('Eski Çarşı Telefon', 'eski-carsi', { phone: '0454 000 00 04', email: 'eskicarsi@example.com', address: 'Bulancak, Giresun', status: 'suspended', since: 200 });
  createUser(t4, 'yonetici@eskicarsi.example', 'Hasan Kurt', 'tenant_admin');
  subscription.activate(t4, planId.baslangic, 'monthly');
  db.run("UPDATE subscriptions SET starts_at = ?, ends_at = ?, status = 'expired' WHERE tenant_id = ?", dateAt(70, 9), dateAt(40, 9), t4);
  payHistory(t4, 'baslangic', 'monthly', [2]);
  db.run(
    "INSERT INTO payments (tenant_id, plan_id, billing_cycle, amount, currency, provider, status, failure_reason, created_at) VALUES (?,?, 'monthly', 499, 'TRY', 'mock', 'failed', 'Test kartı reddedildi', ?)",
    t4, planId.baslangic, dateAt(40, 11),
  );

  // ------------------------------------------------------------ müşteri / tedarikçi
  function customers(tenantId, n) {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const r = db.run('INSERT INTO customers (tenant_id, full_name, phone, email, address, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', tenantId, name, `05${int(30, 59)} ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`, null, pick(['Giresun', 'Ordu', 'Trabzon', 'Bulancak', 'Tirebolu']), ts, ts);
      ids.push(Number(r.lastInsertRowid));
    }
    return ids;
  }
  function suppliers(tenantId, names) {
    return names.map((n) => Number(db.run('INSERT INTO suppliers (tenant_id, name, contact_name, phone, tax_no, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', tenantId, n, `${pick(FIRST)} ${pick(LAST)}`, `0212 ${int(100, 999)} ${int(10, 99)} ${int(10, 99)}`, String(int(1000000000, 9999999999)), ts, ts).lastInsertRowid));
  }

  // ------------------------------------------------------------ işlem akışı
  function simulate(tenantId, userIds, custIds, supIds, days, intensity) {
    const sellable = []; // { id, cost, list }
    for (let day = days; day >= 0; day--) {
      // toptan alış (birkaç günde bir)
      if (day % 6 === 0 || day === days) {
        const devices = Array.from({ length: int(6, 10) * intensity }, () => makeDevice(pick(CATALOG)));
        const txId = db.tx(() => {
          const id = inventory.insertTransaction(tenantId, pick(userIds), { type: 'purchase', supplierId: pick(supIds), paymentMethod: pick(['transfer', 'transfer', 'cash']), occurredAt: dateAt(day, 10) });
          for (const d of devices) sellable.push({ id: inventory.addDevice(tenantId, pick(userIds), d, { cost: d.cost, transactionId: id, movementType: 'purchase_in' }), cost: d.cost, list: d.list_price });
          inventory.finalizeTransaction(id);
          return id;
        });
        void txId;
      }
      // bireysel kişiden ikinci el alım
      if (rnd() < 0.25) {
        const d = makeDevice(pick(CATALOG), 'used');
        db.tx(() => {
          const id = inventory.insertTransaction(tenantId, pick(userIds), { type: 'purchase', customerId: pick(custIds), paymentMethod: 'cash', occurredAt: dateAt(day) });
          sellable.push({ id: inventory.addDevice(tenantId, pick(userIds), d, { cost: round50(d.cost * 0.9), transactionId: id, movementType: 'purchase_in' }), cost: round50(d.cost * 0.9), list: d.list_price });
          inventory.finalizeTransaction(id);
        });
      }
      // satışlar
      const sales = day === 0 ? 3 : int(0, 2) * intensity; // bugün için de örnek satış olsun
      for (let s = 0; s < sales && sellable.length > 3; s++) {
        const dev = sellable.splice(Math.floor(rnd() * sellable.length), 1)[0];
        // çoğu kârlı, bazıları indirimli / zararına
        const price = round50(rnd() < 0.08 ? dev.cost * 0.95 : dev.cost * (1.06 + rnd() * 0.16));
        db.tx(() => {
          const id = inventory.insertTransaction(tenantId, pick(userIds), { type: 'sale', customerId: rnd() < 0.85 ? pick(custIds) : null, paymentMethod: pick(['cash', 'card', 'card', 'installment', 'transfer']), occurredAt: dateAt(day) });
          inventory.sellDevice(tenantId, pick(userIds), { deviceId: dev.id, price }, { transactionId: id, customerId: null, movementType: 'sale_out' });
          inventory.finalizeTransaction(id);
        });
      }
      // takas (ara sıra)
      if (rnd() < 0.12 && sellable.length > 3) {
        const out = sellable.splice(Math.floor(rnd() * sellable.length), 1)[0];
        const incoming = makeDevice(pick(CATALOG.slice(2)), 'used');
        const value = round50(incoming.cost * 0.85);
        const outPrice = round50(out.cost * (1.08 + rnd() * 0.1));
        db.tx(() => {
          const id = inventory.insertTransaction(tenantId, pick(userIds), { type: 'trade', customerId: pick(custIds), paymentMethod: pick(['cash', 'card']), occurredAt: dateAt(day) });
          inventory.sellDevice(tenantId, pick(userIds), { deviceId: out.id, price: outPrice }, { transactionId: id, customerId: null, movementType: 'trade_out' });
          sellable.push({ id: inventory.addDevice(tenantId, pick(userIds), { ...incoming, list_price: round50(value * 1.2) }, { cost: value, transactionId: id, movementType: 'trade_in' }), cost: value });
          inventory.finalizeTransaction(id);
        });
      }
    }
    return sellable;
  }

  const c1 = customers(t1, 24);
  const s1 = suppliers(t1, ['Anadolu Telekom Dağıtım', 'Mega GSM Toptan', 'Karadeniz Yenilenmiş Cihaz', 'Doğu Elektronik İthalat']);
  const left1 = simulate(t1, [t1Admin, t1Sales, t1Sales], c1, s1, 60, 1);
  const c2 = customers(t2, 10);
  const s2 = suppliers(t2, ['Trabzon GSM Toptan', 'Anadolu Telekom Dağıtım']);
  simulate(t2, [t2Admin, t2User], c2, s2, 45, 1);
  const c3 = customers(t3, 4);
  const s3 = suppliers(t3, ['Ordu İletişim Toptan']);
  simulate(t3, [t3Admin], c3, s3, 10, 1);

  // birkaç rezervasyon
  for (const dev of left1.slice(0, 3)) {
    db.run("UPDATE devices SET status = 'reserved', reserved_for = ?, reserved_note = 'Kapora alındı' WHERE id = ?", pick(c1), dev.id);
    inventory.movement(t1, dev.id, 'reserve', 'in_stock', 'reserved', { userId: t1Sales, note: 'Kapora alındı' });
  }

  // Hareket ve cihaz zaman damgalarını işlem tarihleriyle hizala
  db.getDb().exec(`
    UPDATE stock_movements SET created_at = (SELECT occurred_at FROM transactions t WHERE t.id = stock_movements.transaction_id) WHERE transaction_id IS NOT NULL;
    UPDATE devices SET created_at = (SELECT occurred_at FROM transactions t WHERE t.id = devices.purchase_tx_id), updated_at = COALESCE(sold_at, (SELECT occurred_at FROM transactions t WHERE t.id = devices.purchase_tx_id));
    UPDATE devices SET sold_at = (SELECT occurred_at FROM transactions t WHERE t.id = devices.sale_tx_id), updated_at = (SELECT occurred_at FROM transactions t WHERE t.id = devices.sale_tx_id) WHERE sale_tx_id IS NOT NULL;
  `);

  // Bekleyen bir personel daveti ve örnek denetim kayıtları
  db.run(
    "INSERT INTO invitations (tenant_id, email, full_name, role, permissions, token_hash, expires_at, created_by, created_at) VALUES (?, 'yeni.personel@yildiz.example', 'Gizem Şahin', 'user', ?, 'seed-invite-not-usable', ?, ?, ?)",
    t1, JSON.stringify(DEFAULT_USER_PERMISSIONS), addDays(clockNow(), 5), t1Admin, dateAt(2),
  );
  const auditRows = [
    [null, 1, 'admin.tenant_create', 'tenant', t1, 120], [null, 1, 'admin.tenant_create', 'tenant', t2, 60],
    [t3, t3Admin, 'tenant.register', 'tenant', t3, 11], [null, 1, 'admin.tenant_suspend', 'tenant', t4, 39],
    [t1, t1Admin, 'staff.invite', 'invitation', 1, 2], [t1, t1Admin, 'staff.update', 'user', t1Depot, 30],
    [t1, t1Admin, 'subscription.purchase', 'payment', null, 0], [t1, t1Sales, 'report.export', null, null, 1],
  ];
  for (const a of auditRows) db.run('INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, ip, created_at) VALUES (?,?,?,?,?,?,?)', a[0], a[1], a[2], a[3], a[4], '127.0.0.1', dateAt(a[5]));
  for (const [uid, tid, d] of [[t1Admin, t1, 0], [t1Sales, t1, 0], [t2Admin, t2, 1], [t3Admin, t3, 0]]) {
    db.run('INSERT INTO audit_logs (tenant_id, user_id, action, ip, created_at) VALUES (?,?,?,?,?)', tid, uid, 'auth.login', '127.0.0.1', dateAt(d, 9));
  }
  // Askıdaki işletmenin denemesi ve örnek hata kaydı
  db.run("INSERT INTO error_logs (tenant_id, user_id, method, path, status, message, created_at) VALUES (?, NULL, 'POST', '/api/auth/login', 403, 'İşletme hesabı askıya alınmış', ?)", t4, dateAt(3));

  const counts = db.one("SELECT (SELECT COUNT(*) FROM devices) d, (SELECT COUNT(*) FROM transactions) t, (SELECT COUNT(*) FROM devices WHERE status <> 'sold') s");
  console.log(`Demo verisi oluşturuldu: ${counts.d} cihaz (${counts.s} stokta/rezerve), ${counts.t} işlem.`);
  console.log(`
Giriş bilgileri (tüm işletme kullanıcılarının şifresi: Demo1234)
  Süper Admin      : admin@telefonsaas.local   / Admin1234
  İşletme Admini   : yonetici@yildiz.example    (Yıldız İletişim, Profesyonel plan)
  Kullanıcı (satış): satis@yildiz.example
  Kullanıcı (depo) : depo@yildiz.example        (yalnızca stok görüntüleme + sayım)
  İkinci işletme   : yonetici@karadeniz.example (Başlangıç plan: takas/dışa aktarma yok)
  Deneme sürümü    : yonetici@doga.example      (deneme süresi 3 gün içinde bitiyor)
  Askıdaki işletme : yonetici@eskicarsi.example (giriş engellenir)`);
  db.close();
}

main();

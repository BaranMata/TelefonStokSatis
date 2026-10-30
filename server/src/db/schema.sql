-- Telefon Stok ve Satış Takip Sistemi - Veritabanı şeması (SQLite)
-- Çok kiracılı yapı: paylaşımlı veritabanı, iş verisi tutan her tabloda tenant_id sütunu.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- Platform
CREATE TABLE IF NOT EXISTS plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  price_monthly  REAL NOT NULL DEFAULT 0,
  price_yearly   REAL NOT NULL DEFAULT 0,
  max_users      INTEGER NOT NULL,            -- -1 = sınırsız
  max_devices    INTEGER NOT NULL,            -- stokta tutulabilecek aktif cihaz sayısı, -1 = sınırsız
  modules        TEXT NOT NULL DEFAULT '[]',  -- JSON dizi: stock, sales, trade, reports, export, barcode, stock_count
  is_trial       INTEGER NOT NULL DEFAULT 0,
  trial_days     INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  tax_no      TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id      INTEGER NOT NULL REFERENCES tenants(id),
  plan_id        INTEGER NOT NULL REFERENCES plans(id),
  billing_cycle  TEXT NOT NULL CHECK (billing_cycle IN ('trial','monthly','yearly')),
  status         TEXT NOT NULL CHECK (status IN ('active','expired','cancelled','replaced')),
  starts_at      TEXT NOT NULL,
  ends_at        TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_subscriptions_tenant ON subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id),
  subscription_id  INTEGER REFERENCES subscriptions(id),
  plan_id          INTEGER NOT NULL REFERENCES plans(id),
  billing_cycle    TEXT NOT NULL,
  amount           REAL NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'TRY',
  provider         TEXT NOT NULL,
  provider_ref     TEXT,
  status           TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed')),
  failure_reason   TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_payments_tenant ON payments(tenant_id);

-- ---------------------------------------------------------------- Kimlik
CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id           INTEGER REFERENCES tenants(id),   -- süper adminde NULL
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash       TEXT NOT NULL,
  full_name           TEXT NOT NULL,
  phone               TEXT,
  role                TEXT NOT NULL CHECK (role IN ('super_admin','tenant_admin','user')),
  permissions         TEXT NOT NULL DEFAULT '[]',        -- JSON dizi, yalnızca 'user' rolü için anlamlı
  is_active           INTEGER NOT NULL DEFAULT 1,
  token_version       INTEGER NOT NULL DEFAULT 0,        -- artırıldığında tüm oturumlar geçersiz olur
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  last_login_at       TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK ((role = 'super_admin' AND tenant_id IS NULL) OR (role <> 'super_admin' AND tenant_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS invitations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
  email        TEXT NOT NULL COLLATE NOCASE,
  full_name    TEXT,
  role         TEXT NOT NULL CHECK (role IN ('tenant_admin','user')),
  permissions  TEXT NOT NULL DEFAULT '[]',
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TEXT NOT NULL,
  accepted_at  TEXT,
  revoked_at   TEXT,
  created_by   INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

-- Gerçek e-posta sunucusu yerine geliştirme ortamında giden e-postalar burada tutulur.
CREATE TABLE IF NOT EXISTS mail_outbox (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- ---------------------------------------------------------------- İş verisi (kiracıya ait)
CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
  full_name   TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  national_id TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  tax_no        TEXT,
  address       TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_suppliers_tenant ON suppliers(tenant_id);

-- Alış / satış / takas işlemlerinin başlığı
CREATE TABLE IF NOT EXISTS transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        INTEGER NOT NULL REFERENCES tenants(id),
  type             TEXT NOT NULL CHECK (type IN ('purchase','sale','trade')),
  customer_id      INTEGER REFERENCES customers(id),
  supplier_id      INTEGER REFERENCES suppliers(id),
  total_in         REAL NOT NULL DEFAULT 0,   -- işletmeye giren cihazların toplam değeri (alış / takasta alınan)
  total_out        REAL NOT NULL DEFAULT 0,   -- işletmeden çıkan cihazların toplam satış değeri
  net_amount       REAL NOT NULL DEFAULT 0,   -- müşteriden tahsil edilen (+) / ödenen (-) net tutar
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash','card','transfer','installment','mixed')),
  payment_status   TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','partial','unpaid')),
  paid_amount      REAL NOT NULL DEFAULT 0,
  occurred_at      TEXT NOT NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  notes            TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_transactions_tenant_date ON transactions(tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS devices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
  brand           TEXT NOT NULL,
  model           TEXT NOT NULL,
  storage         TEXT,
  color           TEXT,
  imei            TEXT NOT NULL,
  serial_no       TEXT,
  barcode         TEXT NOT NULL,
  condition       TEXT NOT NULL DEFAULT 'used' CHECK (condition IN ('new','used','refurbished')),
  purchase_price  REAL NOT NULL DEFAULT 0,   -- maliyet (alış veya takas değeri)
  list_price      REAL,                      -- etiket / önerilen satış fiyatı
  sale_price      REAL,                      -- gerçekleşen satış fiyatı
  status          TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','reserved','sold')),
  reserved_for    INTEGER REFERENCES customers(id),
  reserved_note   TEXT,
  purchase_tx_id  INTEGER REFERENCES transactions(id),
  sale_tx_id      INTEGER REFERENCES transactions(id),
  sold_at         TEXT,
  version         INTEGER NOT NULL DEFAULT 1, -- iyimser kilitleme
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (tenant_id, imei),
  UNIQUE (tenant_id, barcode)
);
CREATE INDEX IF NOT EXISTS ix_devices_tenant_status ON devices(tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_devices_tenant_brand ON devices(tenant_id, brand, model);

CREATE TABLE IF NOT EXISTS transaction_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
  transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
  device_id       INTEGER NOT NULL REFERENCES devices(id),
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  unit_price      REAL NOT NULL,     -- in: maliyet / out: satış fiyatı
  unit_cost       REAL NOT NULL      -- satış anındaki maliyet (kâr hesabı için sabitlenir)
);
CREATE INDEX IF NOT EXISTS ix_tx_items_tx ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS ix_tx_items_device ON transaction_items(device_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id),
  device_id       INTEGER NOT NULL REFERENCES devices(id),
  type            TEXT NOT NULL CHECK (type IN ('purchase_in','trade_in','sale_out','trade_out','reserve','unreserve','update','count_found','count_missing')),
  from_status     TEXT,
  to_status       TEXT,
  transaction_id  INTEGER REFERENCES transactions(id),
  user_id         INTEGER REFERENCES users(id),
  note            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_movements_device ON stock_movements(tenant_id, device_id);

CREATE TABLE IF NOT EXISTS stock_counts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  note         TEXT,
  expected     INTEGER,
  found        INTEGER,
  missing      INTEGER,
  unexpected   INTEGER,
  started_by   INTEGER NOT NULL REFERENCES users(id),
  started_at   TEXT NOT NULL,
  closed_at    TEXT
);

CREATE TABLE IF NOT EXISTS stock_count_scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id),
  count_id    INTEGER NOT NULL REFERENCES stock_counts(id),
  code        TEXT NOT NULL,
  device_id   INTEGER REFERENCES devices(id),
  result      TEXT NOT NULL CHECK (result IN ('ok','not_in_stock','unknown')),
  scanned_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL,
  UNIQUE (count_id, code)
);

-- ---------------------------------------------------------------- Günlükler
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   INTEGER REFERENCES tenants(id),
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_tenant ON audit_logs(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS error_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id   INTEGER,
  user_id     INTEGER,
  method      TEXT,
  path        TEXT,
  status      INTEGER,
  message     TEXT,
  stack       TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name   TEXT NOT NULL,
  size_bytes  INTEGER,
  kind        TEXT NOT NULL CHECK (kind IN ('auto','manual','pre_restore','restore')),
  user_id     INTEGER,
  created_at  TEXT NOT NULL
);

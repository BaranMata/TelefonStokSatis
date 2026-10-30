// Test ortamı: her test dosyası geçici bir klasörde boş bir veritabanıyla çalışır.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tss-test-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = tmp;
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.BACKUP_INTERVAL_HOURS = '0';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const db = require('../src/db');
const config = require('../src/config');
const subscription = require('../src/services/subscription');
const { createApp } = require('../src/app');
const { now, luhnCheckDigit } = require('../src/utils/common');

db.open(config.dbPath);
const app = createApp();

const PASSWORD = 'Test1234';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const ALL_MODULES = ['stock', 'sales', 'trade', 'reports', 'export', 'barcode', 'stock_count'];

function plan(code, { maxUsers = 10, maxDevices = 100, modules = ALL_MODULES, trial = false, price = 100 } = {}) {
  const r = db.run(
    'INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_devices, modules, is_trial, trial_days, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    code, code, trial ? 0 : price, trial ? 0 : price * 10, maxUsers, maxDevices, JSON.stringify(modules), trial ? 1 : 0, trial ? 14 : 0, now(),
  );
  return Number(r.lastInsertRowid);
}

function user(tenantId, email, role, permissions = []) {
  const ts = now();
  const r = db.run('INSERT INTO users (tenant_id, email, password_hash, full_name, role, permissions, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', tenantId, email, HASH, email.split('@')[0], role, JSON.stringify(permissions), ts, ts);
  return Number(r.lastInsertRowid);
}

function tenant(name, planId, cycle = 'monthly') {
  const ts = now();
  const r = db.run("INSERT INTO tenants (name, slug, status, created_at, updated_at) VALUES (?,?, 'active', ?, ?)", name, name.toLowerCase().replace(/\W+/g, '-'), ts, ts);
  const id = Number(r.lastInsertRowid);
  subscription.activate(id, planId, cycle);
  return id;
}

/** Oturum çerezini saklayan, CSRF başlığını otomatik ekleyen istemci */
function client() {
  const agent = request.agent(app);
  const wrap = (m) => (url) => agent[m](url).set('x-requested-with', 'fetch');
  return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), agent };
}

async function login(email, password = PASSWORD) {
  const c = client();
  const res = await c.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Giriş başarısız (${email}): ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

let imeiSeq = 1;
function imei() {
  const body = `35000000${String(imeiSeq++).padStart(6, '0')}`;
  return body + luhnCheckDigit(body);
}

const device = (over = {}) => ({ brand: 'Apple', model: 'iPhone 13', storage: '128 GB', color: 'Siyah', imei: imei(), condition: 'used', cost: 20000, list_price: 23000, ...over });

/** İki işletmeli standart senaryo */
function baseScenario() {
  const pro = plan(`pro-${imeiSeq}`);
  const superAdmin = db.one("SELECT id FROM users WHERE role = 'super_admin'")?.id ?? db.run("INSERT INTO users (tenant_id, email, password_hash, full_name, role, created_at, updated_at) VALUES (NULL, 'super@test.local', ?, 'Süper', 'super_admin', ?, ?)", HASH, now(), now()).lastInsertRowid;
  const tag = imeiSeq;
  const A = tenant(`Isletme A ${tag}`, pro);
  const B = tenant(`Isletme B ${tag}`, pro);
  return {
    planId: pro,
    superAdmin: Number(superAdmin),
    A: { id: A, admin: user(A, `admin-a${tag}@test.local`, 'tenant_admin'), seller: user(A, `seller-a${tag}@test.local`, 'user', ['stock.view', 'sale.create', 'customer.manage']), adminEmail: `admin-a${tag}@test.local`, sellerEmail: `seller-a${tag}@test.local` },
    B: { id: B, admin: user(B, `admin-b${tag}@test.local`, 'tenant_admin'), adminEmail: `admin-b${tag}@test.local` },
  };
}

async function buy(c, devices, extra = {}) {
  const res = await c.post('/api/purchases').send({ devices, paymentMethod: 'cash', ...extra });
  if (res.status !== 201) throw new Error(`Alış başarısız: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = { app, db, client, login, plan, user, tenant, device, imei, baseScenario, buy, PASSWORD, ALL_MODULES };

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

function resolveFromRoot(p) {
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

const dataDir = resolveFromRoot(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// JWT anahtarı ortam değişkeninden okunur; yoksa ilk çalıştırmada üretilip data/ altına kaydedilir
// (böylece sunucu yeniden başladığında oturumlar düşmez ve anahtar kaynak koda girmez).
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  dataDir,
  dbPath: process.env.DB_PATH ? resolveFromRoot(process.env.DB_PATH) : path.join(dataDir, 'app.db'),
  backupDir: resolveFromRoot(process.env.BACKUP_DIR || 'backups'),
  backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS || 6),
  backupKeep: Number(process.env.BACKUP_KEEP || 14),
  jwtSecret: loadSecret(),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  maxFailedLogins: 5,
  lockMinutes: 15,
  clientDist: path.resolve(ROOT, '..', 'client', 'dist'),
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
};

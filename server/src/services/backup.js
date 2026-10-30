const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const db = require('../db');
const config = require('../config');
const { AppError, now } = require('../utils/common');

const NAME_RE = /^backup-\d{8}-\d{6}(-\d+)?-(auto|manual|pre_restore)\.db$/;

function stamp() {
  return now().replace(/[-:]/g, '').replace(' ', '-');
}

function uniqueFile(kind) {
  fs.mkdirSync(config.backupDir, { recursive: true });
  let name = `backup-${stamp()}-${kind}.db`;
  for (let i = 1; fs.existsSync(path.join(config.backupDir, name)); i++) name = `backup-${stamp()}-${i}-${kind}.db`;
  return name;
}

/** Çalışan veritabanının tutarlı bir kopyasını alır (SQLite VACUUM INTO). */
function createBackup(kind = 'manual', userId = null) {
  const fileName = uniqueFile(kind);
  const full = path.join(config.backupDir, fileName);
  db.getDb().prepare('VACUUM INTO ?').run(full);
  const size = fs.statSync(full).size;
  db.run('INSERT INTO backup_logs (file_name, size_bytes, kind, user_id, created_at) VALUES (?,?,?,?,?)', fileName, size, kind, userId, now());
  prune();
  return { fileName, size };
}

/** Otomatik yedeklerden yalnızca son N tanesini tutar. */
function prune() {
  const autos = listBackups().filter((b) => b.kind === 'auto');
  for (const b of autos.slice(config.backupKeep)) fs.rmSync(path.join(config.backupDir, b.fileName), { force: true });
}

function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((f) => NAME_RE.test(f))
    .map((f) => {
      const st = fs.statSync(path.join(config.backupDir, f));
      // Zaman damgası dosya adından okunur (uygulama saatiyle yazıldığı için demo saatinde de tutarlıdır)
      const [, d, t] = f.match(/^backup-(\d{8})-(\d{6})/);
      const createdAt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`;
      return { fileName: f, size: st.size, kind: f.match(NAME_RE)[2], createdAt };
    })
    .sort((a, b) => b.fileName.localeCompare(a.fileName));
}

/**
 * Yedekten geri yükleme: önce mevcut durumun 'pre_restore' yedeği alınır, bağlantı kapatılır,
 * yedek dosyası veritabanı dosyasının üzerine kopyalanır ve bağlantı yeniden açılır.
 */
function restoreBackup(fileName, userId = null) {
  if (!NAME_RE.test(fileName)) throw new AppError(400, 'INVALID_BACKUP', 'Geçersiz yedek adı');
  const src = path.join(config.backupDir, fileName);
  if (!fs.existsSync(src)) throw new AppError(404, 'NOT_FOUND', 'Yedek bulunamadı');

  // Yedek dosyasının geçerli bir uygulama veritabanı olduğunu doğrula
  try {
    const probe = new DatabaseSync(src, { readOnly: true });
    const ok = probe.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name IN ('tenants','users','devices')").get().c === 3;
    probe.close();
    if (!ok) throw new Error('eksik tablo');
  } catch (e) {
    throw new AppError(400, 'INVALID_BACKUP', `Yedek dosyası doğrulanamadı: ${e.message}`);
  }

  const safety = createBackup('pre_restore', userId);
  const target = db.path;
  db.close();
  try {
    for (const ext of ['-wal', '-shm']) fs.rmSync(target + ext, { force: true });
    fs.copyFileSync(src, target);
  } finally {
    db.open(target);
  }
  db.run("INSERT INTO backup_logs (file_name, size_bytes, kind, user_id, created_at) VALUES (?,?, 'restore', ?, ?)", fileName, fs.statSync(src).size, userId, now());
  return { restored: fileName, safetyBackup: safety.fileName };
}

let timer = null;
function startScheduler() {
  if (!(config.backupIntervalHours > 0)) return;
  const run = () => {
    try {
      const b = createBackup('auto');
      console.log(`[yedek] otomatik yedek alındı: ${b.fileName}`);
    } catch (e) {
      console.error('[yedek] hata:', e.message);
    }
  };
  run();
  timer = setInterval(run, config.backupIntervalHours * 3600 * 1000);
  timer.unref();
}

module.exports = { createBackup, listBackups, restoreBackup, startScheduler };

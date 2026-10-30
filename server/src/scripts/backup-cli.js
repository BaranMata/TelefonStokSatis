// Komut satırından yedek alma / geri yükleme
//   npm run backup
//   npm run restore -- backup-20260801-120000-manual.db
// Geri yükleme sırasında sunucunun kapalı olması önerilir.
const config = require('../config');
const db = require('../db');
const backup = require('../services/backup');

const [cmd, file] = process.argv.slice(2);
db.open(config.dbPath);
try {
  if (cmd === 'backup') {
    const b = backup.createBackup('manual');
    console.log(`Yedek alındı: ${b.fileName} (${(b.size / 1024).toFixed(1)} KB)`);
  } else if (cmd === 'restore') {
    if (!file) {
      console.log('Kullanım: npm run restore -- <yedek-dosyası>\nMevcut yedekler:');
      for (const b of backup.listBackups()) console.log(`  ${b.fileName}  ${(b.size / 1024).toFixed(1)} KB`);
      process.exitCode = 1;
    } else {
      const r = backup.restoreBackup(file);
      console.log(`Geri yüklendi: ${r.restored}\nÖnceki durumun güvenlik yedeği: ${r.safetyBackup}`);
    }
  } else {
    console.log('Komut: backup | restore');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('Hata:', e.message);
  process.exitCode = 1;
} finally {
  db.close();
}

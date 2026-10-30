const config = require('./config');
const db = require('./db');
const backup = require('./services/backup');
const { createApp } = require('./app');

db.open(config.dbPath);
const noUsers = db.one('SELECT COUNT(*) c FROM users').c === 0;

const app = createApp();
app.listen(config.port, () => {
  console.log(`Telefon Stok ve Satış Takip Sistemi çalışıyor: http://localhost:${config.port}`);
  console.log(`Veritabanı: ${config.dbPath}`);
  if (noUsers) console.log('Uyarı: veritabanında kullanıcı yok. Demo verisi için: npm run seed');
  backup.startScheduler();
});

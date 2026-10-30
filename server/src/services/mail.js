const db = require('../db');
const config = require('../config');
const { now } = require('../utils/common');

/**
 * E-posta servisi. Projede gerçek bir SMTP sunucusu yoktur; iletiler mail_outbox tablosuna yazılır
 * ve geliştirme ortamında konsola basılır. Gerçek ortamda yalnızca bu fonksiyonun gövdesi
 * bir SMTP / e-posta API istemcisiyle değiştirilir.
 */
function sendMail(to, subject, body) {
  db.run('INSERT INTO mail_outbox (to_email, subject, body, created_at) VALUES (?,?,?,?)', to, subject, body, now());
  if (config.env !== 'test') console.log(`[mail] -> ${to} | ${subject}\n${body}\n`);
}

module.exports = { sendMail };

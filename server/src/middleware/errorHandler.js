const db = require('../db');
const config = require('../config');
const { AppError, now } = require('../utils/common');

function logError(req, status, err) {
  try {
    db.run(
      'INSERT INTO error_logs (tenant_id, user_id, method, path, status, message, stack, created_at) VALUES (?,?,?,?,?,?,?,?)',
      req.user?.tenant_id ?? null, req.user?.id ?? null, req.method, req.originalUrl.slice(0, 300), status, String(err.message).slice(0, 1000),
      status >= 500 ? String(err.stack || '').slice(0, 4000) : null, now(),
    );
  } catch {
    /* hata kaydı yazılamazsa yanıtı engelleme */
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // SQLite benzersizlik ihlali (ör. aynı IMEI ikinci kez) -> 409
  if (!(err instanceof AppError) && /UNIQUE constraint failed/.test(err.message || '')) {
    const field = /imei/.test(err.message) ? 'IMEI' : /barcode/.test(err.message) ? 'Barkod' : /email/.test(err.message) ? 'E-posta' : 'Kayıt';
    err = new AppError(409, 'DUPLICATE', `${field} zaten kayıtlı`);
  }
  if (err.type === 'entity.parse.failed') err = new AppError(400, 'BAD_JSON', 'Geçersiz JSON');

  const status = err instanceof AppError ? err.status : 500;
  // Güvenlik ve iş kuralı açısından anlamlı hatalar ile beklenmeyen hatalar kaydedilir
  if (status >= 500 || [402, 403, 409].includes(status)) logError(req, status, err);
  if (status >= 500 && config.env !== 'test') console.error(err);

  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'Beklenmeyen bir sunucu hatası oluştu' : err.message,
      details: err.details,
    },
  });
}

module.exports = errorHandler;

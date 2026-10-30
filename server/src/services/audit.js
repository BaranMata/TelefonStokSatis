const db = require('../db');
const { now } = require('../utils/common');

/** Denetim kaydı yazar. req verilirse kullanıcı, kiracı ve IP bilgisi oradan alınır. */
function audit(req, action, { entity = null, entityId = null, details = null, tenantId, userId } = {}) {
  const user = req?.user;
  try {
    db.run(
      'INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, details, ip, created_at) VALUES (?,?,?,?,?,?,?,?)',
      tenantId !== undefined ? tenantId : user?.tenant_id ?? null,
      userId !== undefined ? userId : user?.id ?? null,
      action,
      entity,
      entityId,
      details ? JSON.stringify(details) : null,
      req?.ip ?? null,
      now(),
    );
  } catch (e) {
    // Denetim kaydının yazılamaması asıl işlemi geri almaz; sunucu günlüğüne düşülür
    console.error('[audit] yazılamadı:', action, e.message);
  }
}

module.exports = { audit };

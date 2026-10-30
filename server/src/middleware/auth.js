const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const subscription = require('../services/subscription');
const { AppError, parseJson } = require('../utils/common');

const COOKIE = 'tss_sid';

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript erişemez (XSS ile çalınamaz)
    sameSite: 'strict', // başka sitelerden gelen isteklerde gönderilmez (CSRF)
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: config.sessionHours * 3600 * 1000,
    path: '/',
  };
}

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, cookieOptions());
}

function clearSession(res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/**
 * Her istekte oturum belirtecini doğrular ve kullanıcıyı veritabanından yeniden yükler.
 * Böylece devre dışı bırakılan kullanıcı, şifresi değişen kullanıcı (token_version) veya
 * askıya alınan işletme anında erişimini kaybeder.
 */
function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new AppError(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor'));
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    clearSession(res);
    return next(new AppError(401, 'UNAUTHENTICATED', 'Oturum süresi doldu, tekrar giriş yapın'));
  }
  const user = db.one('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user || !user.is_active || user.token_version !== payload.tv) {
    clearSession(res);
    return next(new AppError(401, 'UNAUTHENTICATED', 'Oturum geçersiz'));
  }
  if (user.tenant_id) {
    const tenant = db.one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    if (!tenant || tenant.status !== 'active') {
      clearSession(res);
      return next(new AppError(403, 'TENANT_INACTIVE', tenant?.status === 'closed' ? 'İşletme hesabı kapatılmış' : 'İşletme hesabı askıya alınmış'));
    }
    req.tenant = tenant;
  }
  user.permissions = parseJson(user.permissions, []);
  delete user.password_hash;
  req.user = user;
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok'));

/**
 * Kiracı bağlamı: kiracı kimliği her zaman oturumdaki kullanıcıdan alınır, istemciden gelen
 * hiçbir parametreye güvenilmez. Süper admin işletmelerin iş verisine (stok, satış...) erişemez.
 */
function requireTenant(req, res, next) {
  if (!req.user?.tenant_id || req.user.role === 'super_admin') {
    return next(new AppError(403, 'FORBIDDEN', 'Bu alan yalnızca işletme kullanıcıları içindir'));
  }
  req.tenantId = req.user.tenant_id;
  req.subscription = subscription.getCurrent(req.tenantId);
  next();
}

function hasPermission(user, perm) {
  return user.role === 'tenant_admin' || (user.role === 'user' && user.permissions.includes(perm));
}

const requirePermission = (...perms) => (req, res, next) =>
  perms.some((p) => hasPermission(req.user, p)) ? next() : next(new AppError(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok'));

/** Planın içerdiği modül kontrolü */
const requireModule = (mod) => (req, res, next) => {
  const modules = req.subscription?.plan?.modules || [];
  return modules.includes(mod) ? next() : next(new AppError(403, 'MODULE_NOT_IN_PLAN', 'Bu modül mevcut planınıza dahil değil'));
};

/** Abonelik süresi dolduysa yalnızca okuma (GET) işlemlerine izin verilir. */
function requireActiveSubscription(req, res, next) {
  const s = req.subscription;
  if (s && !s.expired) return next();
  if (req.method === 'GET') return next();
  next(new AppError(402, 'SUBSCRIPTION_EXPIRED', 'Abonelik süreniz doldu. Sistem salt okunur modda; devam etmek için aboneliğinizi yenileyin.'));
}

/** Basit CSRF savunması: değişiklik yapan isteklerde özel başlık zorunlu (çapraz kökenden ön kontrolsüz gönderilemez). */
function requireCsrfHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'fetch') return next(new AppError(403, 'CSRF', 'Geçersiz istek kaynağı'));
  next();
}

module.exports = { COOKIE, issueSession, clearSession, authenticate, requireRole, requireTenant, requirePermission, requireModule, requireActiveSubscription, requireCsrfHeader, hasPermission };

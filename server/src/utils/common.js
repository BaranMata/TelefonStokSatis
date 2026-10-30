const crypto = require('node:crypto');

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Uygulama saati. DEMO_NOW ortam değişkeni verilirse (ör. 2026-08-14T15:30:00) uygulamanın
 * "şimdi"si o andan başlayıp gerçek zamanla birlikte ilerler; demo verisinin tarihleriyle
 * panelin "bugün / bu ay" hesapları tutarlı olur. Değişken yoksa gerçek saat kullanılır.
 */
const demoOffset = process.env.DEMO_NOW ? Date.parse(process.env.DEMO_NOW) - Date.now() : 0;
if (Number.isNaN(demoOffset)) throw new Error(`Geçersiz DEMO_NOW: ${process.env.DEMO_NOW}`);
const clockNow = () => new Date(Date.now() + demoOffset);

const pad = (n) => String(n).padStart(2, '0');

// Tarihler sunucunun yerel saatinde 'YYYY-MM-DD HH:MM:SS' biçiminde tutulur (SQLite date() ile uyumlu).
function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const now = () => formatDate(clockNow());
function addDays(base, days) {
  const d = typeof base === 'string' ? new Date(base.replace(' ', 'T')) : new Date(base);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}
function addMinutes(base, minutes) {
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + minutes);
  return formatDate(d);
}

// IMEI 15 haneli olmalı ve son hane Luhn kontrol hanesidir.
function isValidImei(imei) {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = Number(imei[14 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function luhnCheckDigit(body14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = Number(body14[13 - i]);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return String((10 - (sum % 10)) % 10);
}

const randomToken = () => crypto.randomBytes(32).toString('hex');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const money = (n) => Math.round(Number(n || 0) * 100) / 100;

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// Express 4 async hata yakalama sarmalayıcısı
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// zod şemasıyla doğrulama: hata durumunda 400 döner
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Gönderilen veriler geçersiz', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
    }
    req[source === 'body' ? 'body' : 'validQuery'] = result.data;
    next();
  };
}

function paging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { AppError, clockNow, now, formatDate, addDays, addMinutes, isValidImei, luhnCheckDigit, randomToken, sha256, money, parseJson, ah, validate, paging };

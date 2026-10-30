const { z } = require('zod');
const { isValidImei } = require('./common');

const password = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı')
  .max(128)
  .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, 'Şifre en az bir harf içermeli')
  .regex(/\d/, 'Şifre en az bir rakam içermeli');

const optText = (max = 300) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const price = z.coerce.number().min(0).max(10_000_000);
const id = z.coerce.number().int().positive();

const imei = z
  .string()
  .trim()
  .refine(isValidImei, 'IMEI 15 haneli ve geçerli (Luhn kontrollü) olmalı');

const deviceInput = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(100),
  storage: optText(20),
  color: optText(40),
  imei,
  serial_no: optText(60),
  condition: z.enum(['new', 'used', 'refurbished']).default('used'),
  list_price: price.optional().nullable(),
  notes: optText(500),
});

const paymentMethod = z.enum(['cash', 'card', 'transfer', 'installment', 'mixed']);
const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/, 'Tarih YYYY-AA-GG [SS:DD] biçiminde olmalı')
  .optional();

function slugify(s) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return (
    s
      .toLocaleLowerCase('tr')
      .replace(/[çğıöşüİ]/g, (c) => map[c])
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'isletme'
  );
}

module.exports = { password, optText, price, id, imei, deviceInput, paymentMethod, dateTime, slugify };

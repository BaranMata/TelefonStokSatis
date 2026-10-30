const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let db = null;
let currentPath = null;
let txDepth = 0;

function open(dbPath) {
  if (db) close();
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  currentPath = dbPath;
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(schema);
  return db;
}

function getDb() {
  if (!db) throw new Error('Veritabanı açılmadı');
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Fonksiyonu tek bir veritabanı işlemi (transaction) içinde çalıştırır.
 * BEGIN IMMEDIATE yazma kilidini en başta alır; böylece aynı veritabanına bağlanan başka bir
 * süreç aynı anda çakışan bir yazma başlatamaz. İç içe çağrılar dış işleme katılır.
 */
function tx(fn) {
  const d = getDb();
  if (txDepth > 0) return fn(d);
  d.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

// node:sqlite undefined ve boolean bağlayamaz: undefined -> NULL, true/false -> 1/0
const bind = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));

// Kısa yardımcılar
const one = (sql, ...params) => getDb().prepare(sql).get(...bind(params));
const all = (sql, ...params) => getDb().prepare(sql).all(...bind(params));
const run = (sql, ...params) => getDb().prepare(sql).run(...bind(params));

module.exports = { open, close, getDb, tx, one, all, run, get path() { return currentPath; } };

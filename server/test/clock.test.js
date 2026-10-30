// DEMO_NOW: uygulama saati sabit bir tarihten başlatılabilir; değişken yoksa gerçek saat kullanılır.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const common = path.join(__dirname, '..', 'src', 'utils', 'common.js');
const run = (env) =>
  execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(common)}).now())`], { env: { ...process.env, DEMO_NOW: '', ...env } }).toString().trim();

test('DEMO_NOW verilince now() o tarihten başlar', () => {
  assert.match(run({ DEMO_NOW: '2026-08-14T15:30:00' }), /^2026-08-14 15:30:0\d$/);
});

test('DEMO_NOW yoksa gerçek saat kullanılır', () => {
  assert.equal(run({}).slice(0, 10), require('../src/utils/common').formatDate(new Date()).slice(0, 10));
});

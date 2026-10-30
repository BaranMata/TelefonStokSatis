// Rapor / dokümantasyon için ekran görüntüleri ve örnek dışa aktarma dosyaları üretir.
// Ön koşul: sunucu çalışıyor (npm start) ve seed verisi yüklü (npm run seed).
// Kullanım: npm run screenshots   (BASE_URL ve BROWSER ortam değişkenleriyle değiştirilebilir)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(root, 'docs', 'screenshots');
const SAMPLES = path.join(root, 'docs', 'ornek-ciktilar');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('Edge / Chrome bulunamadı; BROWSER ortam değişkeniyle yolu verin.');

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SAMPLES, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--lang=tr-TR'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(width = 1440, height = 900, mobile = false) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  return page;
}

async function api(page, method, url, body) {
  return page.evaluate(
    async (m, u, b) => {
      const r = await fetch(`/api${u}`, { method: m, headers: { 'x-requested-with': 'fetch', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    method, url, body,
  );
}

async function login(page, email, password = 'Demo1234') {
  await page.goto(`${BASE}/giris`, { waitUntil: 'networkidle0' });
  const r = await api(page, 'POST', '/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`${email} giriş yapamadı: ${JSON.stringify(r.body)}`);
}

async function shot(page, name, url, { full = true, before } = {}) {
  if (url) await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' });
  if (before) await before(page);
  await sleep(1300); // grafik animasyonları
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  console.log('✓', name);
}

async function saveExport(page, url, file) {
  const b64 = await page.evaluate(async (u) => {
    const r = await fetch(`/api${u}`);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (const x of buf) s += String.fromCharCode(x);
    return btoa(s);
  }, url);
  fs.writeFileSync(path.join(SAMPLES, file), Buffer.from(b64, 'base64'));
  console.log('✓', file);
}

const clickText = (text) => async (page) => {
  await page.locator(`::-p-text(${text})`).click();
  await sleep(500);
};

try {
  // ------------------------------------------------------------ giriş ekranı
  let p = await newPage();
  await shot(p, '01-giris', '/giris', { full: false });

  // ------------------------------------------------------------ İşletme Admini
  p = await newPage();
  await login(p, 'yonetici@yildiz.example');
  const sold = (await api(p, 'GET', '/devices?status=sold&pageSize=1')).body.items[0];
  const inStock = (await api(p, 'GET', '/devices?status=in_stock&pageSize=12')).body.items;
  await shot(p, '02-panel', '/');
  await shot(p, '03-stok-listesi', '/stok');
  await shot(p, '04-cihaz-detay-kar-ve-hareketler', `/stok/${sold.id}`);
  await shot(p, '05-alis-toplu-giris', '/alis', {
    before: async (pg) => {
      await clickText('Toplu yapıştır')(pg);
      await pg.type('textarea', 'Apple;iPhone 13;128 GB;Mavi;356938035643809;F2LXK1;21500;24500\nSamsung;Galaxy A55;256 GB;Lacivert;352099001761481;R58T;14000;16000');
      await clickText('Satırları aktar')(pg);
    },
  });
  await shot(p, '06-satis', `/satis?device=${inStock[0].id}`);
  await shot(p, '07-takas', '/takas');
  await shot(p, '08-islemler-filtre', '/islemler');
  await shot(p, '09-rapor-donemsel', '/raporlar');
  await shot(p, '10-rapor-cihaz-kar', '/raporlar', { full: false, before: clickText('Cihaz bazında kâr') });
  await shot(p, '11-rapor-marka-model', '/raporlar', { before: clickText('Marka / model dağılımı') });
  await shot(p, '12-musteriler', '/musteriler');
  await shot(p, '13-tedarikciler', '/tedarikciler');

  // Stok sayımı: açık sayım yoksa başlat ve birkaç cihaz okut
  const counts = (await api(p, 'GET', '/stock-counts')).body.items;
  let open = counts.find((c) => c.status === 'open');
  if (!open) open = (await api(p, 'POST', '/stock-counts', { note: 'Ekran görüntüsü için örnek sayım' })).body;
  for (const d of inStock.slice(2, 9)) await api(p, 'POST', `/stock-counts/${open.id}/scan`, { code: d.imei });
  await api(p, 'POST', `/stock-counts/${open.id}/scan`, { code: '359999000000005' });
  await shot(p, '14-stok-sayimi', '/sayim');
  await shot(p, '15-barkod-etiketleri', `/etiketler?ids=${inStock.slice(0, 9).map((d) => d.id).join(',')}`);
  await shot(p, '16-personel-yetkiler', '/yonetim/personel');
  await shot(p, '17-personel-yetki-duzenleme', '/yonetim/personel', {
    full: false,
    before: async (pg) => {
      const buttons = await pg.$$('td button');
      await buttons[1].click();
      await sleep(400);
    },
  });
  await shot(p, '18-faaliyet-gecmisi', '/yonetim/faaliyet');
  await shot(p, '19-abonelik', '/yonetim/abonelik');
  await shot(p, '20-isletme-profili', '/yonetim/isletme', { full: false });

  // Örnek dışa aktarma dosyaları
  await saveExport(p, '/reports/export?report=period&format=pdf&groupBy=month', 'aylik-rapor.pdf');
  await saveExport(p, '/reports/export?report=period&format=xlsx&groupBy=week', 'haftalik-rapor.xlsx');
  await saveExport(p, '/reports/export?report=device-profit&format=pdf', 'cihaz-kar-raporu.pdf');
  await saveExport(p, '/transactions/export?format=xlsx', 'islem-listesi.xlsx');

  // ------------------------------------------------------------ Kullanıcı rolleri
  p = await newPage();
  await login(p, 'satis@yildiz.example');
  await shot(p, '21-kullanici-satis-paneli', '/', { full: false });
  await shot(p, '22-kullanici-profil-yetkiler', '/profil', { full: false });
  p = await newPage();
  await login(p, 'depo@yildiz.example');
  await shot(p, '23-kullanici-depo-kisitli-menu', '/stok', { full: false });

  // ------------------------------------------------------------ Süper Admin
  p = await newPage();
  await login(p, 'admin@telefonsaas.local', 'Admin1234');
  await shot(p, '24-superadmin-genel-bakis', '/admin');
  await shot(p, '25-superadmin-isletmeler', '/admin/isletmeler');
  await shot(p, '26-superadmin-isletme-detay', '/admin/isletmeler/1');
  await shot(p, '27-superadmin-planlar', '/admin/planlar');
  await shot(p, '28-superadmin-islem-gunlukleri', '/admin/islem-gunlugu', { full: false });
  await shot(p, '29-superadmin-hata-kayitlari', '/admin/hatalar', { full: false });
  await shot(p, '30-superadmin-yedekleme', '/admin/yedekler', { full: false });

  // ------------------------------------------------------------ Abonelik durumları
  p = await newPage();
  await login(p, 'yonetici@doga.example');
  await shot(p, '31-deneme-suresi-uyarisi', '/', { full: false });
  p = await newPage();
  await shot(p, '32-askidaki-isletme-girisi', '/giris', {
    full: false,
    before: async (pg) => {
      await pg.type('input[type=email]', 'yonetici@eskicarsi.example');
      await pg.type('input[type=password]', 'Demo1234');
      await pg.click('button.primary');
      await sleep(600);
    },
  });

  // ------------------------------------------------------------ Mobil görünüm
  p = await newPage(390, 844, true);
  await login(p, 'yonetici@yildiz.example');
  await shot(p, '33-mobil-panel', '/', { full: false });
  await shot(p, '34-mobil-stok', '/stok', { full: false });
  await shot(p, '35-mobil-menu', '/stok', { full: false, before: async (pg) => { await pg.click('.menu-btn'); await sleep(400); } });
} finally {
  await browser.close();
}
console.log(`\nÇıktılar: ${OUT}\n          ${SAMPLES}`);

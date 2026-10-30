# Telefon Stok ve Satış Takip Sistemi

Telefon alım satımı yapan işletmeler için çok kiracılı (multi-tenant), abonelik modelli, web tabanlı SaaS uygulaması.

- **Stok**: IMEI ve seri no ile cihaz kaydı, tekli/toplu giriş, barkod etiketi, durum takibi (stokta / rezerve / satıldı), hızlı arama, stok sayımı, hareket geçmişi
- **Alış, satış, takas**: müşteri ve tedarikçi kayıtları, ödeme bilgisi, takas bedeli, cihaz bazında kâr/zarar/marj
- **Raporlar**: panel; günlük, haftalık ve aylık rapor; marka/model dağılımı; tarih, IMEI, ürün, kullanıcı ve işlem türü filtreleri; Excel/PDF
- **Roller**: Süper Admin, İşletme Admini, Kullanıcı (yetki bazlı)
- **Abonelik**: deneme, aylık ve yıllık plan; kullanıcı, stok ve modül limitleri; süre dolunca salt okunur mod; soyut ödeme altyapısı
- **Güvenlik**: HttpOnly oturum, şifre yenileme, RBAC, sunucu tarafında kiracı izolasyonu, denetim kaydı, otomatik yedek ve geri yükleme, çift satışa karşı eş zamanlılık koruması

Teknoloji: Node.js 24 · Express · SQLite (`node:sqlite`) · React 18 · Vite

## Gereksinimler

- **Node.js 22.13 veya üzeri** (geliştirme Node 24.12 ile yapıldı). Ayrı bir veritabanı sunucusu gerekmez.
- İsteğe bağlı: ekran görüntüsü ve diyagram betikleri için Microsoft Edge veya Google Chrome.

## Kurulum ve çalıştırma

```bash
cd telefon-saas
npm install          # kök: ekran görüntüsü betiği bağımlılığı (isteğe bağlı)
npm run setup        # sunucu + arayüz bağımlılıkları, arayüz derlemesi ve demo verisi
npm run demo         # demo saatiyle başlatır (bugün = 14.08.2026)
```

Tarayıcıda **http://localhost:3000** adresini açın.

### Demo saati (DEMO_NOW)

Demo verisi staj dönemine (21.07–17.08.2026) göre üretilir. Paneldeki "bugün / bu hafta / bu ay" hesaplarının bu veriyle tutarlı olması için demo, sabitlenmiş bir uygulama saatiyle çalışır: `server/demo.env` içindeki `DEMO_NOW=2026-08-14T15:30:00`. Saat o andan itibaren gerçek zamanla birlikte ilerler.

| Komut | Saat | Kullanım |
|---|---|---|
| `npm run demo:seed` ve `npm run demo` | DEMO_NOW (14.08.2026) | Demo, ekran görüntüleri, rapor |
| `npm run seed` ve `npm start` | Gerçek saat | Normal kullanım (DEMO_NOW tanımlı değilse davranış değişmez) |

`seed` ve `demo:seed` komutları veritabanını **sıfırlar** ve demo verisini yeniden yükler.

### Geliştirme modu (canlı yenileme)

İki ayrı terminalde:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Arayüz http://localhost:5173 adresinde açılır; `/api` istekleri 3000 portuna yönlendirilir.

## Demo hesapları

İşletme kullanıcılarının şifresi `Demo1234`. Giriş ekranındaki "Demo hesapları" kutusu formu otomatik doldurur.

| Rol | E-posta | Not |
|---|---|---|
| Süper Admin | `admin@telefonsaas.local` (şifre `Admin1234`) | Platform yönetimi |
| İşletme Admini | `yonetici@yildiz.example` | Yıldız İletişim, Profesyonel plan, ~90 günlük işlem geçmişi |
| Kullanıcı (satış) | `satis@yildiz.example` | Stok, alış, satış, takas, müşteri, rapor yetkileri |
| Kullanıcı (depo) | `depo@yildiz.example` | Yalnızca stok görüntüleme ve sayım |
| İşletme Admini | `yonetici@karadeniz.example` | Başlangıç plan: takas, dışa aktarma ve sayım modülü yok; kullanıcı limiti dolu |
| İşletme Admini | `yonetici@doga.example` | Ücretsiz deneme, 3 gün kaldı (uyarı bandı) |
| İşletme Admini | `yonetici@eskicarsi.example` | Askıya alınmış işletme: giriş engellenir |

Demo verisi tamamen kurgusaldır. İşletme, kişi ve IMEI'ler gerçek değildir; IMEI'ler yalnızca Luhn kuralına uyacak şekilde üretilir.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run setup` | Bağımlılıkları kurar, arayüzü derler, demo verisini yükler |
| `npm start` | Sunucuyu başlatır (port 3000; `PORT` ile değiştirilebilir) |
| `npm run seed` / `npm run demo:seed` | Veritabanını sıfırlar ve demo verisi yükler (gerçek saat / demo saati) |
| `npm run demo` | Sunucuyu demo saatiyle başlatır |
| `npm test` | Otomatik testler (49 test: kiracı izolasyonu, yetkiler, eş zamanlılık, abonelik, iş kuralları) |
| `npm run backup` | Anlık yedek alır (`server/backups/`) |
| `npm run restore -- <dosya>` | Yedekten geri yükler (dosya verilmezse mevcut yedekleri listeler) |
| `npm run screenshots` | Çalışan uygulamadan (`npm run demo`) 2x çözünürlükte `docs/screenshots/` ekran görüntülerini ve `docs/ornek-ciktilar/` örnek Excel/PDF dosyalarını üretir |
| `npm run diagrams` | `docs/diagrams/*.mmd` dosyalarını 3x çözünürlükte PNG ve SVG'ye çizer (internet gerekir: Mermaid CDN) |

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | 3000 | HTTP portu |
| `DATA_DIR` / `DB_PATH` | `server/data` / `data/app.db` | Veritabanı konumu |
| `JWT_SECRET` | ilk açılışta üretilir | Tanımlı değilse `data/.jwt-secret` dosyasına yazılır |
| `SESSION_HOURS` | 12 | Oturum süresi |
| `BACKUP_DIR` | `server/backups` | Yedek klasörü |
| `BACKUP_INTERVAL_HOURS` | 6 | Otomatik yedek aralığı (0 = kapalı) |
| `BACKUP_KEEP` | 14 | Tutulacak otomatik yedek sayısı |
| `DEMO_NOW` | — | Uygulama saatini sabitler (ör. `2026-08-14T15:30:00`); `server/demo.env` |
| `PAYMENT_PROVIDER` | `mock` | Ödeme sağlayıcısı adaptörü |
| `COOKIE_SECURE` | false | HTTPS arkasında `true` yapılmalı |

## Proje yapısı

```
telefon-saas/
├─ server/              Express REST API ve SQLite
│  ├─ src/              app, middleware, routes, services, db (schema.sql, seed.js)
│  └─ test/             node:test + supertest testleri
├─ client/              React + Vite arayüzü
│  └─ src/              pages/, components/, lib/
├─ scripts/             ekran görüntüsü ve diyagram betikleri
└─ docs/
   ├─ TEKNIK_DOKUMAN.md mimari, veri modeli, güvenlik, eş zamanlılık, yedekleme, testler
   ├─ API.md            uç nokta özeti
   ├─ diagrams/         mimari, ER, satış akışı (Mermaid kaynakları + PNG/SVG)
   ├─ screenshots/      ekran görüntüleri
   └─ ornek-ciktilar/   örnek Excel / PDF raporlar
```

## Dokümantasyon

- [Teknik doküman](docs/TEKNIK_DOKUMAN.md)
- [API özeti](docs/API.md)
- ER diyagramı: [iş verisi](docs/diagrams/er-is-verisi.png) · [platform](docs/diagrams/er-platform.png) · [tamamı](docs/diagrams/er.png) · [Mimari](docs/diagrams/mimari.png) · [Satış akışı](docs/diagrams/satis-akisi.png)

## Bilinen sınırlamalar

Gerçek e-posta gönderimi ve gerçek ödeme sağlayıcısı yoktur (sırasıyla `mail_outbox` tablosu ve test sağlayıcısı kullanılır). SQLite tek sunuculu kurulum içindir. Ayrıntılar için [teknik doküman §12](docs/TEKNIK_DOKUMAN.md#12-bilinen-sınırlamalar-ve-geliştirme-önerileri).

# API Özeti

Tüm uç noktalar `/api` altındadır; istek ve yanıt gövdeleri JSON'dur (dışa aktarma uç noktaları hariç).

**Ortak kurallar**

- Oturum `tss_sid` adlı HttpOnly, SameSite=Strict çerezde taşınan JWT ile sağlanır. Her istekte kullanıcı veritabanından yeniden okunur.
- Değişiklik yapan isteklerde (`POST`, `PUT`, `PATCH`, `DELETE`) `X-Requested-With: fetch` başlığı zorunludur (CSRF savunması). Başlık yoksa yanıt `403 CSRF` olur.
- İşletme verisi uç noktalarında kiracı kimliği **yalnızca oturumdan** alınır. İstemcinin gönderdiği `tenant_id` gibi alanlar yok sayılır.
- Hata biçimi: `{ "error": { "code": "DEVICE_NOT_AVAILABLE", "message": "…", "details": [...] } }`
- Sayfalı listelerde `page` ve `pageSize` (en çok 200) kullanılır. Yanıt `{ items, total, page, pageSize }` biçimindedir.

| Kod | Anlamı |
|---|---|
| 400 `VALIDATION_ERROR` | Gövde doğrulanamadı (zod); `details` alan bazında hata listesi |
| 401 `UNAUTHENTICATED` | Oturum yok, süresi dolmuş veya geçersiz kılınmış |
| 402 `SUBSCRIPTION_EXPIRED` / `PAYMENT_FAILED` | Abonelik süresi dolmuş (salt okunur mod) / ödeme reddedildi |
| 403 `FORBIDDEN` / `TENANT_INACTIVE` / `MODULE_NOT_IN_PLAN` / `LIMIT_EXCEEDED` | Rol/yetki yok · işletme askıda/kapalı · modül plana dahil değil · plan limiti aşıldı |
| 404 `NOT_FOUND` | Kayıt yok **veya başka kiracıya ait** (varlığı sızdırılmaz) |
| 409 `DEVICE_NOT_AVAILABLE` / `DUPLICATE` / `STALE_VERSION` | Cihaz satılmış/rezerve · IMEI/e-posta tekrarı · iyimser kilit çakışması |
| 423 `ACCOUNT_LOCKED` | 5 hatalı girişten sonra 15 dakikalık kilit |

## Kimlik doğrulama — `/api/auth` (herkese açık)

| Yöntem | Yol | Açıklama |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → oturum çerezi |
| POST | `/auth/logout` | Çerezi siler |
| GET | `/auth/me` | Kullanıcı, işletme, plan, modüller, kalan gün |
| POST | `/auth/register` | Self servis kayıt: işletme, işletme admini ve ücretsiz deneme |
| POST | `/auth/forgot-password` | Varsa sıfırlama bağlantısı üretir; yanıt her durumda aynıdır |
| POST | `/auth/reset-password` | `{token, password}`; token tek kullanımlıktır, eski oturumları düşürür |
| GET | `/auth/invitation/:token` | Davet bilgisi |
| POST | `/auth/accept-invite` | `{token, fullName, password}` → hesap oluşturur |

## Profil — `/api/profile` (tüm roller)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/profile` | Profil |
| PUT | `/profile` | `{full_name, phone}` |
| PUT | `/profile/password` | `{currentPassword, newPassword}`; diğer oturumları düşürür |

## Süper Admin — `/api/admin` (rol: `super_admin`)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/admin/stats` | Platform istatistikleri, plan dağılımı, günlük işlem hacmi |
| GET | `/admin/tenants?q=&status=` | İşletmeler, plan, kullanım ve son faaliyet bilgisiyle |
| POST | `/admin/tenants` | İşletme, ilk admin ve abonelik oluşturur |
| GET | `/admin/tenants/:id` | Detay, kullanıcılar, abonelik ve ödeme geçmişi |
| PUT | `/admin/tenants/:id` | İşletme bilgilerini günceller |
| PATCH | `/admin/tenants/:id/status` | `{status: active\|suspended\|closed, reason}` |
| PUT | `/admin/tenants/:id/subscription` | Manuel plan ataması `{planId, cycle}` |
| GET / POST / PUT | `/admin/plans`, `/admin/plans/:id` | Plan, fiyat, limit ve modül yönetimi |
| GET | `/admin/audit-logs?tenantId=&action=&from=&to=` | Platform denetim kayıtları |
| GET | `/admin/error-logs?status=&tenantId=` | Hata kayıtları |
| GET | `/admin/backups` | Yedek dosyaları ve yedekleme geçmişi |
| POST | `/admin/backups` | Anlık yedek alır |
| POST | `/admin/backups/restore` | `{fileName}`; önce güvenlik yedeği alır |

## İşletme Admini — `/api/business` (rol: `tenant_admin`)

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET / PUT | `/business/profile` | İşletme profili |
| GET | `/business/staff` | Personel, bekleyen davetler ve yetki tanımları |
| POST | `/business/staff/invite` | `{email, full_name, role, permissions[]}`; kullanıcı limitini kontrol eder |
| DELETE | `/business/staff/invitations/:id` | Daveti iptal eder |
| PUT | `/business/staff/:id` | Rol, yetki ve aktiflik; değişiklik olursa oturumları düşürür |
| GET | `/business/activity?userId=&action=&from=&to=` | İşletmenin faaliyet geçmişi |
| GET | `/business/subscription` | Mevcut plan, kullanım, planlar, abonelik ve ödeme geçmişi |
| POST | `/business/subscription/checkout` | `{planId, cycle, paymentToken}`; soyut ödeme sağlayıcısı üzerinden ödeme alır |

## İşletme verisi (rol: `tenant_admin` veya `user`; abonelik süresi dolduysa yalnızca GET)

Parantez içi değerler gereken yetki ve plan modülüdür. İşletme admini tüm yetkilere sahiptir.

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/devices?q=&status=&brand=&model=&condition=` | Stok listesi ve özet (stock.view · stock) |
| GET | `/devices/lookup?code=` | IMEI, barkod veya seri no ile tam eşleşme |
| GET | `/devices/meta/brands` | Marka/model listesi |
| GET | `/devices/labels?ids=1,2` | Etiket verisi (barcode modülü) |
| GET | `/devices/:id` | Cihaz, kâr/marj, hareket ve işlem geçmişi |
| PUT | `/devices/:id` | Düzenleme; `version` ile iyimser kilit (stock.edit) |
| POST | `/devices/:id/reserve`, `/devices/:id/unreserve` | Rezervasyon (stock.edit) |
| POST | `/purchases` | Tekli/toplu alış `{supplierId\|customerId, devices[], paymentMethod, paidAmount, occurredAt}` (purchase.create · stock) |
| POST | `/sales` | `{customerId, items[{deviceId, price}], …}` (sale.create · sales) |
| POST | `/trades` | `{customerId, incoming[], outgoing[], …}` (trade.create · trade) |
| GET | `/transactions?from=&to=&type=&imei=&product=&userId=` | İşlem listesi ve toplamları |
| GET | `/transactions/:id` | İşlem kalemleri ve kâr |
| GET | `/transactions/export?format=xlsx\|pdf&…` | Excel/PDF (report.export · export) |
| GET / POST / PUT / DELETE | `/customers`, `/customers/:id` | Müşteri CRUD (customer.manage; okuma satış yetkisiyle de mümkün) |
| GET / POST / PUT / DELETE | `/suppliers`, `/suppliers/:id` | Tedarikçi CRUD (supplier.manage) |
| GET | `/reports/dashboard` | Panel özeti (report.view · reports) |
| GET | `/reports/period?groupBy=day\|week\|month&…filtreler` | Dönemsel alış-satış raporu |
| GET | `/reports/distribution?status=` | Marka/model dağılımı |
| GET | `/reports/device-profit?…filtreler` | Cihaz bazında kâr/zarar/marj |
| GET | `/reports/users` | Filtre için kullanıcı listesi |
| GET | `/reports/export?report=period\|distribution\|device-profit&format=xlsx\|pdf` | Dışa aktarma (report.export · export) |
| GET / POST | `/stock-counts` | Sayım listesi / yeni sayım (stock.count · stock_count) |
| GET | `/stock-counts/:id` | Okutulanlar ve eksikler |
| POST | `/stock-counts/:id/scan` | `{code}` → `ok \| not_in_stock \| unknown` |
| POST | `/stock-counts/:id/close` | Sayımı kapatır; beklenen/bulunan/eksik özeti |

## Diğer

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü |
| GET | `/meta` | Yetki ve modül adları |

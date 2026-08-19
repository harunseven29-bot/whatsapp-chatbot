# ANTIGRAVITY — 5 Müşterilik WhatsApp Bot Refactor Talimatı

## Amaç

Mevcut çalışan WhatsApp + Baileys + Gemini botunu **bozmadan**, sistemi aynı deployment içinde **en fazla 5 müşteriyi** destekleyecek hale getir.

Şu an çalışan ve KESİNLİKLE korunması gereken parçalar:

- DockHosting üzerinde çalışan Node.js backend
- Baileys WhatsApp bağlantısı
- `/qr` üzerinden çalışan QR login sistemi
- `/api/whatsapp/qr.png`
- Auth persistence
- `/data/auth` yedekleme / restore mantığı
- Deploy sonrası yeniden QR istemeden bağlanma
- `connection: 'open'` akışı
- Gemini mesaj cevaplama sistemi
- Mevcut business prompt / hizmet bilgisi mantığı

**Çalışan authentication sistemini yeniden tasarlama.**
Sadece bunu müşteri bazlı hale getir.

## Hedef Mimari

Tek GitHub repo, tek DockHosting deployment, en fazla 5 müşteri.

Her müşterinin ayrı:
- işletme bilgileri
- Gemini system prompt'u
- WhatsApp auth/session klasörü
- Baileys socket'i
- QR bağlantı adresi
- bağlantı durumu
- JID bilgisi

olacak.

## Önerilen Dosya Yapısı

```text
/
├── server.js
├── whatsapp.js
├── assistant.js
├── client-manager.js
├── business.js
├── package.json
│
├── clients/
│   ├── client-001.json
│   ├── client-002.json
│   ├── client-003.json
│   ├── client-004.json
│   └── client-005.json
│
└── public/
    └── connect.html
```

Aktif olmayan müşteri:

```json
{
  "enabled": false
}
```

olarak tutulabilir.

## Müşteri Config Formatı

```json
{
  "id": "client-001",
  "enabled": true,
  "businessName": "Nova Estetik & Güzellik Merkezi",
  "category": "Güzellik Merkezi",
  "phone": "",
  "address": "",
  "instagram": "",
  "website": "",
  "openingHours": {
    "monday": "09:00-19:00",
    "tuesday": "09:00-19:00",
    "wednesday": "09:00-19:00",
    "thursday": "09:00-19:00",
    "friday": "09:00-19:00",
    "saturday": "09:00-18:00",
    "sunday": "Kapalı"
  },
  "services": [
    {
      "name": "LED Light Terapi",
      "description": "",
      "price": ""
    }
  ],
  "faq": [],
  "assistantInstructions": [
    "Kısa ve doğal cevap ver.",
    "Bilmediğin fiyatı uydurma.",
    "Randevu talebinde kullanıcıdan uygun gün ve saat iste."
  ]
}
```

Mevcut Nova Estetik bilgilerini `client-001.json` içine taşı.

## client-manager.js

Yeni `client-manager.js` oluştur.

Görevleri:
1. `clients/` klasöründeki config'leri yükle.
2. `enabled: true` olanları seç.
3. Maksimum 5 aktif müşteri kabul et.
4. Her müşteri için runtime state tut.

Örnek:

```js
clients.set(clientId, {
  config,
  socket: null,
  status: 'starting',
  currentQr: null,
  jid: null,
  connectedAt: null
});
```

Maksimum limit:

```js
const MAX_CLIENTS = 5;
```

5'ten fazla aktif config varsa açık hata ver:

```text
Maximum active client limit exceeded: 5
```

## Auth Isolation

KRİTİK.

Her müşterinin auth'u tamamen ayrı olmalı.

Runtime:

```text
/var/www/html/auth/client-001/
/var/www/html/auth/client-002/
/var/www/html/auth/client-003/
```

Persistent backup:

```text
/data/auth/client-001/
/data/auth/client-002/
/data/auth/client-003/
```

Mevcut auth persistence mantığını koru fakat clientId bazlı hale getir.

Örnek helper'lar:

```js
getRuntimeAuthDir(clientId)
getPersistentAuthDir(clientId)
restoreAuth(clientId)
backupAuth(clientId)
```

## Baileys Socket

Her aktif müşteri için yalnızca 1 Baileys socket oluştur.

```js
startWhatsAppClient(clientId)
```

Bu fonksiyon:
- client config'i bulur
- ilgili auth'u restore eder
- `useMultiFileAuthState(clientAuthDir)` kullanır
- socket'i oluşturur
- creds update'i sadece ilgili müşteriye kaydeder
- connection state'i sadece ilgili müşteri state'ine yazar

Duplicate socket oluşturma.

## Çalışan Reconnect Mantığını Koru

Mevcut başarılı:
- credentials save
- persisted auth restore
- restartRequired / reconnect
- deploy sonrası session restore
- `connection: open`

mantığı BOZULMAMALI.

Sadece clientId bazlı hale getir.

Loglar:

```text
[client-001][AUTH] Credentials kaydedildi.
[client-001][WA] connection: open
[client-002][WA] waiting for QR
```

## QR Sistemi

Tek `/qr` yerine müşteri bazlı URL:

```text
/connect/client-001
/connect/client-002
/connect/client-003
```

Route:

```text
GET /connect/:clientId
GET /api/clients/:clientId/qr.png
GET /api/clients/:clientId/status
```

Status örneği:

```json
{
  "clientId": "client-001",
  "businessName": "Nova Estetik & Güzellik Merkezi",
  "status": "connected",
  "jid": "905xxxxxxxxx:xx@s.whatsapp.net",
  "hasQr": false,
  "connectedAt": 123456789
}
```

## QR Sayfası Davranışı

`/connect/:clientId`:

- `waiting_qr`: işletme adı + büyük düzgün QR
- `connecting`: "WhatsApp bağlantısı hazırlanıyor..."
- `connected`: "✅ WhatsApp başarıyla bağlandı. Bu sayfayı kapatabilirsiniz."
- `disconnected`: "Bağlantı yeniden kuruluyor..."
- invalid client: 404

QR, server-side mevcut Baileys QR stringinden üretilmeli.
Yeni QR oluşursa otomatik yenilenmeli.
Raw QR string API'den expose edilmesin.

## Gemini / Assistant Isolation

Mesaj hangi socket'ten geldiyse o müşterinin config'i kullanılmalı.

```js
generateReply(clientId, message)
```

veya:

```js
generateReply(clientConfig, message)
```

Cross-client bilgi karışımı ASLA olmamalı.

`assistant.js` global tek `business.json` import'una bağlı kalmasın.

System prompt müşteri bazlı dinamik oluşturulsun.

## business.js

Global tek müşteri bilgisi tutuyorsa helper haline getir:

```js
function buildBusinessContext(config) {
  // ...
}
```

Esas business bilgileri `clients/*.json` dosyalarından gelsin.

## server.js

Server yalnızca:
- Express setup
- health
- client manager initialization
- connect/status/qr routes

işlerini yapsın.

Startup:

```js
await clientManager.startAllEnabledClients();
```

## Health Endpoint

`GET /health` örneği:

```json
{
  "status": "healthy",
  "activeClients": 3,
  "maxClients": 5,
  "clients": [
    {
      "id": "client-001",
      "status": "connected"
    },
    {
      "id": "client-002",
      "status": "waiting_qr"
    }
  ]
}
```

Secret, auth, tam QR stringi veya API key gösterme.

## Yeni Müşteri Ekleme Akışı

1. `clients/client-00X.json` oluştur/güncelle.
2. İşletme bilgilerini gir.
3. `enabled: true` yap.
4. GitHub push.
5. DockHosting deploy.
6. Müşteriye `/connect/client-00X` linkini gönder.
7. QR okutulur.
8. Session `/data/auth/client-00X` altında kalıcı olur.
9. Bot çalışır.

Yeni müşteri için kod yeniden yazılmayacak.

## Güvenlik

MVP'de clientId kullanılabilir fakat kod ileride güvenli token'a geçebilecek şekilde tasarlansın:

```text
/connect/<secure-token>
```

HTTP üzerinden asla expose etme:
- creds.json
- session keys
- raw QR string
- Gemini API key
- environment secrets

## Kaynak Kullanımı

Bu deployment maksimum 5 müşterilik MVP.

Şunları ekleme:
- React
- Next.js
- Tailwind
- ağır frontend framework
- ağır database
- gereksiz queue sistemi

Express + vanilla HTML/CSS/JS yeterli.

Gereksiz timer, duplicate polling, duplicate reconnect loop oluşturma.

## Mevcut Çalışan Sistemi Koruma Kuralı

EN ÖNEMLİ KURAL:

Şu an tek müşteriyle çalışan WhatsApp login/session restore akışı production'da başarılı.

Bu refactor sırasında authentication protokolünü yeniden yazma.

Çalışan kodu fonksiyonlaştır ve single-client değerleri `clientId` scoped hale getir.

Özellikle koru:
- QR scan
- creds update
- auth persistence
- `/data/auth`
- deploy sonrası restore
- reconnect
- connection open
- message listener
- Gemini reply

## Backward Compatibility

İlk refactor tamamlandığında sadece `client-001` enabled olsun.

Önce mevcut Nova Estetik hesabının yeni multi-client mimaride aynı şekilde çalıştığını doğrula.

Bu test geçmeden client-002 ekleme.

## Test Planı

### Test 1 — Existing client
Beklenen:

```text
auth restore
→ QR istemeden bağlantı
→ connection open
→ mesaj al
→ Gemini cevap ver
```

### Test 2 — New client
`client-002` enabled, auth yok.

Beklenen:

```text
/connect/client-002
→ QR
→ tarama
→ credentials save
→ connection open
```

`client-001` bağlantısı KESİLMEMELİ.

### Test 3 — Restart
Deployment restart.

Beklenen:

```text
client-001 auth restore
client-002 auth restore
→ ikisi de QR istemeden open
```

### Test 4 — Isolation
client-001 mesajı yalnız client-001 bilgileriyle,
client-002 mesajı yalnız client-002 bilgileriyle cevaplanmalı.

### Test 5 — Capacity
5 enabled müşteri çalışmalı.
6 enabled müşteri varsa startup hata vermeli.

## Definition of Done

- [ ] Tek repo
- [ ] Maksimum 5 müşteri
- [ ] Ayrı business config
- [ ] Ayrı Baileys socket
- [ ] Ayrı auth
- [ ] Ayrı `/data/auth/<clientId>`
- [ ] Ayrı connect URL
- [ ] Ayrı QR
- [ ] Deploy/restart sonrası session restore
- [ ] Business bilgilerinin karışmaması
- [ ] Gemini cevaplarının müşteri bazlı olması
- [ ] Mevcut client-001'in çalışmaya devam etmesi
- [ ] QR/login sisteminin bozulmaması
- [ ] 5 aktif client limitinin uygulanması

## Son Talimat

Önce kod tabanını analiz et.

Çalışan auth / QR / reconnect sistemini tespit et.

Bu parçaları silip sıfırdan yazmak yerine yeniden kullanılabilir client-scoped fonksiyonlara dönüştür.

Refactor'u mümkün olduğunca küçük ve kontrollü yap.

Her aşamadan sonra mevcut tek müşteri akışının bozulmadığını doğrula.

Production authentication davranışında gereksiz değişiklik yapma.

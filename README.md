# 🤖 WhatsApp AI Chatbot Backend (Baileys + Google Gemini)

Northflank ve benzeri bulut platformlarında 7/24 kesintisiz çalışacak şekilde tasarlanmış, **Meta Cloud API gerektirmeyen**, Baileys ve Google Gemini 3.7 Flash destekli akıllı WhatsApp satış ve randevu asistanı backend'i.

---

## 🏗️ Mimari Şema

```text
       ┌───────────────┐
       │   WhatsApp    │ (Kullanıcı / Danışan)
       └───────┬───────┘
               │
               ▼
       ┌───────────────┐
       │    Baileys    │ (@whiskeysockets/baileys - Web Socket)
       └───────┬───────┘
               │
               ▼
       ┌───────────────┐
       │ Node.js Server│ (Kalıcı Auth, Hafıza & İşletme Kuralları)
       └───────┬───────┘
               │
               ▼
       ┌───────────────┐
       │  Gemini API   │ (Google Gemini 3.7 Flash - Akıllı Model)
       └───────────────┘
```

---

## ✨ Özellikler

1. **Baileys ile Tam Entegrasyon**: Meta Business Cloud API doğrulaması gerektirmeden doğrudan WhatsApp Web protokolü üzerinden bağlanır.
2. **Kalıcı Oturum (Session Persistence)**: `AUTH_DIR` üzerinde saklanan kimlik doğrulama verileri sayesinde sunucu veya container yeniden başlatıldığında **tekrar QR kod istemeden** anında bağlanır.
3. **Otomatik Yeniden Bağlanma (Auto-Reconnect)**: Ağ kopması, geçici sunucu kesintisi durumlarında otomatik olarak yeniden bağlanır.
4. **Google Gemini 3.7 Flash**: Hızlı, doğal Türkçe konuşan ve işletme kurallarına sadık yapay zeka asistanı.
5. **Dinamik `business.json` Context**: İşletme adı, hizmetler, fiyatlar, adres, çalışma saatleri ve kurallar dinamik olarak Gemini sistem promptuna enjekte edilir.
6. **Konuşma Hafızası (15 Mesaj)**: Her WhatsApp kullanıcısı için son 15 mesajlık sohbet geçmişi hafızada tutulur. Kullanıcıdan aynı bilgiyi mükerrer istemez.
7. **İnsan Yetkiliye Devir (Human Agent Handover)**: Kullanıcı yetkili, müşteri temsilcisi veya insan desteği istediğinde durumu algılayıp uygun yönlendirmeyi yapar.
8. **Northflank Uyumlu HTTP Sunucusu**:
   - `GET /health` → `HTTP 200` (Northflank Health Check için)
   - `GET /` → `{"status": "ok", "whatsapp": "connected"}` veya Web Dashboard
   - `GET /qr` → Tarayıcıdan QR kod tarama
   - `POST /api/test-chat` → WhatsApp'a ihtiyaç duymadan AI'ı test etme simülatörü

---

## 📁 Proje Dosya Yapısı

```text
├── business.json        # İşletme bilgileri, hizmetler, fiyatlar ve kurallar
├── business.js          # business.json okuyucu ve dinamik system prompt üretici
├── assistant.js         # Gemini API bağlantısı, konuşma hafızası ve insan devir mantığı
├── whatsapp.js          # Baileys WhatsApp bağlantısı, session yönetimi ve mesaj filtreleri
├── server.js            # Express HTTP server (Northflank /health ve web arayüzü)
├── index.js             # Ana başlatıcı (Bootstrap & Graceful Shutdown)
├── package.json         # Bağımlılıklar ve npm scriptleri
├── .env.example         # Çevre değişkenleri şablonu
├── .gitignore           # Git hariç tutma kuralları
└── README.md            # Detaylı kurulum ve deployment kılavuzu
```

---

## 🚀 Hızlı Başlangıç (Lokal Geliştirme)

### 1. Gereksinimler
- Node.js (v18, v20 veya üzeri)
- Google Gemini API Key ([Google AI Studio](https://aistudio.google.com)'dan ücretsiz alınabilir)

### 2. Kurulum
```bash
# Bağımlılıkları yükleyin
npm install

# .env dosyasını oluşturun
cp .env.example .env
```

### 3. `.env` Yapılandırması
`.env` dosyanızı açıp API anahtarınızı girin:
```env
GEMINI_API_KEY="AIzaSy..."
AUTH_DIR="./data/auth"
PORT=3000
```

### 4. Uygulamayı Başlatma
```bash
npm start
```

Terminalde beliren QR kodu WhatsApp uygulamanızdan (**Bağlı Cihazlar > Cihaz Bağla**) taratın.
Oturum `./data/auth` klasörüne kaydedilecek ve bir daha QR istemeyecektir.

---

## ☁️ Northflank 24/7 Deployment Kılavuzu

Northflank üzerinde kesintisiz 7/24 çalıştırmak için aşağıdaki adımları izleyin:

### Adım 1: Depoyu (Repository) Northflank'e Ekleyin
1. Northflank Dashboard'a gidin.
2. **Create New Service** > **Deployment Service** seçeneğine tıklayın.
3. GitHub / Git deponuzu bağlayın.
4. **Build Type**: `Buildpack` (veya `Dockerfile`) seçin. Node.js otomatik algılanacaktır.

### Adım 2: Persistent Volume Ekleme (ÖNEMLİ!)
WhatsApp oturumunun sunucu yeniden başladığında kaybolmaması için kalıcı disk alanı bağlamalısınız:
1. Northflank servis ayarlarında **Volumes** sekmesine gidin.
2. **Add Volume** butonuna basın.
3. **Mount Path**: `/data/auth`
4. **Size**: `1 GB` (Yeterlidir).

### Adım 3: Environment Variables (Çevre Değişkenleri)
Northflank **Environment** sekmesinde şu değişkenleri ekleyin:

| Değişken Adı | Değer | Açıklama |
|---|---|---|
| `GEMINI_API_KEY` | `AIzaSy...` | Google Gemini API Anahtarınız |
| `AUTH_DIR` | `/data/auth` | Kalıcı diske bağlanan auth yolu |
| `PORT` | `3000` | HTTP port numarası |

### Adım 4: Health Check Ayarı
1. Northflank servis ayarlarında **Health Checks** sekmesine gidin.
2. **Type**: `HTTP`
3. **Path**: `/health`
4. **Port**: `3000`

### Adım 5: İlk Bağlantı ve QR Kod Tarama
1. Servis deploy edildikten sonra Northflank **Logs** sekmesini açın.
2. Veya servisin genel URL'ini tarayıcıda açın (örn: `https://your-service.northflank.app/`).
3. Ekranda veya loglarda çıkan QR kodu WhatsApp ile taratın.
4. WhatsApp bağlandıktan sonra bot 7/24 çalışacak ve yeniden başlatmalarda tekrar QR istemeyecektir!

---

## ⚙️ `business.json` Özelleştirme

Botun işletmenize özel konuşması için `business.json` dosyasını düzenleyin:

```json
{
  "businessName": "İşletmenizin Adı",
  "description": "Faaliyet alanınızın kısa tanımı",
  "services": [
    {
      "id": "hizmet-1",
      "name": "Örnek Hizmet Adı",
      "description": "Hizmet detayları",
      "durationMinutes": 60,
      "price": "1.500 TL"
    }
  ],
  "prices": {
    "currency": "TRY",
    "paymentMethods": "Kredi Kartı, Havale, Nakit",
    "cancellationPolicy": "En az 24 saat önceden haber verilmelidir."
  },
  "address": "İşletme açık adresiniz",
  "openingHours": {
    "weekdays": "09:00 - 19:00",
    "saturday": "10:00 - 18:00",
    "sunday": "Kapalı"
  },
  "phone": "+90 5XX XXX XX XX",
  "instagram": "@isletmeniz",
  "rules": [
    "Kibar ve yardımsever Türkçe konuş.",
    "Bilinmeyen fiyat uydurma.",
    "Randevu alırken İsim-Soyisim ve tercih edilen tarihi sor."
  ],
  "systemPrompt": "Sen işletmenin akıllı WhatsApp satış ve randevu asistanısın."
}
```

---

## 🧠 Konuşma Hafızası ve Veritabanı Genişletme

Uygulama varsayılan olarak kullanıcı başına son **15 mesajı** RAM'de tutar (`assistant.js`).
İleride veritabanına taşımak isterseniz `assistant.js` içindeki `getHistory()` ve `addMessage()` fonksiyonlarını Redis, PostgreSQL veya Firestore adaptörlerine kolayca bağlayabilirsiniz.

---

## 🔒 Güvenlik Notları
- API Key veya hassas kimlik bilgileri kaynak koduna yazılmamıştır.
- Loglarda API anahtarı filtrelenir ve gösterilmez.
- Grup mesajları ve botun kendi mesajları otomatik olarak filtrelenir.

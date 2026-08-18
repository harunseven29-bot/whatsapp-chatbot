# 🤖 WhatsApp Gemini AI Chatbot (Ultra-Lightweight Backend & Web Onboarding)

Wispbyte Free, Northflank veya herhangi bir düşük kaynaklı VPS/Container üzerinde **7/24 kesintisiz ve minimum RAM/CPU (30-50MB RAM)** ile çalışmak üzere optimize edilmiş, saf Node.js WhatsApp yapay zeka asistanı.

Next.js, React, Tailwind veya ağır frontend framework'leri içermez. **Sıfır derleme süresiyle doğrudan `node server.js` ile çalışır.**

Müşterilerinize veya panel kullanıcılarınıza sunabileceğiniz modern, minimal Vanilla HTML/CSS/JS **`/connect`** QR bağlantı ekranına sahiptir.

---

## ⚡ Özellikler

- **Saf Node.js & Express:** Düşük bellek tüketimi, anında başlama.
- **Web Onboarding Arayüzü (`/connect`):** Terminal yerine tarayıcıdan modern, canlı durum göstergeli QR bağlantı ekranı.
- **WhatsApp Entegrasyonu:** `@whiskeysockets/baileys` ile doğrudan WhatsApp Web soket bağlantısı.
- **Yapay Zeka:** `@google/genai` (Gemini 3.7 Flash) ile bağlamsal, samimi ve Türkçe satış/randevu yanıtları.
- **Konuşma Hafızası:** Müşterilerin söylediklerini hatırlayan akıllı oturum yönetimi (24 saat TTL).
- **Canlı/İnsan Temsilciye Devir:** Müşteri yetkili talep ettiğinde otomatik tespit ve yönlendirme.
- **Kalıcı Oturum:** `AUTH_DIR` desteği ile sunucu yeniden başlasa bile tekrar QR okutmaya gerek kalmaz.
- **Çoklu Oturum Hazır Mimarisi:** İleride çoklu müşteri yönetimine genişletilebilir session-id tabanlı yapı.
- **QR & Pairing Code:** Hem web arayüzünde hem de terminalde ASCII QR kod; opsiyonel 8 haneli pairing code.
- **İşletme Yapılandırması:** `business.json` üzerinden dinamik hizmet, fiyat, kural ve çalışma saati yönetimi.
- **Uptime & Health Check:** `GET /health` ve `GET /` uç noktaları ile 7/24 izleme desteği.

---

## 📁 Proje Dosya Yapısı

```text
├── package.json        # Yalın ve hafif bağımlılıklar (Sıfır build aracı)
├── server.js           # Express HTTP sunucusu, /connect ve Baileys başlatıcı
├── connect.html        # Modern, minimal Vanilla HTML/CSS/JS QR onboarding arayüzü
├── whatsapp.js         # Baileys soket, QR üretici, oturum yönetimi ve mesaj dinleyicisi
├── assistant.js        # Gemini AI asistanı, konuşma hafızası ve devir mantığı
├── business.js         # İşletme profili ve dinamik sistem prompt üretici
├── business.json       # İşletme adı, hizmetler, fiyatlar ve kurallar
├── .env.example        # Örnek çevre değişkenleri
├── .gitignore          # Git hariç tutma kuralları (auth, node_modules)
└── README.md           # Kurulum ve dağıtım rehberi
```

---

## 🚀 Hızlı Başlangıç (Yerel Çalıştırma)

### 1. Bağımlılıkları Yükleyin
```bash
npm install --omit=dev
```

### 2. Ortam Değişkenlerini Tanımlayın
`.env.example` dosyasını `.env` olarak kopyalayın ve Gemini API anahtarınızı girin:
```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=AIzaSy...
AUTH_DIR=./auth
PORT=3000
PAIRING_NUMBER=
```

> **Not:** Gemini API anahtarını [Google AI Studio](https://aistudio.google.com)'dan ücretsiz alabilirsiniz.

### 3. Sunucuyu Başlatın
```bash
npm start
```

Tarayıcınızdan **`http://localhost:3000/connect`** adresini açarak ekrandaki QR kodu WhatsApp (**Bağlı Cihazlar > Cihaz Bağla**) ile taratın.

---

## ☁️ Wispbyte Free / Container Üzerinde 7/24 Dağıtım

1. Wispbyte panelinde **Node.js** sunucusu oluşturun.
2. Dosyaları yükleyin veya Git repository'nizi bağlayın.
3. Çevre değişkenlerini (Environment Variables) tanımlayın:
   - `GEMINI_API_KEY`: Google Gemini API anahtarınız
   - `AUTH_DIR`: `/home/container/auth` (veya varsayılan `./auth`)
   - `PORT`: `3000` (veya panelin atadığı port)
   - `NODE_ENV`: `production`
4. Başlatma komutu olarak:
   ```bash
   node server.js
   ```
5. Müşteriniz veya siz tarayıcıdan `https://your-domain.com/connect` adresine giderek QR kodunu okutabilirsiniz.

---

## 🌐 API & Web Uç Noktaları

| Metot | Uç Nokta | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/connect` | Modern SaaS QR Kod WhatsApp Bağlantı Web Arayüzü (HTML) |
| `GET` | `/api/whatsapp/status` | Gerçek zamanlı WhatsApp durumu & QR görseli (`no-store` cache) |
| `POST` | `/api/whatsapp/logout` | WhatsApp oturumunu kapatıp yeni QR kodu üretir |
| `GET` | `/health` | Wispbyte / Uptime robotları için HTTP 200 Health Check |
| `GET` | `/status` | Detaylı sistem durumu, bellek istatistikleri ve bot metrikleri |
| `GET` | `/` | Tarayıcılar için `/connect` arayüzü, API istemcileri için JSON |

---

## ⚙️ İşletme Bilgilerini Özelleştirme

`business.json` dosyasını açarak işletmenize ait bilgileri düzenleyebilirsiniz:
- `businessName`: İşletmenizin adı
- `services`: Sunduğunuz hizmetler, süreleri ve fiyatları
- `openingHours`: Çalışma gün ve saatleri
- `address`, `phone`, `instagram`: İletişim bilgileri
- `rules`: Botun uyması gereken özel talimatlar
- `systemPrompt`: Botun ana rolü ve karakteri

Yapılan değişiklikler anında yapay zeka asistanı tarafından kullanılacaktır.

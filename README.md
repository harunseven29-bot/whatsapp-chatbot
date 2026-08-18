# 🤖 WhatsApp Gemini AI Chatbot (Ultra-Lightweight Backend)

Wispbyte Free, Northflank veya herhangi bir düşük kaynaklı VPS/Container üzerinde **7/24 kesintisiz ve minimum RAM/CPU (30-50MB RAM)** ile çalışmak üzere optimize edilmiş, saf Node.js WhatsApp yapay zeka asistanı.

Frontend, React, Next.js veya derleme (build) araçları içermez. **Sıfır derleme süresiyle doğrudan `node server.js` ile çalışır.**

---

## ⚡ Özellikler

- **Saf Node.js & Express:** Düşük bellek tüketimi, anında başlama.
- **WhatsApp Entegrasyonu:** `@whiskeysockets/baileys` ile doğrudan WhatsApp Web soket bağlantısı.
- **Yapay Zeka:** `@google/genai` (Gemini 3.7 Flash) ile bağlamsal, samimi ve Türkçe satış/randevu yanıtları.
- **Konuşma Hafızası:** Müşterilerin söylediklerini hatırlayan akıllı oturum yönetimi (24 saat TTL).
- **Canlı/İnsan Temsilciye Devir:** Müşteri yetkili talep ettiğinde otomatik tespit ve yönlendirme.
- **Kalıcı Oturum:** `AUTH_DIR` desteği ile sunucu yeniden başlasa bile tekrar QR okutmaya gerek kalmaz.
- **QR & Pairing Code:** Terminalden anında ASCII QR kod taratma veya numara ile 8 haneli pairing code.
- **İşletme Yapılandırması:** `business.json` üzerinden dinamik hizmet, fiyat, kural ve çalışma saati yönetimi.
- **Uptime & Health Check:** `GET /health` ve `GET /` uç noktaları ile 7/24 izleme desteği.

---

## 📁 Proje Dosya Yapısı

```text
├── package.json        # Yalın ve hafif bağımlılıklar (Sıfır build aracı)
├── server.js           # Express HTTP sunucusu ve Baileys başlatıcı
├── whatsapp.js         # Baileys soket, QR terminal ve mesaj dinleyicisi
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

Terminalde beliren **QR Kodu** telefonunuzdaki WhatsApp uygulamasından (**Bağlı Cihazlar > Cihaz Bağla**) taratın.

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
5. Sunucu konsolunda beliren QR kodu telefonunuzla taratın. Oturum `/home/container/auth` klasöründe kalıcı olarak saklanacaktır.

---

## 🌐 API Uç Noktaları

| Metot | Uç Nokta | Açıklama |
| :--- | :--- | :--- |
| `GET` | `/` | Servis durum kontrolü (JSON) |
| `GET` | `/health` | Wispbyte / Uptime robotları için HTTP 200 Health Check |
| `GET` | `/status` | WhatsApp bağlantı durumu, bellek istatistikleri ve bot verileri |

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

/**
 * Business Logic and Configuration Loader
 * WhatsApp AI Chatbot
 */

const fs = require('fs');
const path = require('path');

const BUSINESS_CONFIG_PATH = path.resolve(__dirname, 'business.json');

// Cache business data in memory
let cachedBusinessData = null;
let lastLoadedTime = 0;

/**
 * Load business.json with safe fallback
 * @returns {object} Business configuration
 */
function getBusinessData() {
  const now = Date.now();
  // Reload if file changed or cached for > 10 seconds in development
  if (cachedBusinessData && now - lastLoadedTime < 10000) {
    return cachedBusinessData;
  }

  try {
    if (fs.existsSync(BUSINESS_CONFIG_PATH)) {
      const raw = fs.readFileSync(BUSINESS_CONFIG_PATH, 'utf-8');
      cachedBusinessData = JSON.parse(raw);
      lastLoadedTime = now;
      return cachedBusinessData;
    }
  } catch (error) {
    console.error('[Business] Error reading business.json:', error.message);
  }

  // Fallback default config if business.json fails to read
  return {
    businessName: 'İşletme Asistanı',
    description: 'WhatsApp Müşteri ve Randevu Asistanı',
    services: [],
    prices: {},
    address: 'Bilgi verilmedi',
    openingHours: { weekdays: '09:00 - 18:00', saturday: '09:00 - 15:00', sunday: 'Kapalı' },
    phone: '',
    instagram: '',
    rules: [
      'Kibar ve yardımsever ol.',
      'Bilinmeyen fiyat veya hizmet uydurma.',
      'İnsan temsilci istendiğinde nazikçe yönlendir.'
    ],
    systemPrompt: 'Sen WhatsApp asistanısın.'
  };
}

/**
 * Update business config dynamically
 * @param {object} newData 
 */
function updateBusinessData(newData) {
  try {
    const current = getBusinessData();
    const updated = { ...current, ...newData };
    fs.writeFileSync(BUSINESS_CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
    cachedBusinessData = updated;
    lastLoadedTime = Date.now();
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Builds a dynamic, comprehensive system instruction for Google Gemini
 * @returns {string} Gemini system prompt
 */
function generateSystemPrompt() {
  const b = getBusinessData();

  const servicesText = Array.isArray(b.services) && b.services.length > 0
    ? b.services.map(s => `- **${s.name}**: ${s.description || ''} | Süre: ${s.durationMinutes || 30} dk | Fiyat: ${s.price}`).join('\n')
    : 'Hizmet listesi mevcut değil. Özel bilgi için yetkiliye danışınız.';

  const hoursText = typeof b.openingHours === 'object'
    ? Object.entries(b.openingHours).map(([key, val]) => `  * ${key}: ${val}`).join('\n')
    : String(b.openingHours || '09:00 - 18:00');

  const rulesText = Array.isArray(b.rules) && b.rules.length > 0
    ? b.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '1. Kibar ve yardımsever ol.\n2. Bilgi uydurma.';

  return `
SEN KİMSİN:
${b.systemPrompt || 'Sen bu işletmenin akıllı WhatsApp satış ve randevu asistanısın.'}

İŞLETME BİLGİLERİ:
- İşletme Adı: ${b.businessName}
- Açıklama: ${b.description}
- Adres / Konum: ${b.address}
- Telefon: ${b.phone || 'Belirtilmedi'}
- Instagram / Sosyal Medya: ${b.instagram || 'Belirtilmedi'}
- Web Sitesi: ${b.website || 'Belirtilmedi'}

ÇALIŞMA SAATLERİ:
${hoursText}

HİZMETLER VE GÜNCEL FİYAT LİSTESİ:
${servicesText}

ÖDEME & İPTAL KOŞULLARI:
- Para Birimi: ${b.prices?.currency || 'TRY'}
- Ödeme Seçenekleri: ${b.prices?.paymentMethods || 'Kredi Kartı / Havale / Nakit'}
- İptal / Değişiklik Politikası: ${b.prices?.cancellationPolicy || 'En az 24 saat önceden haber verilmelidir.'}

GÖREV VE DAVRANIŞ KURALLARI:
${rulesText}

ÖZEL TALİMATLAR:
1. Türkçe dil kurallarına uygun, samimi, sıcak ve profesyonel ol.
2. WhatsApp için optimize edilmiş, okunabilir, kısa ve net paragraflar kullan. Asla devasa tek blok metin atma.
3. Fiyat veya hizmet sorulduğunda yukarıdaki listedeki kesin bilgileri ver. Listede OLMAYAN bir işlem sorulursa "Bu işlem için uzmanımızla görüşmeniz daha sağlıklı olacaktır, dilerseniz numaranızı not alıp sizi aratalım." şeklinde yanıt ver. Asla hayali fiyat uydurma.
4. Randevu taleplerinde müşteriden:
   - Ad-Soyad
   - İlgilendiği işlem
   - Tercih ettiği gün ve saat aralığını
   öğrenmeye odaklan. Eğer kullanıcı konuşmanın başında adını veya saatini söylediyse ASLA tekrar sorma!
5. İnsan yetkili / müşteri temsilcisi istendiğinde: Anlayışla karşıla, yetkiliye durumu ilettiğini ve en kısa sürede dönüş yapılacağını belirt.
6. Asla formatlama işaretlerini (Markdown kod blokları, json etiketleri vs.) ham haliyle atma, sadece WhatsApp metnine uygun temiz metin üret.
`.trim();
}

module.exports = {
  getBusinessData,
  updateBusinessData,
  generateSystemPrompt
};

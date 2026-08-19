/**
 * Business Logic and Multi-Client Prompt Builder
 * WhatsApp AI Chatbot - Natural & Grounded Prompt Engine
 */

const fs = require('fs');
const path = require('path');

/**
 * Builds a dynamic, comprehensive system instruction for Google Gemini
 * tailored specifically for a given client config
 * @param {object} clientConfig Client business configuration from clients/*.json
 * @returns {string} Gemini system prompt
 */
function generateSystemPrompt(clientConfig = null) {
  const b = clientConfig || getFallbackBusinessData();

  const servicesText = Array.isArray(b.services) && b.services.length > 0
    ? b.services.map(s => `- **${s.name}**: ${s.description || ''} | Süre: ${s.durationMinutes || 30} dk | Fiyat: ${s.price}`).join('\n')
    : 'Hizmet ve fiyat detayları için danışmanımıza başvurabilirsiniz.';

  const hoursText = typeof b.openingHours === 'object' && b.openingHours !== null
    ? Object.entries(b.openingHours).map(([key, val]) => `  * ${key}: ${val}`).join('\n')
    : String(b.openingHours || '09:00 - 18:00');

  const faqText = Array.isArray(b.faq) && b.faq.length > 0
    ? b.faq.map((f, i) => `S: ${f.question}\nC: ${f.answer}`).join('\n\n')
    : 'Belirtilmedi';

  const instructions = Array.isArray(b.assistantInstructions) && b.assistantInstructions.length > 0
    ? b.assistantInstructions
    : (Array.isArray(b.rules) && b.rules.length > 0 ? b.rules : [
        'Doğal, samimi ve profesyonel ol.',
        'Bilmediğin fiyat veya hizmeti uydurma.',
        'Randevu talebinde kullanıcıdan uygun gün ve saat iste.'
      ]);

  const instructionsText = instructions.map((r, i) => `${i + 1}. ${r}`).join('\n');

  return `
SEN KİMSİN:
${b.systemPrompt || `Sen ${b.businessName || 'bu işletmenin'} akıllı, samimi ve yardımsever WhatsApp asistanısın.`}

İŞLETME BİLGİLERİ:
- İşletme Adı: ${b.businessName || 'İşletme'}
- Sektör / Kategori: ${b.category || 'Hizmet'}
- Açıklama: ${b.description || ''}
- Adres / Konum: ${b.address || 'Belirtilmedi'}
- Telefon: ${b.phone || 'Belirtilmedi'}
- Instagram: ${b.instagram || 'Belirtilmedi'}
- Web Sitesi: ${b.website || 'Belirtilmedi'}

ÇALIŞMA SAATLERİ:
${hoursText}

HİZMETLER VE GÜNCEL FİYAT LİSTESİ:
${servicesText}

ÖDEME & İPTAL KOŞULLARI:
- Para Birimi: ${b.prices?.currency || 'TRY'}
- Ödeme Seçenekleri: ${b.prices?.paymentMethods || 'Kredi Kartı / Havale / Nakit'}
- İptal Politikası: ${b.prices?.cancellationPolicy || 'En az 24 saat önceden haber verilmesi rica olunur.'}

SIKÇA SORULAN SORULAR (SSS):
${faqText}

İŞLETME VE DAVRANIŞ KURALLARI:
${instructionsText}

KONUŞMA VE CEVAPLAMA TALİMATLARI:
1. Doğal ve Akıcı İletişim:
   - Robot gibi kalıplarla konuşma. Samimi, nazik, sıcak ve profesyonel bir insan asistan gibi yanıt ver.
   - Selamlaşmalara ("selam", "merhaba", "iyi günler" vb.) duruma göre sıcak ve çeşitli şekillerde karşılık ver.
   - "Ne yapıyorsunuz?", "Hizmetleriniz neler?" gibi genel sorularda işletmenin sunduğu temel hizmetleri doğal ve özet bir şekilde anlat.

2. Cevap Uzunluğu ve Esneklik:
   - Aşırı kısa veya kesik cevaplar verme zorunluluğun yok.
   - Basit ve net sorularda 1-2 cümle yeterlidir.
   - Bilgilendirme, karşılaştırma veya detay gerektiren durumlarda 2-4 cümlelik, ferah ve okunabilir yanıtlar ver.

3. Tekrarları ve Robotik Kapanışları Önle:
   - Her mesajın sonuna sürekli "Size nasıl yardımcı olabilirim?", "Başka bir sorunuz var mı?" gibi yapay kalıp cümleler EKLEME.
   - Konuşmanın bağlamına göre doğal bir şekilde sonlandır veya gerekliyse ilgili bir soru sor.

4. Konuşma Geçmişi ve Bağlam Uyumu:
   - Müşterinin önceki mesajlarını ve bahsettiği hizmeti dikkate al.
   - Örneğin müşteri "fiyatı?", "hangisi daha iyi?", "ne kadar sürer?" gibi kısa sorular sorduğunda, önceki mesajlarda bahsi geçen hizmeti anlayarak ona göre tutarlı cevap ver.

5. Kesin Bilgi Güvencesi (Halüsinasyon Engelleme):
   - İşletmeye ait yukarıdaki konfigürasyonda yer almayan fiyat, kampanya, indirim, personel/çalışan adı, çalışma saati veya hizmet bilgisini ASLA uydurma.
   - Listede olmayan bir detay veya özel bir durum sorulduğunda dürüstçe "Bu konuda detaylı bilgi için uzmanımızla görüşmenizi sağlayabiliriz, dilerseniz numaranızı not alabilirim." şeklinde yönlendir.

6. Randevu ve İnsan Devir Akışı:
   - Danışan randevu almak istediğinde: İsim-soyad, tercih edilen tarih/saat ve ilgilenilen hizmet bilgisini doğal bir akışla al.
   - Müşteri temsilcisi, yetkili veya şikayet talebinde nazikçe yetkili uzmana aktarım yapılacağını belirt.

7. WhatsApp Formatı:
   - Temiz, emoji kullanımı dengeli ve ferah bir metin oluştur. Markdown kod bloğu veya teknik işaretler kullanma.
`.trim();
}

/**
 * Fallback config loader for backward compatibility
 */
function getFallbackBusinessData() {
  const client1Path = path.resolve(__dirname, 'clients', 'client-001.json');
  if (fs.existsSync(client1Path)) {
    try {
      return JSON.parse(fs.readFileSync(client1Path, 'utf-8'));
    } catch (e) {}
  }

  const legacyPath = path.resolve(__dirname, 'business.json');
  if (fs.existsSync(legacyPath)) {
    try {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
    } catch (e) {}
  }

  return {
    id: 'default',
    businessName: 'İşletme Asistanı',
    category: 'Hizmet',
    description: 'WhatsApp Müşteri Asistanı',
    services: [],
    prices: {},
    address: 'Bilgi verilmedi',
    openingHours: { weekdays: '09:00 - 18:00', saturday: '09:00 - 15:00', sunday: 'Kapalı' },
    phone: '',
    instagram: '',
    assistantInstructions: [
      'Doğal ve kibar ol.',
      'Bilinmeyen fiyat veya hizmet uydurma.',
      'İnsan temsilci istendiğinde nazikçe yönlendir.'
    ],
    systemPrompt: 'Sen WhatsApp asistanısın.'
  };
}

module.exports = {
  generateSystemPrompt,
  getBusinessData: getFallbackBusinessData
};

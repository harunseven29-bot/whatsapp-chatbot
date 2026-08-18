/**
 * Gemini AI Assistant & Conversation Memory Manager
 * WhatsApp AI Chatbot
 */

const { GoogleGenAI } = require('@google/genai');
const { generateSystemPrompt } = require('./business');

// In-memory conversation history per WhatsApp JID
// Schema: Map<string, Array<{ role: 'user' | 'model', text: string, timestamp: number }>>
const conversationMemory = new Map();

// Configuration
const MAX_HISTORY_MESSAGES = 15; // Retains last 15 messages per user
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for inactive chats

// Cached Gemini Client
let geminiClient = null;

/**
 * Lazy initialization of GoogleGenAI client
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[Gemini] WARNING: GEMINI_API_KEY environment variable is not defined!');
    return null;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return geminiClient;
}

/**
 * Get message history for a user
 * @param {string} jid WhatsApp User ID (e.g. 905xxxxxxxxx@s.whatsapp.net)
 * @returns {Array<{ role: 'user' | 'model', text: string, timestamp: number }>}
 */
function getHistory(jid) {
  if (!conversationMemory.has(jid)) {
    conversationMemory.set(jid, []);
  }
  return conversationMemory.get(jid);
}

/**
 * Add a message to memory, keeping only the last MAX_HISTORY_MESSAGES
 * @param {string} jid 
 * @param {'user' | 'model'} role 
 * @param {string} text 
 */
function addMessage(jid, role, text) {
  const history = getHistory(jid);
  history.push({
    role,
    text: text.trim(),
    timestamp: Date.now()
  });

  // Keep only the latest N messages
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
}

/**
 * Clear history for a specific user or all
 * @param {string} [jid] 
 */
function clearHistory(jid) {
  if (jid) {
    conversationMemory.delete(jid);
  } else {
    conversationMemory.clear();
  }
}

/**
 * Get all active sessions overview (for debugging & monitoring)
 */
function getMemoryStats() {
  const totalUsers = conversationMemory.size;
  let totalMessages = 0;
  for (const [_, msgs] of conversationMemory.entries()) {
    totalMessages += msgs.length;
  }
  return {
    totalUsers,
    totalMessages,
    maxPerUser: MAX_HISTORY_MESSAGES
  };
}

/**
 * Checks if user is explicitly asking for a human agent / representative
 * @param {string} text 
 * @returns {boolean}
 */
function isHumanHandoffRequested(text) {
  const normalized = text.toLowerCase().trim();
  const keywords = [
    'müşteri temsilcisi',
    'yetkili biri',
    'yetkiliye',
    'insanla görüşmek',
    'biriyle görüşmek',
    'canlı destek',
    'temsilciye bağla',
    'yetkiliyle görüşmek',
    'insan temsilci',
    'gerçek biri',
    'şikayetim var',
    'müdür',
    'telefonla arayın'
  ];
  return keywords.some(kw => normalized.includes(kw));
}

/**
 * Generate AI reply using Google Gemini with dynamic system prompt and conversation memory
 * @param {string} jid WhatsApp User ID
 * @param {string} userMessage The incoming user text message
 * @returns {Promise<string>} Generated AI reply
 */
async function generateReply(jid, userMessage) {
  const cleanInput = (userMessage || '').trim();
  if (!cleanInput) {
    return 'Merhaba! Size nasıl yardımcı olabilirim?';
  }

  // 1. Record incoming user message to memory
  addMessage(jid, 'user', cleanInput);

  // 2. Check for explicit human agent handover request
  if (isHumanHandoffRequested(cleanInput)) {
    const handoffReply = 'Talebinizi aldım. Sizi hemen müşteri danışmanımıza / yetkili uzmanımıza aktarıyorum. Yetkilimiz en kısa sürede bu WhatsApp hattından size dönüş sağlayacaktır. İletmek istediğiniz ek bir notunuz var mı? ✨';
    addMessage(jid, 'model', handoffReply);
    console.log(`[Assistant] Human agent handover triggered for: ${jid}`);
    return handoffReply;
  }

  // 3. Obtain Gemini Client
  const ai = getGeminiClient();
  if (!ai) {
    const fallbackMsg = 'Sistemimiz şu anda bakım modundadır. En kısa sürede yanıt vereceğiz veya doğrudan bizi arayabilirsiniz.';
    addMessage(jid, 'model', fallbackMsg);
    return fallbackMsg;
  }

  try {
    // 4. Construct multi-turn contents from conversation history
    const history = getHistory(jid);
    const systemPrompt = generateSystemPrompt();

    // Map internal history format to Gemini contents schema
    const contents = history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.text }]
    }));

    // 5. Generate content with system instruction
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
        topP: 0.95
      }
    });

    const aiText = (response && response.text ? response.text.trim() : '') ||
      'Şu anda sorunuza tam yanıt oluşturamadım. Dilerseniz randevu veya hizmetlerimiz hakkında tekrar yazabilirsiniz.';

    // 6. Record model reply to history
    addMessage(jid, 'model', aiText);

    return aiText;
  } catch (error) {
    console.error(`[Assistant] Gemini API Error for ${jid}:`, error.message);

    const errorReply = 'Üzgünüm, şu anda yanıt verirken geçici bir aksaklık oluştu. Lütfen birkaç saniye sonra tekrar deneyin veya işletme numaramızdan bize ulaşın.';
    addMessage(jid, 'model', errorReply);
    return errorReply;
  }
}

// Cleanup inactive memory periodically (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [jid, msgs] of conversationMemory.entries()) {
    if (msgs.length === 0 || (now - msgs[msgs.length - 1].timestamp > MEMORY_TTL_MS)) {
      conversationMemory.delete(jid);
    }
  }
}, 60 * 60 * 1000);

module.exports = {
  generateReply,
  getHistory,
  addMessage,
  clearHistory,
  getMemoryStats,
  isHumanHandoffRequested
};

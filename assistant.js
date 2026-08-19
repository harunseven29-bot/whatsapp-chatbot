/**
 * Gemini AI Assistant & Conversation Memory Manager
 * Multi-Client Scoped WhatsApp AI Chatbot - Natural Conversations & Context Memory
 */

const { GoogleGenAI } = require('@google/genai');
const { generateSystemPrompt } = require('./business');

// In-memory conversation history per client and WhatsApp JID
// Key: `${clientId}:${jid}`
// Value: Array<{ role: 'user' | 'model', text: string, timestamp: number }>
const conversationMemory = new Map();

// Configuration: 10 messages (5 user + 5 model turns) for lightweight multi-turn context
const MAX_HISTORY_MESSAGES = 10;
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
 * Get scoped memory key for user under specific client
 */
function getMemoryKey(clientId, jid) {
  return `${clientId || 'default'}:${jid}`;
}

/**
 * Get message history for a user under specific client
 * @param {string} clientId
 * @param {string} jid WhatsApp User ID (e.g. 905xxxxxxxxx@s.whatsapp.net)
 * @returns {Array<{ role: 'user' | 'model', text: string, timestamp: number }>}
 */
function getHistory(clientId, jid) {
  const key = getMemoryKey(clientId, jid);
  if (!conversationMemory.has(key)) {
    conversationMemory.set(key, []);
  }
  return conversationMemory.get(key);
}

/**
 * Add a message to memory, keeping only the last MAX_HISTORY_MESSAGES
 * @param {string} clientId
 * @param {string} jid 
 * @param {'user' | 'model'} role 
 * @param {string} text 
 */
function addMessage(clientId, jid, role, text) {
  const history = getHistory(clientId, jid);
  history.push({
    role,
    text: text.trim(),
    timestamp: Date.now()
  });

  // Keep only the latest N messages (5-10 turns)
  if (history.length > MAX_HISTORY_MESSAGES) {
    history.splice(0, history.length - MAX_HISTORY_MESSAGES);
  }
}

/**
 * Clear history for a specific user or all
 * @param {string} [clientId]
 * @param {string} [jid] 
 */
function clearHistory(clientId, jid) {
  if (clientId && jid) {
    conversationMemory.delete(getMemoryKey(clientId, jid));
  } else if (clientId) {
    for (const key of conversationMemory.keys()) {
      if (key.startsWith(`${clientId}:`)) {
        conversationMemory.delete(key);
      }
    }
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
 * @param {object|string} clientConfigOrId Client config object or clientId string
 * @param {string} jid WhatsApp User ID
 * @param {string} userMessage The incoming user text message
 * @returns {Promise<string>} Generated AI reply
 */
async function generateReply(clientConfigOrId, jid, userMessage) {
  const clientConfig = typeof clientConfigOrId === 'object' && clientConfigOrId !== null
    ? clientConfigOrId
    : { id: clientConfigOrId || 'client-001', businessName: 'İşletme' };

  const clientId = clientConfig.id || 'default';
  const cleanInput = (userMessage || '').trim();

  if (!cleanInput) {
    return 'Merhaba! Nasıl yardımcı olabilirim?';
  }

  // 1. Record incoming user message to client-isolated memory
  addMessage(clientId, jid, 'user', cleanInput);

  // 2. Check for explicit human agent handover request
  if (isHumanHandoffRequested(cleanInput)) {
    const handoffReply = 'Talebinizi aldım, sizi hemen danışmanımıza / yetkili uzmanımıza aktarıyorum. Yetkilimiz en kısa sürede bu WhatsApp hattından size dönüş sağlayacaktır. İletmek istediğiniz ek bir notunuz var mı? ✨';
    addMessage(clientId, jid, 'model', handoffReply);
    console.log(`[Assistant][${clientId}] Human agent handover triggered for: ${jid}`);
    return handoffReply;
  }

  // 3. Obtain Gemini Client
  const ai = getGeminiClient();
  if (!ai) {
    const fallbackMsg = 'Sistemimiz şu anda bakım modundadır. En kısa sürede yanıt vereceğiz veya doğrudan bizi arayabilirsiniz.';
    addMessage(clientId, jid, 'model', fallbackMsg);
    return fallbackMsg;
  }

  try {
    // 4. Construct multi-turn contents from conversation history (last 5-10 turns)
    const history = getHistory(clientId, jid);
    const systemPrompt = generateSystemPrompt(clientConfig);

    // Map internal history format to Gemini contents schema
    const contents = history.map(item => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.text }]
    }));

    // 5. Generate content with system instruction using gemini-3.1-flash-lite (fast & robust) with 3.7 fallback
    let response = null;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.75,
          topP: 0.95
        }
      });
    } catch (primaryErr) {
      console.warn(`[Assistant][${clientId}] gemini-3.1-flash-lite fallback deneniyor:`, primaryErr.message);
      response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.75,
          topP: 0.95
        }
      });
    }

    const aiText = (response && response.text ? response.text.trim() : '') ||
      'Sorunuzu tam anlayamadım, dilerseniz hizmetlerimiz veya randevu hakkında tekrar yazabilirsiniz.';

    // 6. Record model reply to history
    addMessage(clientId, jid, 'model', aiText);

    return aiText;
  } catch (error) {
    console.error(`[Assistant][${clientId}] Gemini API Error for ${jid}:`, error.message);

    const errorReply = 'Şu anda yanıt verirken geçici bir aksaklık oluştu. Lütfen birkaç saniye sonra tekrar deneyin veya bizi doğrudan arayın.';
    addMessage(clientId, jid, 'model', errorReply);
    return errorReply;
  }
}

// Cleanup inactive memory periodically (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [key, msgs] of conversationMemory.entries()) {
    if (msgs.length === 0 || (now - msgs[msgs.length - 1].timestamp > MEMORY_TTL_MS)) {
      conversationMemory.delete(key);
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

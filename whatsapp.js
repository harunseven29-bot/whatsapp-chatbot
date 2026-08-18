/**
 * WhatsApp Connection Manager using @whiskeysockets/baileys
 * Ultra-lightweight backend for Wispbyte Free / 24/7 VPS
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { generateReply } = require('./assistant');

// Auth Directory Setup (Default: ./auth, Wispbyte: /home/container/auth or custom)
const DEFAULT_AUTH_DIR = path.resolve(__dirname, 'auth');
const AUTH_DIR = process.env.AUTH_DIR ? path.resolve(process.env.AUTH_DIR) : DEFAULT_AUTH_DIR;

// State holder for memory stats and health monitoring
const clientState = {
  status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'qr_ready'
  qrString: null,
  pairingCode: null,
  userJid: null,
  userName: null,
  connectedAt: null,
  reconnectAttempts: 0,
  stats: {
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    lastActivity: null
  }
};

// Global socket and startup locks
let waSocket = null;
let isReconnecting = false;
let isInitializing = false;
let isStarted = false;

/**
 * Clean logging helper
 */
function logEvent(type, message, details = null) {
  const prefix = `[WhatsApp - ${type.toUpperCase()}]`;
  if (details) {
    console.log(`${prefix} ${message}`, details);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Extract clean plain text from incoming WhatsApp message object
 */
function extractTextMessage(msg) {
  if (!msg || !msg.message) return null;
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    null
  );
}

/**
 * Initializes and starts the Baileys WhatsApp Socket (Ensuring single instance)
 */
async function startWhatsApp(isReconnect = false) {
  if (isInitializing && !isReconnect) {
    logEvent('info', 'WhatsApp başlatma işlemi zaten devam ediyor, mükerrer çağrı engellendi.');
    return waSocket;
  }
  if (isStarted && !isReconnect && waSocket && clientState.status === 'connected') {
    logEvent('info', 'WhatsApp zaten bağlı ve çalışıyor.');
    return waSocket;
  }

  isInitializing = true;

  try {
    // 1. Ensure persistent auth directory exists
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
      logEvent('info', `Kalıcı auth klasörü oluşturuldu: ${AUTH_DIR}`);
    } else {
      logEvent('info', `Mevcut auth klasörü kullanılıyor: ${AUTH_DIR}`);
    }

    clientState.status = 'connecting';

    // 2. Load multi-file auth state from persistent directory
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    logEvent('info', `Baileys v${version.join('.')} başlatılıyor (isLatest: ${isLatest})`);

    // 3. Create WhatsApp Socket
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }), // Suppress internal noisy Baileys logs to save CPU/RAM
      printQRInTerminal: false, // Handled manually with qrcode-terminal
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: Browsers.ubuntu('Chrome'),
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000
    });

    waSocket = sock;
    isStarted = true;
    isInitializing = false;

    // 4. Handle pairing code if phone number is provided in PAIRING_NUMBER and not registered
    const pairingNumber = (process.env.PAIRING_NUMBER || '').replace(/[^0-9]/g, '');
    const isRegistered = Boolean(state?.creds?.registered);

    if (pairingNumber && !isRegistered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(pairingNumber);
          clientState.pairingCode = code;
          console.log(`\n========================================`);
          console.log(`🔑 WHATSAPP PAIRING CODE: ${code}`);
          console.log(`Telefonunuzdan WhatsApp > Bağlı Cihazlar > Telefon Numarası ile Bağla`);
          console.log(`========================================\n`);
        } catch (err) {
          logEvent('hata', `Pairing code alma hatası: ${err.message}`);
        }
      }, 3000);
    }

    // 5. Credential persistence handler
    sock.ev.on('creds.update', saveCreds);

    // 6. Connection state update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code handling
      if (qr) {
        clientState.status = 'qr_ready';
        clientState.qrString = qr;

        console.log('\n======================================================');
        console.log('📱 WhatsApp QR Kodu Hazır! Telefonunuzla Taratın:');
        console.log('======================================================\n');
        qrcodeTerminal.generate(qr, { small: true });
        logEvent('auth', 'WhatsApp QR kodu terminale yazdırıldı.');
      }

      // Connection state changes
      if (connection === 'open') {
        clientState.status = 'connected';
        clientState.qrString = null;
        clientState.pairingCode = null;
        clientState.connectedAt = new Date().toISOString();
        clientState.reconnectAttempts = 0;
        isReconnecting = false;

        const user = sock.user;
        clientState.userJid = user?.id || null;
        clientState.userName = user?.name || 'Bot';

        logEvent('baglanti', '✅ WhatsApp bağlandı! Bot aktif ve mesajları dinliyor.');
        console.log(`[WhatsApp] Bağlanan Hesap: ${user?.name || ''} (${user?.id || ''})`);
      } else if (connection === 'close') {
        clientState.status = 'disconnected';
        clientState.connectedAt = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Bilinmeyen sebep';
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logEvent('kopma', `⚠️ WhatsApp bağlantı koptu. Sebep: ${reason} (Kod: ${statusCode})`);

        if (statusCode === DisconnectReason.loggedOut) {
          logEvent('hata', '❌ WhatsApp oturumu kapatıldı (Logged out). Lütfen auth klasörünü temizleyip tekrar QR taratın.');
          try {
            if (fs.existsSync(AUTH_DIR)) {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
              logEvent('info', 'Eski auth verileri temizlendi.');
            }
          } catch (e) {
            console.error('[Auth] Temizleme hatası:', e.message);
          }
          // Restart to allow new QR generation
          setTimeout(() => {
            startWhatsApp(true);
          }, 3000);
        } else if (shouldReconnect && !isReconnecting) {
          isReconnecting = true;
          clientState.reconnectAttempts += 1;
          const delay = Math.min(clientState.reconnectAttempts * 2000, 15000);
          logEvent('reconnect', `🔄 Yeniden bağlanılıyor... (Deneme: ${clientState.reconnectAttempts}, ${delay / 1000}s sonra)`);
          setTimeout(() => {
            isReconnecting = false;
            startWhatsApp(true);
          }, delay);
        }
      } else if (connection === 'connecting') {
        clientState.status = 'connecting';
        logEvent('info', 'WhatsApp sunucularına bağlanılıyor...');
      }
    });

    // 7. Incoming Messages Handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !Array.isArray(messages)) return;

      for (const msg of messages) {
        try {
          // Rule 1: Do not reply to own messages
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          // Rule 2: Ignore group messages by default (@g.us)
          if (remoteJid.endsWith('@g.us')) {
            continue;
          }

          // Rule 3: Ignore broadcast / status updates
          if (remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast')) {
            continue;
          }

          // Rule 4: Process only text messages
          const userText = extractTextMessage(msg);
          if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
            continue;
          }

          clientState.stats.messagesReceived += 1;
          clientState.stats.lastActivity = new Date().toISOString();

          const senderName = msg.pushName || remoteJid.split('@')[0];
          logEvent('mesaj', `📩 [${senderName} (${remoteJid})]: "${userText}"`);

          // Send "typing..." presence
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (presenceErr) {
            // non-fatal
          }

          // Generate response with Gemini AI
          const aiResponse = await generateReply(remoteJid, userText);

          // Stop "typing..." presence
          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          // Send Gemini AI response back
          await sock.sendMessage(remoteJid, {
            text: aiResponse
          });

          clientState.stats.messagesSent += 1;
          logEvent('cevap', `🤖 [Yanıt -> ${senderName}]: "${aiResponse.substring(0, 80)}..."`);
        } catch (msgErr) {
          clientState.stats.errors += 1;
          logEvent('hata', `Mesaj işleme hatası: ${msgErr.message}`);
        }
      }
    });

    return sock;
  } catch (initErr) {
    isInitializing = false;
    clientState.status = 'disconnected';
    clientState.stats.errors += 1;
    logEvent('hata', `WhatsApp başlatma hatası: ${initErr.message}`);
    
    setTimeout(() => {
      startWhatsApp(true);
    }, 5000);
  }
}

/**
 * Get current WhatsApp status & metadata
 */
function getWhatsAppStatus() {
  return {
    ...clientState,
    authDir: AUTH_DIR,
    authDirExists: fs.existsSync(AUTH_DIR),
    isConfigured: !!process.env.GEMINI_API_KEY
  };
}

/**
 * Disconnect socket gracefully
 */
async function disconnectWhatsApp() {
  if (waSocket) {
    try {
      await waSocket.end();
      clientState.status = 'disconnected';
      logEvent('info', 'WhatsApp soketi kapatıldı.');
    } catch (e) {
      console.error('[WhatsApp] End error:', e.message);
    }
  }
}

module.exports = {
  startWhatsApp,
  getWhatsAppStatus,
  disconnectWhatsApp,
  AUTH_DIR
};

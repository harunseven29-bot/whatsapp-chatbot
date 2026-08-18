/**
 * WhatsApp Connection Manager using @whiskeysockets/baileys
 * Ultra-lightweight backend with Multi-session ready architecture
 * Resilient 24/7 reconnection engine with Baileys Stream & 515/503 handlers
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
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { generateReply } = require('./assistant');

// Base Auth Directory (Default: ./auth, Wispbyte: /home/container/auth or custom)
const BASE_AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.resolve(__dirname, 'auth');

/**
 * Session storage map (Designed for single & multi-session support)
 */
const sessions = new Map();

/**
 * Helper to get or create session state
 */
function getOrCreateSession(sessionId = 'default') {
  if (!sessions.has(sessionId)) {
    const sessionAuthDir = sessionId === 'default'
      ? BASE_AUTH_DIR
      : path.join(BASE_AUTH_DIR, sessionId);

    sessions.set(sessionId, {
      id: sessionId,
      authDir: sessionAuthDir,
      socket: null,
      status: 'disconnected', // 'disconnected' | 'connecting' | 'waiting_qr' | 'connected'
      qrString: null,
      qrDataUrl: null,
      qrUpdatedAt: null,
      pairingCode: null,
      userJid: null,
      userName: null,
      connectedAt: null,
      reconnectAttempts: 0,
      isReconnecting: false,
      isInitializing: false,
      reconnectTimer: null,
      stats: {
        messagesReceived: 0,
        messagesSent: 0,
        errors: 0,
        lastActivity: null
      }
    });
  }
  return sessions.get(sessionId);
}

/**
 * Clean logging helper
 */
function logEvent(type, message, details = null, sessionId = 'default') {
  const prefix = `[WhatsApp${sessionId !== 'default' ? `:${sessionId}` : ''} - ${type.toUpperCase()}]`;
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
 * Cleanly destroy previous socket and listeners
 */
function cleanupSocket(session) {
  if (session.socket) {
    try {
      session.socket.ev.removeAllListeners();
    } catch (e) {}
    try {
      session.socket.end(undefined);
    } catch (e) {}
    session.socket = null;
  }
}

/**
 * Starts WhatsApp socket connection for given session with auto-healing
 */
async function startWhatsApp(sessionId = 'default', isReconnect = false) {
  const session = getOrCreateSession(sessionId);

  // Clear any existing reconnect timer
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  if (session.isInitializing && !isReconnect) {
    logEvent('info', 'Oturum başlatma işlemi zaten devam ediyor.', null, sessionId);
    return session.socket;
  }

  if (!isReconnect && session.socket && session.status === 'connected') {
    logEvent('info', 'WhatsApp zaten bağlı ve çalışıyor.', null, sessionId);
    return session.socket;
  }

  session.isInitializing = true;

  // Clean up existing socket before opening a fresh one
  cleanupSocket(session);

  try {
    // 1. Ensure persistent auth directory exists
    if (!fs.existsSync(session.authDir)) {
      fs.mkdirSync(session.authDir, { recursive: true });
      logEvent('info', `Kalıcı auth klasörü oluşturuldu: ${session.authDir}`, null, sessionId);
    }

    session.status = 'connecting';

    // 2. Load multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    if (!isReconnect || session.reconnectAttempts <= 1) {
      logEvent('info', `Baileys v${version.join('.')} başlatılıyor (isLatest: ${isLatest})`, null, sessionId);
    }

    // 3. Create WhatsApp Socket
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }), // Suppress internal noisy logs
      printQRInTerminal: false,
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
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 500,
      maxRetries: 5,
      getMessage: async () => ({ conversation: '' })
    });

    session.socket = sock;
    session.isInitializing = false;

    // 4. Handle pairing code if phone number is provided in PAIRING_NUMBER and not registered
    const pairingNumber = (process.env.PAIRING_NUMBER || '').replace(/[^0-9]/g, '');
    const isRegistered = Boolean(state?.creds?.registered);

    if (pairingNumber && !isRegistered && sessionId === 'default') {
      setTimeout(async () => {
        try {
          if (session.socket && session.status !== 'connected') {
            const code = await sock.requestPairingCode(pairingNumber);
            session.pairingCode = code;
            console.log(`\n========================================`);
            console.log(`🔑 WHATSAPP PAIRING CODE: ${code}`);
            console.log(`Telefonunuzdan WhatsApp > Bağlı Cihazlar > Telefon Numarası ile Bağla`);
            console.log(`========================================\n`);
          }
        } catch (err) {
          logEvent('bilgi', `Pairing code alma durumu: ${err.message}`, null, sessionId);
        }
      }, 3000);
    }

    // 5. Credential persistence handler
    sock.ev.on('creds.update', saveCreds);

    // 6. Connection state update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log("[DEBUG] CONNECTION_UPDATE", {
        connection,
        hasQr: !!qr,
        hasLastDisconnect: !!lastDisconnect
      });

      // QR Code handling
      if (qr) {
        console.log("[DEBUG] BAILEYS_QR_NEW", {
          length: qr.length,
          prefix: qr.slice(0, 12),
          updatedAt: Date.now()
        });

        session.status = 'waiting_qr';
        session.qrString = qr;
        session.qrUpdatedAt = new Date().toISOString();

        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 1,
            width: 340,
            color: {
              dark: '#111827',
              light: '#ffffff'
            }
          });
        } catch (qrGenErr) {
          // non-fatal
        }

        // Print clean QR to terminal
        console.log('\n======================================================');
        console.log(`📱 WhatsApp QR Kodu Hazır (${sessionId})! Web: /connect`);
        console.log('======================================================\n');
        qrcodeTerminal.generate(qr, { small: true });
        logEvent('auth', 'Yeni WhatsApp QR kodu oluşturuldu ve web arayüzüne iletildi.', null, sessionId);
      }

      // Connection open
      if (connection === 'open') {
        session.status = 'connected';
        session.qrString = null;
        session.qrDataUrl = null;
        session.qrUpdatedAt = null;
        session.pairingCode = null;
        session.connectedAt = new Date().toISOString();
        session.reconnectAttempts = 0;
        session.isReconnecting = false;

        const user = sock.user;
        session.userJid = user?.id || null;
        session.userName = user?.name || 'WhatsApp Hesabı';

        logEvent('baglanti', '✅ WhatsApp başarıyla bağlandı! Bot aktif ve mesajları dinliyor.', null, sessionId);
        console.log(`[WhatsApp] Bağlanan Hesap: ${user?.name || ''} (${user?.id || ''})`);
      } else if (connection === 'close') {
        session.status = 'disconnected';
        session.connectedAt = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Bağlantı kapandı';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

        if (isLoggedOut) {
          logEvent('info', 'Oturum kapatıldı (Logged out). Auth klasörü yenileniyor.', null, sessionId);
          try {
            if (fs.existsSync(session.authDir)) {
              fs.rmSync(session.authDir, { recursive: true, force: true });
            }
          } catch (e) {}

          session.reconnectTimer = setTimeout(() => {
            startWhatsApp(sessionId, true);
          }, 1500);

        } else if (isRestartRequired) {
          // Baileys standard 515 handshake restart - immediate fast reconnect
          logEvent('info', 'WhatsApp akış anahtarları güncellendi (515 Restart Required), anında devam ediliyor...', null, sessionId);
          session.isReconnecting = false;
          session.reconnectTimer = setTimeout(() => {
            startWhatsApp(sessionId, true);
          }, 250);

        } else {
          // Standard auto-reconnection for network blips (503, 408, etc.)
          logEvent('info', `Bağlantı tazeleniyor (Sebep: ${reason}, Kod: ${statusCode || 'Stream'})...`, null, sessionId);

          if (!session.isReconnecting) {
            session.isReconnecting = true;
            session.reconnectAttempts += 1;
            const delay = Math.min(session.reconnectAttempts * 1500, 10000);

            session.reconnectTimer = setTimeout(() => {
              session.isReconnecting = false;
              startWhatsApp(sessionId, true);
            }, delay);
          }
        }
      } else if (connection === 'connecting') {
        session.status = 'connecting';
        if (session.reconnectAttempts <= 1) {
          logEvent('info', 'WhatsApp sunucularına bağlanılıyor...', null, sessionId);
        }
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

          // Rule 2: Ignore group messages (@g.us)
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

          session.stats.messagesReceived += 1;
          session.stats.lastActivity = new Date().toISOString();

          const senderName = msg.pushName || remoteJid.split('@')[0];
          logEvent('mesaj', `📩 [${senderName} (${remoteJid})]: "${userText}"`, null, sessionId);

          // Send "typing..." presence
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (presenceErr) {}

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

          session.stats.messagesSent += 1;
          logEvent('cevap', `🤖 [Yanıt -> ${senderName}]: "${aiResponse.substring(0, 80)}..."`, null, sessionId);
        } catch (msgErr) {
          session.stats.errors += 1;
          logEvent('bilgi', `Mesaj işleme durumu: ${msgErr.message}`, null, sessionId);
        }
      }
    });

    return sock;
  } catch (initErr) {
    session.isInitializing = false;
    session.status = 'disconnected';
    session.stats.errors += 1;
    logEvent('info', `WhatsApp başlatma tazeleniyor: ${initErr.message}`, null, sessionId);

    session.reconnectTimer = setTimeout(() => {
      startWhatsApp(sessionId, true);
    }, 3000);
  }
}

/**
 * Get current WhatsApp status & metadata for session
 */
function getWhatsAppStatus(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);

  return {
    sessionId: session.id,
    status: session.status,
    qr: session.status === 'waiting_qr' ? session.qrDataUrl : null,
    qrRaw: session.status === 'waiting_qr' ? session.qrString : null,
    qrUpdatedAt: session.qrUpdatedAt,
    pairingCode: session.pairingCode,
    userJid: session.userJid,
    userName: session.userName,
    connectedAt: session.connectedAt,
    reconnectAttempts: session.reconnectAttempts,
    stats: session.stats,
    authDir: session.authDir,
    authDirExists: fs.existsSync(session.authDir),
    isConfigured: !!process.env.GEMINI_API_KEY
  };
}

/**
 * Logout / Disconnect session and optionally clear session credentials
 */
async function logoutWhatsApp(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);
  logEvent('info', 'Oturum kapatma talebi alındı.', null, sessionId);

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  if (session.socket) {
    try {
      await session.socket.logout();
    } catch (e) {}
    cleanupSocket(session);
  }

  session.status = 'disconnected';
  session.userJid = null;
  session.userName = null;
  session.connectedAt = null;
  session.qrString = null;
  session.qrDataUrl = null;
  session.isInitializing = false;
  session.isReconnecting = false;

  try {
    if (fs.existsSync(session.authDir)) {
      fs.rmSync(session.authDir, { recursive: true, force: true });
      logEvent('info', 'Oturum auth klasörü temizlendi.', null, sessionId);
    }
  } catch (err) {
    console.error('[Auth] Temizleme hatası:', err.message);
  }

  // Trigger fresh startup to generate a new QR code immediately
  session.reconnectTimer = setTimeout(() => {
    startWhatsApp(sessionId, true);
  }, 1000);

  return { success: true, message: 'Oturum kapatıldı, yeni QR üretiliyor.' };
}

/**
 * Disconnect socket gracefully on server shutdown
 */
async function disconnectWhatsApp(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  cleanupSocket(session);
  session.status = 'disconnected';
  logEvent('info', 'WhatsApp soketi güvenli kapatıldı.', null, sessionId);
}

module.exports = {
  startWhatsApp,
  getWhatsAppStatus,
  logoutWhatsApp,
  disconnectWhatsApp,
  AUTH_DIR: BASE_AUTH_DIR
};

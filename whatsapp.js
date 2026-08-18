/**
 * WhatsApp Connection Manager using @whiskeysockets/baileys
 * Ultra-lightweight 24/7 backend with Pairing-Code Architecture
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { generateReply } = require('./assistant');

// Base Auth Directory (Default: ./auth, Wispbyte: /home/container/auth or custom)
const BASE_AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.resolve(__dirname, 'auth');

// Default target pairing number
const DEFAULT_PAIRING_NUMBER = '905102237729';

/**
 * Authoritative in-memory state returned instantly by /api/whatsapp/status
 */
const whatsappState = {
  status: "starting", // "starting" | "connecting" | "waiting_pairing_code" | "connected" | "disconnected"
  pairingCode: null,
  jid: null,
  userName: null,
  connectedAt: null,
  updatedAt: Date.now()
};

/**
 * Session storage map
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
      status: 'starting',
      pairingCode: null,
      pairingCodeRequested: false,
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
 * Starts WhatsApp socket connection using pairing code (Single instance)
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

  if (!isReconnect && session.socket && whatsappState.status === 'connected') {
    logEvent('info', 'WhatsApp zaten bağlı ve çalışıyor.', null, sessionId);
    return session.socket;
  }

  session.isInitializing = true;
  cleanupSocket(session);

  try {
    // 1. Ensure persistent auth directory exists
    if (!fs.existsSync(session.authDir)) {
      fs.mkdirSync(session.authDir, { recursive: true });
      logEvent('info', `Kalıcı auth klasörü oluşturuldu: ${session.authDir}`, null, sessionId);
    }

    whatsappState.status = 'connecting';
    whatsappState.updatedAt = Date.now();
    session.status = 'connecting';

    // 2. Load multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307],
      isLatest: true
    }));

    const isRegistered = Boolean(state?.creds?.registered);
    if (!isReconnect || session.reconnectAttempts <= 1) {
      logEvent('info', `Baileys v${version.join('.')} başlatılıyor (Registered: ${isRegistered}, isLatest: ${isLatest})`, null, sessionId);
    }

    // 3. Create SINGLE WhatsApp Socket (Default browser, no terminal QR)
    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
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
    session.pairingCodeRequested = false;

    // 4. Credential persistence handler
    sock.ev.on('creds.update', saveCreds);

    // 5. Connection state update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      console.log('[WA EVENT]', {
        connection,
        hasQr: !!qr
      });

      // Pairing Code Request: Triggered on initial qr event when not registered
      if (
        qr &&
        !sock.authState?.creds?.registered &&
        !session.pairingCodeRequested
      ) {
        session.pairingCodeRequested = true;

        try {
          const rawPhone = process.env.PAIRING_NUMBER || DEFAULT_PAIRING_NUMBER;
          const phoneNumber = rawPhone.replace(/\D/g, '');

          const code = await sock.requestPairingCode(phoneNumber);
          const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;

          session.pairingCode = formattedCode;
          whatsappState.status = 'waiting_pairing_code';
          whatsappState.pairingCode = formattedCode;
          whatsappState.updatedAt = Date.now();

          console.log('');
          console.log('==========================================');
          console.log('📱 WHATSAPP BAĞLANTI KODU');
          console.log('==========================================');
          console.log(formattedCode);
          console.log('==========================================');
          console.log('WhatsApp > Bağlı Cihazlar > Cihaz Bağla > Telefon numarasıyla bağla');
          console.log('==========================================');
          console.log('');

        } catch (err) {
          session.pairingCodeRequested = false;
          console.error('[PAIRING CODE ERROR]', err.message || err);
        }
      }

      // Connection open
      if (connection === 'open') {
        const user = sock.user;

        console.log('');
        console.log('==========================================');
        console.log('✅ WHATSAPP BAŞARIYLA BAĞLANDI');
        console.log('JID:', user?.id);
        console.log('==========================================');
        console.log('');

        whatsappState.status = 'connected';
        whatsappState.pairingCode = null;
        whatsappState.jid = user?.id || null;
        whatsappState.userName = user?.name || 'WhatsApp Hesabı';
        whatsappState.connectedAt = Date.now();
        whatsappState.updatedAt = Date.now();

        session.status = 'connected';
        session.reconnectAttempts = 0;
        session.isReconnecting = false;
      } else if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || 'Bağlantı kapandı';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;

        whatsappState.status = 'disconnected';
        whatsappState.connectedAt = null;
        whatsappState.updatedAt = Date.now();
        session.status = 'disconnected';

        if (isLoggedOut) {
          logEvent('info', 'Oturum kapatıldı (Logged out). Auth klasörü yenileniyor.', null, sessionId);
          whatsappState.jid = null;
          whatsappState.userName = null;
          whatsappState.pairingCode = null;

          try {
            if (fs.existsSync(session.authDir)) {
              fs.rmSync(session.authDir, { recursive: true, force: true });
            }
          } catch (e) {}

          session.reconnectTimer = setTimeout(() => {
            startWhatsApp(sessionId, true);
          }, 1500);

        } else if (isRestartRequired) {
          logEvent('info', 'WhatsApp akış anahtarları güncellendi (515 Restart Required), anında devam ediliyor...', null, sessionId);
          session.isReconnecting = false;
          session.reconnectTimer = setTimeout(() => {
            startWhatsApp(sessionId, true);
          }, 250);

        } else {
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
        whatsappState.status = 'connecting';
        whatsappState.updatedAt = Date.now();
        session.status = 'connecting';
      }
    });

    // 6. Incoming Messages Handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !Array.isArray(messages)) return;

      for (const msg of messages) {
        try {
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('@broadcast')) {
            continue;
          }

          const userText = extractTextMessage(msg);
          if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
            continue;
          }

          session.stats.messagesReceived += 1;
          session.stats.lastActivity = new Date().toISOString();

          const senderName = msg.pushName || remoteJid.split('@')[0];
          logEvent('mesaj', `📩 [${senderName} (${remoteJid})]: "${userText}"`, null, sessionId);

          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (presenceErr) {}

          const aiResponse = await generateReply(remoteJid, userText);

          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          await sock.sendMessage(remoteJid, { text: aiResponse });

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
    whatsappState.status = 'disconnected';
    whatsappState.updatedAt = Date.now();
    session.status = 'disconnected';
    session.stats.errors += 1;
    logEvent('info', `WhatsApp başlatma tazeleniyor: ${initErr.message}`, null, sessionId);

    session.reconnectTimer = setTimeout(() => {
      startWhatsApp(sessionId, true);
    }, 3000);
  }
}

/**
 * Logout & reset
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

  whatsappState.status = 'disconnected';
  whatsappState.pairingCode = null;
  whatsappState.jid = null;
  whatsappState.userName = null;
  whatsappState.connectedAt = null;
  whatsappState.updatedAt = Date.now();

  session.status = 'disconnected';
  session.pairingCode = null;
  session.pairingCodeRequested = false;
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

  session.reconnectTimer = setTimeout(() => {
    startWhatsApp(sessionId, true);
  }, 1000);

  return { success: true, message: 'Oturum kapatıldı, yeni bağlantı kodu bekleniyor.' };
}

/**
 * Disconnect socket gracefully
 */
async function disconnectWhatsApp(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
  cleanupSocket(session);
  whatsappState.status = 'disconnected';
  whatsappState.updatedAt = Date.now();
  session.status = 'disconnected';
  logEvent('info', 'WhatsApp soketi güvenli kapatıldı.', null, sessionId);
}

module.exports = {
  startWhatsApp,
  logoutWhatsApp,
  disconnectWhatsApp,
  whatsappState,
  AUTH_DIR: BASE_AUTH_DIR
};

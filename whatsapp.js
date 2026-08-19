/**
 * WhatsApp Connection Manager using @whiskeysockets/baileys
 * Ultra-lightweight 24/7 backend - Resilient Post-Pairing Reconnect Pipeline
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

/**
 * Determine the most durable storage directory available in the host/container.
 */
function resolveBaseAuthDir() {
  if (process.env.AUTH_DIR && process.env.AUTH_DIR.trim()) {
    return path.resolve(process.env.AUTH_DIR.trim());
  }

  // Check known persistent volume mount points in containers (e.g. DockHosting / Docker / Railway)
  const candidateMounts = ['/data/auth', '/data', '/persistent/auth', '/mnt/data/auth'];
  for (const candidate of candidateMounts) {
    try {
      const parentDir = path.dirname(candidate);
      if (fs.existsSync(candidate) || fs.existsSync(parentDir)) {
        const target = candidate.endsWith('auth') ? candidate : path.join(candidate, 'auth');
        if (!fs.existsSync(target)) {
          fs.mkdirSync(target, { recursive: true });
        }
        return target;
      }
    } catch (e) {}
  }

  return path.resolve(__dirname, 'auth');
}

const BASE_AUTH_DIR = resolveBaseAuthDir();

// Known backup/persistent directories for session synchronization
const BACKUP_DIRS = [
  '/data/auth',
  path.resolve(__dirname, 'auth')
].filter(dir => dir !== BASE_AUTH_DIR);

/**
 * Restore credentials from any available persistent backup if primary is empty
 */
function restorePersistedAuth(targetDir) {
  try {
    const credsPath = path.join(targetDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      return true;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    for (const backupDir of BACKUP_DIRS) {
      const backupCreds = path.join(backupDir, 'creds.json');
      if (fs.existsSync(backupCreds)) {
        console.log(`[Auth Persistence] Yedek auth deposundan (${backupDir}) oturum dosyaları geri yükleniyor -> ${targetDir}`);
        const files = fs.readdirSync(backupDir);
        for (const file of files) {
          try {
            fs.copyFileSync(path.join(backupDir, file), path.join(targetDir, file));
          } catch (copyErr) {}
        }
        return true;
      }
    }
  } catch (err) {
    console.error('[Auth Persistence] Geri yükleme hatası:', err.message);
  }
  return false;
}

/**
 * Mirror primary session files to backup locations for cross-container durability
 */
function syncAuthToBackup(sourceDir) {
  try {
    if (!fs.existsSync(sourceDir)) return;
    const credsPath = path.join(sourceDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return;

    for (const backupDir of BACKUP_DIRS) {
      try {
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
          try {
            fs.copyFileSync(path.join(sourceDir, file), path.join(backupDir, file));
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (err) {}
}

// Authoritative Memory State
let currentQr = null;
let qrUpdatedAt = null;
let reconnectScheduled = false;

const whatsappState = {
  status: "starting", // "starting" | "connecting" | "waiting_qr" | "connected" | "disconnected"
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
      reconnectAttempts: 0,
      isInitializing: false,
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
 * Single reconnect scheduler to prevent duplicate sockets
 */
function scheduleReconnect(delay = 1000, sessionId = 'default') {
  if (reconnectScheduled) return;
  reconnectScheduled = true;

  setTimeout(async () => {
    reconnectScheduled = false;
    console.log('[WA] Kaydedilmiş auth ile socket yeniden başlatılıyor...');
    await startWhatsApp(sessionId, true);
  }, delay);
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
 * Starts WhatsApp socket connection
 */
async function startWhatsApp(sessionId = 'default', isReconnect = false) {
  const session = getOrCreateSession(sessionId);

  if (session.isInitializing && !isReconnect) {
    console.log('[WA] Oturum başlatma işlemi zaten devam ediyor.');
    return session.socket;
  }

  if (!isReconnect && session.socket && whatsappState.status === 'connected') {
    console.log('[WA] WhatsApp zaten bağlı ve çalışıyor.');
    return session.socket;
  }

  session.isInitializing = true;
  cleanupSocket(session);

  try {
    // 1. Ensure persistent auth directory exists and restore backups if available
    if (!fs.existsSync(session.authDir)) {
      fs.mkdirSync(session.authDir, { recursive: true });
    }
    restorePersistedAuth(session.authDir);

    whatsappState.status = 'connecting';
    whatsappState.updatedAt = Date.now();
    session.status = 'connecting';

    // 2. Load multi-file auth state from persistent storage
    const { state, saveCreds } = await useMultiFileAuthState(session.authDir);
    console.log('[AUTH] Registered:', state.creds.registered);

    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307]
    }));

    // 3. Create SINGLE WhatsApp Socket
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

    // 4. Credential persistence handler
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      console.log('[AUTH] Credentials kaydedildi.');
      syncAuthToBackup(session.authDir);
    });

    // 5. Connection state update handler
    sock.ev.on('connection.update', async (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
        isNewLogin
      } = update;

      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.statusCode ||
        null;

      console.log('[WA EVENT]', {
        connection,
        hasQr: !!qr,
        isNewLogin: !!isNewLogin,
        statusCode
      });

      if (qr) {
        currentQr = qr;
        qrUpdatedAt = Date.now();

        whatsappState.status = 'waiting_qr';
        whatsappState.updatedAt = qrUpdatedAt;

        console.log('');
        console.log('==========================================');
        console.log('📱 WHATSAPP BAĞLANTISI BEKLENİYOR');
        console.log('QR:');
        console.log('https://whatsapp-chatbot.dockhosting.dev/qr');
        console.log('==========================================');
        console.log('');
      }

      if (isNewLogin) {
        console.log(
          '[AUTH] QR kabul edildi. İlk login tamamlandı; socket restart bekleniyor.'
        );
      }

      if (connection === 'open') {
        reconnectScheduled = false;
        currentQr = null;

        console.log('');
        console.log('==========================================');
        console.log('✅ WHATSAPP BAŞARIYLA BAĞLANDI');
        console.log('JID:', sock.user?.id || 'unknown');
        console.log('==========================================');
        console.log('');

        whatsappState.status = 'connected';
        whatsappState.jid = sock.user?.id || 'unknown';
        whatsappState.userName = sock.user?.name || 'WhatsApp Hesabı';
        whatsappState.connectedAt = Date.now();
        whatsappState.updatedAt = Date.now();

        session.status = 'connected';
        session.reconnectAttempts = 0;

        // Ensure newly authenticated session is fully synced to persistent storage
        try {
          await saveCreds();
          syncAuthToBackup(session.authDir);
        } catch (e) {}
        return;
      }

      if (connection === 'close') {
        currentQr = null;
        whatsappState.status = 'disconnected';
        whatsappState.connectedAt = null;
        whatsappState.updatedAt = Date.now();
        session.status = 'disconnected';

        console.log(
          '[WA CLOSE]',
          'statusCode:',
          statusCode
        );

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(
            '[WA] Gerçek logout (401). Otomatik reconnect yapılmayacak.'
          );
          whatsappState.jid = null;
          whatsappState.userName = null;
          return;
        }

        // İlk QR pairing sonrası Baileys genellikle restartRequired (515) ile socket restart ister.
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(
            '[WA] Pairing başarılı. 515 restartRequired alındı.'
          );
          scheduleReconnect(500, sessionId);
          return;
        }

        // Diğer geçici bağlantı kapanmalarında da auth'u SİLMEDEN reconnect.
        scheduleReconnect(1500, sessionId);
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
          console.log(`📩 [${senderName} (${remoteJid})]: "${userText}"`);

          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (presenceErr) {}

          const aiResponse = await generateReply(remoteJid, userText);

          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          await sock.sendMessage(remoteJid, { text: aiResponse });

          session.stats.messagesSent += 1;
          console.log(`🤖 [Yanıt -> ${senderName}]: "${aiResponse.substring(0, 80)}..."`);
        } catch (msgErr) {
          session.stats.errors += 1;
          console.error(`[Mesaj Hatası]: ${msgErr.message}`);
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
    console.error(`[WA] Başlatma hatası: ${initErr.message}`);

    scheduleReconnect(3000, sessionId);
  }
}

/**
 * Logout & reset
 */
async function logoutWhatsApp(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);
  console.log('[WA] Oturum kapatma talebi alındı.');

  if (session.socket) {
    try {
      await session.socket.logout();
    } catch (e) {}
    cleanupSocket(session);
  }

  currentQr = null;
  qrUpdatedAt = null;

  whatsappState.status = 'disconnected';
  whatsappState.jid = null;
  whatsappState.userName = null;
  whatsappState.connectedAt = null;
  whatsappState.updatedAt = Date.now();

  session.status = 'disconnected';
  session.isInitializing = false;

  try {
    if (fs.existsSync(session.authDir)) {
      fs.rmSync(session.authDir, { recursive: true, force: true });
      console.log('[Auth] Oturum auth klasörü temizlendi.');
    }
    for (const backupDir of BACKUP_DIRS) {
      if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.error('[Auth] Temizleme hatası:', err.message);
  }

  scheduleReconnect(1000, sessionId);
  return { success: true, message: 'Oturum kapatıldı, yeni QR bekleniyor.' };
}

/**
 * Disconnect socket gracefully
 */
async function disconnectWhatsApp(sessionId = 'default') {
  const session = getOrCreateSession(sessionId);
  cleanupSocket(session);
  currentQr = null;
  whatsappState.status = 'disconnected';
  whatsappState.updatedAt = Date.now();
  session.status = 'disconnected';
  console.log('[WA] WhatsApp soketi güvenli kapatıldı.');
}

module.exports = {
  startWhatsApp,
  logoutWhatsApp,
  disconnectWhatsApp,
  getCurrentQr: () => currentQr,
  getQrUpdatedAt: () => qrUpdatedAt,
  whatsappState,
  AUTH_DIR: BASE_AUTH_DIR
};

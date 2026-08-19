/**
 * Multi-Client WhatsApp Connection Manager using @whiskeysockets/baileys
 * Ultra-lightweight 24/7 backend - Scoped by Client ID (Max 5 Clients)
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
const clientManager = require('./client-manager');

/**
 * Get Public Base URL (fallback to localhost:PORT)
 */
function getPublicBaseUrl() {
  const port = process.env.PORT || 3000;
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
}

/**
 * Determine the runtime auth directory base
 */
function resolveRuntimeAuthBase() {
  if (process.env.AUTH_DIR && process.env.AUTH_DIR.trim()) {
    return path.resolve(process.env.AUTH_DIR.trim());
  }
  return path.resolve(__dirname, 'auth');
}

/**
 * Determine persistent backup directory base
 */
function resolvePersistentAuthBase() {
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
  return null;
}

const RUNTIME_AUTH_BASE = resolveRuntimeAuthBase();
const PERSISTENT_AUTH_BASE = resolvePersistentAuthBase();

/**
 * Get runtime auth directory for a specific client
 */
function getRuntimeAuthDir(clientId) {
  const dir = path.join(RUNTIME_AUTH_BASE, clientId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get persistent backup auth directory for a specific client
 */
function getPersistentAuthDir(clientId) {
  if (!PERSISTENT_AUTH_BASE) return null;
  const dir = path.join(PERSISTENT_AUTH_BASE, clientId);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
  return dir;
}

/**
 * Seamless Migration for pre-existing single-client auth to client-001
 */
function checkAndMigrateLegacySession() {
  try {
    const client001Runtime = path.join(RUNTIME_AUTH_BASE, 'client-001');
    const client001Persistent = PERSISTENT_AUTH_BASE ? path.join(PERSISTENT_AUTH_BASE, 'client-001') : null;

    // If client-001 doesn't have credentials yet, check if legacy root auth has them
    const hasClient001Creds = (fs.existsSync(path.join(client001Runtime, 'creds.json'))) ||
      (client001Persistent && fs.existsSync(path.join(client001Persistent, 'creds.json')));

    if (!hasClient001Creds) {
      // Check if root RUNTIME_AUTH_BASE or PERSISTENT_AUTH_BASE has creds.json
      const rootCandidates = [PERSISTENT_AUTH_BASE, RUNTIME_AUTH_BASE].filter(Boolean);
      for (const rootDir of rootCandidates) {
        const rootCreds = path.join(rootDir, 'creds.json');
        if (fs.existsSync(rootCreds)) {
          console.log(`[Migration] Eski tekil oturum bulundu (${rootDir}), client-001 dizinine taşınıyor...`);
          
          if (!fs.existsSync(client001Runtime)) {
            fs.mkdirSync(client001Runtime, { recursive: true });
          }
          if (client001Persistent && !fs.existsSync(client001Persistent)) {
            fs.mkdirSync(client001Persistent, { recursive: true });
          }

          const files = fs.readdirSync(rootDir);
          for (const file of files) {
            const srcFile = path.join(rootDir, file);
            if (fs.statSync(srcFile).isFile()) {
              try {
                fs.copyFileSync(srcFile, path.join(client001Runtime, file));
                if (client001Persistent) {
                  fs.copyFileSync(srcFile, path.join(client001Persistent, file));
                }
              } catch (copyErr) {}
            }
          }
          console.log('[Migration] client-001 oturum migrasyonu tamamlandı.');
          break;
        }
      }
    }
  } catch (err) {
    console.error('[Migration] Migrasyon kontrolü sırasında hata:', err.message);
  }
}

/**
 * Restore credentials for a specific client from persistent storage
 */
function restoreAuth(clientId) {
  try {
    const runtimeDir = getRuntimeAuthDir(clientId);
    const runtimeCreds = path.join(runtimeDir, 'creds.json');
    if (fs.existsSync(runtimeCreds)) {
      return true; // Already populated
    }

    const persistentDir = getPersistentAuthDir(clientId);
    if (persistentDir && fs.existsSync(path.join(persistentDir, 'creds.json'))) {
      console.log(`[${clientId}][AUTH] Kalıcı depodan (${persistentDir}) oturum dosyaları geri yükleniyor...`);
      const files = fs.readdirSync(persistentDir);
      for (const file of files) {
        try {
          fs.copyFileSync(path.join(persistentDir, file), path.join(runtimeDir, file));
        } catch (e) {}
      }
      return true;
    }
  } catch (err) {
    console.error(`[${clientId}][AUTH] Geri yükleme hatası:`, err.message);
  }
  return false;
}

/**
 * Backup credentials for a specific client to persistent storage
 */
function backupAuth(clientId) {
  try {
    const runtimeDir = getRuntimeAuthDir(clientId);
    const persistentDir = getPersistentAuthDir(clientId);
    if (!persistentDir || !fs.existsSync(runtimeDir)) return;

    const runtimeCreds = path.join(runtimeDir, 'creds.json');
    if (!fs.existsSync(runtimeCreds)) return;

    const files = fs.readdirSync(runtimeDir);
    for (const file of files) {
      try {
        fs.copyFileSync(path.join(runtimeDir, file), path.join(persistentDir, file));
      } catch (e) {}
    }
  } catch (err) {
    // Non-critical background sync
  }
}

/**
 * Cleanly destroy previous socket and listeners for a client
 */
function cleanupClientSocket(client) {
  if (client.socket) {
    try {
      client.socket.ev.removeAllListeners();
    } catch (e) {}
    try {
      client.socket.end(undefined);
    } catch (e) {}
    client.socket = null;
  }
}

/**
 * Schedule reconnect for a specific client
 */
function scheduleClientReconnect(clientId, delay = 1000) {
  const client = clientManager.getClient(clientId);
  if (!client || client.reconnectScheduled) return;

  client.reconnectScheduled = true;

  setTimeout(async () => {
    client.reconnectScheduled = false;
    console.log(`[${clientId}][WA] Kaydedilmiş auth ile socket yeniden başlatılıyor...`);
    await startWhatsAppClient(clientId, true);
  }, delay);
}

/**
 * Start Baileys WhatsApp Socket for a specific Client
 * @param {string} clientId Client identifier (e.g. client-001)
 * @param {boolean} isReconnect Flag for reconnect attempt
 */
async function startWhatsAppClient(clientId, isReconnect = false) {
  const client = clientManager.getClient(clientId);
  if (!client) {
    console.error(`[WhatsApp] Client bulunamadı: ${clientId}`);
    return null;
  }

  if (client.status === 'connected' && client.socket && !isReconnect) {
    console.log(`[${clientId}][WA] WhatsApp zaten bağlı ve aktif.`);
    return client.socket;
  }

  cleanupClientSocket(client);

  try {
    // 1. Restore auth state
    restoreAuth(clientId);
    const clientAuthDir = getRuntimeAuthDir(clientId);

    client.status = 'connecting';
    client.updatedAt = Date.now();

    // 2. Load multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(clientAuthDir);
    console.log(`[${clientId}][AUTH] Registered:`, Boolean(state?.creds?.registered));

    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307]
    }));

    // 3. Create Baileys Socket for this client
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

    client.socket = sock;

    // 4. Credential persistence handler
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        console.log(`[${clientId}][AUTH] Credentials kaydedildi.`);
        backupAuth(clientId);
      } catch (err) {
        console.error(`[${clientId}][AUTH] saveCreds hatası:`, err.message);
      }
    });

    // 5. Connection state update handler
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update;

      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.statusCode ||
        null;

      console.log(`[${clientId}][WA EVENT]`, {
        connection,
        hasQr: !!qr,
        isNewLogin: !!isNewLogin,
        statusCode
      });

      if (qr) {
        client.currentQr = qr;
        client.qrUpdatedAt = Date.now();
        client.status = 'waiting_qr';
        client.updatedAt = Date.now();

        console.log('');
        console.log('==========================================');
        console.log(`📱 [${clientId}] ${client.config.businessName || 'WhatsApp'} BAĞLANTISI BEKLENİYOR`);
        console.log('Connect URL:');
        console.log(`${getPublicBaseUrl()}/connect/${clientId}`);
        console.log('==========================================');
        console.log('');
      }

      if (isNewLogin) {
        console.log(`[${clientId}][AUTH] QR kabul edildi. İlk login tamamlandı; socket restart bekleniyor.`);
      }

      if (connection === 'open') {
        client.reconnectScheduled = false;
        client.currentQr = null;

        const user = sock.user;
        client.status = 'connected';
        client.jid = user?.id || 'unknown';
        client.userName = user?.name || client.config.businessName || 'WhatsApp Hesabı';
        client.connectedAt = Date.now();
        client.updatedAt = Date.now();
        client.reconnectAttempts = 0;

        console.log('');
        console.log('==========================================');
        console.log(`✅ [${clientId}] WHATSAPP BAŞARIYLA BAĞLANDI`);
        console.log('İşletme:', client.config.businessName);
        console.log('JID:', user?.id || 'unknown');
        console.log('==========================================');
        console.log('');

        // Backup newly established credentials
        try {
          await saveCreds();
          backupAuth(clientId);
        } catch (e) {}
        return;
      }

      if (connection === 'close') {
        client.currentQr = null;
        client.status = 'disconnected';
        client.connectedAt = null;
        client.updatedAt = Date.now();

        console.log(`[${clientId}][WA CLOSE] statusCode:`, statusCode);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`[${clientId}][WA] Gerçek logout (401). Otomatik reconnect yapılmayacak.`);
          client.jid = null;
          client.userName = null;
          return;
        }

        // İlk QR pairing sonrası Baileys restartRequired (515) ile socket restart ister.
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`[${clientId}][WA] Pairing başarılı. 515 restartRequired alındı.`);
          scheduleClientReconnect(clientId, 500);
          return;
        }

        // Diğer geçici bağlantı kapanmalarında da auth'u SİLMEDEN reconnect.
        scheduleClientReconnect(clientId, 1500);
      } else if (connection === 'connecting') {
        client.status = 'connecting';
        client.updatedAt = Date.now();
      }
    });

    // 6. Incoming Messages Handler (Isolated per client)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !Array.isArray(messages)) return;

      for (const msg of messages) {
        try {
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('@broadcast')) {
            continue;
          }

          const m = msg.message;
          const userText = m?.conversation ||
            m?.extendedTextMessage?.text ||
            m?.imageMessage?.caption ||
            m?.videoMessage?.caption || null;

          if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
            continue;
          }

          client.stats.messagesReceived += 1;
          client.stats.lastActivity = new Date().toISOString();

          const senderName = msg.pushName || remoteJid.split('@')[0];
          console.log(`[${clientId}] 📩 [${senderName} (${remoteJid})]: "${userText}"`);

          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (e) {}

          // Generate reply strictly isolated to this client's config
          const aiResponse = await generateReply(client.config, remoteJid, userText);

          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          await sock.sendMessage(remoteJid, { text: aiResponse });

          client.stats.messagesSent += 1;
          console.log(`[${clientId}] 🤖 [Yanıt -> ${senderName}]: "${aiResponse.substring(0, 80)}..."`);
        } catch (msgErr) {
          client.stats.errors += 1;
          console.error(`[${clientId}][Mesaj Hatası]:`, msgErr.message);
        }
      }
    });

    return sock;
  } catch (initErr) {
    client.status = 'disconnected';
    client.updatedAt = Date.now();
    client.stats.errors += 1;
    console.error(`[${clientId}][WA] Başlatma hatası:`, initErr.message);
    scheduleClientReconnect(clientId, 3000);
  }
}

/**
 * Start all enabled clients on server boot
 */
async function startAllEnabledClients() {
  checkAndMigrateLegacySession();
  clientManager.initializeClients();

  const enabledClients = clientManager.getEnabledClients();
  console.log(`[WhatsApp] ${enabledClients.length} adet aktif müşteri başlatılıyor (Maksimum limit: ${clientManager.MAX_CLIENTS})...`);

  for (const clientConfig of enabledClients) {
    try {
      console.log(`[WhatsApp] '${clientConfig.id}' (${clientConfig.businessName}) başlatılıyor...`);
      await startWhatsAppClient(clientConfig.id);
    } catch (err) {
      console.error(`[WhatsApp] '${clientConfig.id}' başlatılamadı:`, err.message);
    }
  }
}

/**
 * Logout specific client
 */
async function logoutWhatsAppClient(clientId) {
  const client = clientManager.getClient(clientId);
  if (!client) return { success: false, message: 'Client bulunamadı' };

  console.log(`[${clientId}][WA] Oturum kapatma talebi alındı.`);

  if (client.socket) {
    try {
      await client.socket.logout();
    } catch (e) {}
    cleanupClientSocket(client);
  }

  client.currentQr = null;
  client.qrUpdatedAt = null;
  client.status = 'disconnected';
  client.jid = null;
  client.userName = null;
  client.connectedAt = null;
  client.updatedAt = Date.now();

  try {
    const runtimeDir = getRuntimeAuthDir(clientId);
    const persistentDir = getPersistentAuthDir(clientId);

    if (fs.existsSync(runtimeDir)) {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
    if (persistentDir && fs.existsSync(persistentDir)) {
      fs.rmSync(persistentDir, { recursive: true, force: true });
    }
    console.log(`[${clientId}][AUTH] Auth klasörleri temizlendi.`);
  } catch (err) {
    console.error(`[${clientId}][AUTH] Temizleme hatası:`, err.message);
  }

  scheduleClientReconnect(clientId, 1000);
  return { success: true, message: 'Oturum kapatıldı, yeni QR bekleniyor.' };
}

/**
 * Gracefully disconnect all clients on process termination
 */
async function disconnectAllClients() {
  const all = clientManager.getAllClients();
  for (const client of all) {
    cleanupClientSocket(client);
    client.status = 'disconnected';
    client.updatedAt = Date.now();
  }
  console.log('[WhatsApp] Tüm aktif müşteri soketleri güvenle kapatıldı.');
}

module.exports = {
  getPublicBaseUrl,
  startAllEnabledClients,
  startWhatsAppClient,
  logoutWhatsAppClient,
  disconnectAllClients,
  getRuntimeAuthDir,
  getPersistentAuthDir,
  // Backward compatibility helpers for client-001
  startWhatsApp: (sessionId = 'client-001') => startWhatsAppClient(sessionId === 'default' ? 'client-001' : sessionId),
  getCurrentQr: (clientId = 'client-001') => clientManager.getClient(clientId)?.currentQr || null,
  getQrUpdatedAt: (clientId = 'client-001') => clientManager.getClient(clientId)?.qrUpdatedAt || null,
  whatsappState: new Proxy({}, {
    get: (target, prop) => {
      const c = clientManager.getClient('client-001');
      return c ? c[prop] : null;
    }
  }),
  AUTH_DIR: RUNTIME_AUTH_BASE
};

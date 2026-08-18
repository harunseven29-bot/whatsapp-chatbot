/**
 * WhatsApp Gemini Bot - Ultra-Lightweight Server & Web UI
 * Configured for Single Authoritative Baileys Backend (DockHosting)
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const { getBusinessData } = require('./business');
const { getMemoryStats } = require('./assistant');

// DockHosting authoritative backend URL
const DOCKHOSTING_BACKEND_URL = process.env.DOCKHOSTING_BACKEND_URL || 'https://whatsapp-chatbot.dockhosting.dev';

// Flag to only run Baileys if explicitly in local/standalone backend mode
const RUN_LOCAL_BAILEYS = process.env.RUN_LOCAL_BAILEYS === 'true';

let whatsappModule = null;
if (RUN_LOCAL_BAILEYS) {
  whatsappModule = require('./whatsapp');
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp Gemini Bot - Web UI & Backend Proxy');
  console.log(`🌐 Target Backend: ${DOCKHOSTING_BACKEND_URL}`);
  console.log(`⚡ Local Baileys Socket: ${RUN_LOCAL_BAILEYS ? 'ENABLED' : 'DISABLED (UI/Proxy Mode)'}`);
  console.log('======================================================');

  const business = getBusinessData();
  const app = express();
  app.use(express.json());

  // CORS middleware for all endpoints
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Web Onboarding UI route: GET /connect
  app.get('/connect', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(__dirname, 'connect.html'));
  });

  // Root endpoint: Serves onboarding UI for browsers or JSON for API calls
  app.get('/', (req, res) => {
    const acceptsHtml = req.accepts(['html', 'json']) === 'html';
    if (acceptsHtml) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.sendFile(path.join(__dirname, 'connect.html'));
    }

    res.status(200).json({
      status: 'ok',
      service: 'WhatsApp Gemini Bot',
      backend: DOCKHOSTING_BACKEND_URL,
      connectUrl: '/connect'
    });
  });

  // Realtime Status API for Web UI: GET /api/whatsapp/status
  app.get('/api/whatsapp/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (RUN_LOCAL_BAILEYS && whatsappModule) {
      const sessionId = req.query.sessionId || 'default';
      const wa = whatsappModule.getWhatsAppStatus(sessionId);

      const currentQr = wa.qrRaw || wa.qr;
      console.log("[DEBUG] LOCAL_WEB_QR_SENT", {
        length: currentQr?.length,
        prefix: currentQr?.slice(0, 12),
        updatedAt: wa.qrUpdatedAt
      });

      return res.status(200).json({
        sessionId: wa.sessionId,
        status: wa.status,
        qr: wa.qr,
        qrRaw: wa.qrRaw,
        updatedAt: wa.qrUpdatedAt || new Date().toISOString(),
        userName: wa.userName,
        userJid: wa.userJid,
        connectedAt: wa.connectedAt,
        pairingCode: wa.pairingCode
      });
    }

    // Proxy directly to DockHosting backend
    try {
      const response = await fetch(`${DOCKHOSTING_BACKEND_URL}/api/whatsapp/status?${new URLSearchParams(req.query)}`, {
        headers: { 'Cache-Control': 'no-cache' }
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(502).json({
        status: 'disconnected',
        error: `DockHosting backend bağlantı hatası: ${err.message}`,
        backend: DOCKHOSTING_BACKEND_URL
      });
    }
  });

  // Logout API: POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async (req, res) => {
    if (RUN_LOCAL_BAILEYS && whatsappModule) {
      const sessionId = req.body?.sessionId || 'default';
      try {
        const result = await whatsappModule.logoutWhatsApp(sessionId);
        return res.status(200).json(result);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Proxy logout to DockHosting backend
    try {
      const response = await fetch(`${DOCKHOSTING_BACKEND_URL}/api/whatsapp/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: `DockHosting logout hatası: ${err.message}` });
    }
  });

  // Health check endpoint (for DockHosting / Wispbyte / Uptime monitors): GET /health
  app.get('/health', async (req, res) => {
    if (RUN_LOCAL_BAILEYS && whatsappModule) {
      const wa = whatsappModule.getWhatsAppStatus('default');
      return res.status(200).json({
        status: 'healthy',
        whatsapp: wa.status === 'connected' ? 'connected' : wa.status,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      status: 'healthy',
      role: 'web_ui_proxy',
      backend: DOCKHOSTING_BACKEND_URL,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // Status overview: GET /status
  app.get('/status', (req, res) => {
    const memory = getMemoryStats();
    res.status(200).json({
      status: 'ok',
      mode: RUN_LOCAL_BAILEYS ? 'standalone_backend' : 'ui_proxy',
      backend: DOCKHOSTING_BACKEND_URL,
      memory,
      business: business.businessName,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // Start HTTP listener
  const httpServer = app.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ HTTP sunucu başlatılamadı:', err.message);
      process.exit(1);
    }

    console.log(`[HTTP] Sunucu aktif: http://localhost:${PORT}`);
    console.log(`[HTTP] Web Bağlantı Arayüzü: http://localhost:${PORT}/connect`);

    // Only start Baileys if explicitly running in standalone backend mode
    if (RUN_LOCAL_BAILEYS && whatsappModule) {
      try {
        console.log('[WhatsApp] Yerel Baileys soketi başlatılıyor...');
        await whatsappModule.startWhatsApp('default');
      } catch (waErr) {
        console.error('❌ WhatsApp başlatma hatası:', waErr.message);
      }
    } else {
      console.log('[Architecture] Antigravity UI aktif. WhatsApp soketi tek authoritative kaynak olan DockHosting üzerinden yönetiliyor.');
    }
  });

  // Graceful shutdown handler
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] ${signal} sinyali alındı.`);
    if (RUN_LOCAL_BAILEYS && whatsappModule) {
      try {
        await whatsappModule.disconnectWhatsApp('default');
      } catch (e) {}
    }
    httpServer.close(() => {
      console.log('[Shutdown] HTTP sunucu kapatıldı.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('❌ Sunucu bootstrap hatası:', err);
  process.exit(1);
});

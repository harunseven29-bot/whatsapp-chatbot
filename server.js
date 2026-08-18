/**
 * WhatsApp Gemini Bot - Ultra-Lightweight Production Server
 * Instant Authoritative Memory State & QR Fingerprint Verification
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  startWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  whatsappState,
  AUTH_DIR
} = require('./whatsapp');
const { getBusinessData } = require('./business');
const { getMemoryStats } = require('./assistant');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp Gemini Bot - Production Server & Web UI');
  console.log(`📁 Auth Klasörü: ${AUTH_DIR}`);
  console.log(`🌐 Port: ${PORT}`);
  console.log('======================================================');

  const business = getBusinessData();
  const app = express();
  app.use(express.json());

  // CORS middleware
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 1. Authoritative Realtime Status API: GET /api/whatsapp/status
  // Synchronous non-blocking response with QR fingerprint
  app.get('/api/whatsapp/status', (req, res) => {
    console.log('[STATUS API]', {
      qrId: whatsappState.qrId,
      status: whatsappState.status
    });

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      status: whatsappState.status,
      qr: whatsappState.qr,
      qrId: whatsappState.qrId,
      jid: whatsappState.jid,
      userName: whatsappState.userName,
      connectedAt: whatsappState.connectedAt,
      updatedAt: whatsappState.updatedAt
    });
  });

  // 2. WhatsApp Logout API: POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async (req, res) => {
    const sessionId = req.body?.sessionId || 'default';
    try {
      const result = await logoutWhatsApp(sessionId);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Web Onboarding UI route: GET /connect
  app.get('/connect', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'connect.html'));
  });

  // 4. Root endpoint: Serves onboarding UI for browsers or JSON for API calls
  app.get('/', (req, res) => {
    const acceptsHtml = req.accepts(['html', 'json']) === 'html';
    if (acceptsHtml) {
      res.set('Cache-Control', 'no-store');
      return res.sendFile(path.join(__dirname, 'connect.html'));
    }

    res.status(200).json({
      status: 'ok',
      service: 'WhatsApp Gemini Bot',
      connectUrl: '/connect'
    });
  });

  // 5. Health check endpoint (for DockHosting / Uptime monitors): GET /health
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      whatsapp: whatsappState.status === 'connected' ? 'connected' : (whatsappState.status === 'waiting_qr' ? 'waiting_qr_scan' : whatsappState.status),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 6. Full System Overview: GET /status
  app.get('/status', (req, res) => {
    const memory = getMemoryStats();
    res.status(200).json({
      status: 'ok',
      whatsapp: whatsappState.status,
      qrId: whatsappState.qrId,
      user: whatsappState.userName || whatsappState.jid,
      memory,
      business: business.businessName,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 7. Start HTTP Listener & SINGLE Baileys Background Socket
  const httpServer = app.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ HTTP sunucu başlatılamadı:', err.message);
      process.exit(1);
    }

    console.log(`[HTTP] Sunucu aktif: http://localhost:${PORT}`);
    console.log(`[HTTP] Web Bağlantı Arayüzü: http://localhost:${PORT}/connect`);
    console.log(`[HTTP] Health Check: http://localhost:${PORT}/health`);
    console.log(`[HTTP] Status API: http://localhost:${PORT}/api/whatsapp/status`);

    // Start single Baileys instance in background
    try {
      console.log('[WhatsApp] Tekil Baileys soketi başlatılıyor...');
      await startWhatsApp('default');
    } catch (waErr) {
      console.error('❌ WhatsApp başlatma hatası:', waErr.message);
    }
  });

  // Graceful shutdown handler
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] ${signal} sinyali alındı.`);
    try {
      await disconnectWhatsApp('default');
    } catch (e) {}
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

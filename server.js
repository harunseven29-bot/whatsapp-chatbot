/**
 * WhatsApp Gemini Bot - Ultra-Lightweight Production Server
 * Pure Backend PNG QR & Web QR Page Pipeline
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const {
  startWhatsApp,
  disconnectWhatsApp,
  logoutWhatsApp,
  getCurrentQr,
  getQrUpdatedAt,
  whatsappState,
  AUTH_DIR
} = require('./whatsapp');
const { getBusinessData } = require('./business');
const { getMemoryStats } = require('./assistant');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp Gemini Bot - Production Server');
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
  app.get('/api/whatsapp/status', (req, res) => {
    const currentQr = getCurrentQr();
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      status: whatsappState.status,
      hasQr: !!currentQr,
      jid: whatsappState.jid,
      userName: whatsappState.userName,
      connectedAt: whatsappState.connectedAt,
      updatedAt: whatsappState.updatedAt
    });
  });

  // 2. Authoritative PNG QR Generator: GET /api/whatsapp/qr.png
  app.get('/api/whatsapp/qr.png', async (req, res) => {
    const currentQr = getCurrentQr();

    if (!currentQr) {
      return res.status(404).send('Aktif QR bekleniyor.');
    }

    try {
      const png = await QRCode.toBuffer(currentQr, {
        type: 'png',
        width: 700,
        margin: 5,
        errorCorrectionLevel: 'M'
      });

      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      return res.send(png);

    } catch (err) {
      console.error('[QR PNG ERROR]', err);
      return res.status(500).send('QR oluşturulamadı.');
    }
  });

  // 3. Web QR Page: GET /qr & GET /connect
  app.get(['/qr', '/connect'], (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'qr.html'));
  });

  // 4. WhatsApp Logout API: POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async (req, res) => {
    const sessionId = req.body?.sessionId || 'default';
    try {
      const result = await logoutWhatsApp(sessionId);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Temporary Debug Auth Reset API: POST /api/debug/reset-auth
  app.post('/api/debug/reset-auth', async (req, res) => {
    try {
      await disconnectWhatsApp('default');

      fs.rmSync(AUTH_DIR, {
        recursive: true,
        force: true
      });

      fs.mkdirSync(AUTH_DIR, {
        recursive: true
      });

      console.log('[DEBUG] Auth sıfırlandı:', AUTH_DIR);

      return res.status(200).json({
        success: true,
        authDir: AUTH_DIR
      });
    } catch (err) {
      console.error('[DEBUG] Auth sıfırlama hatası:', err.message);
      return res.status(500).json({
        success: false,
        error: err.message,
        authDir: AUTH_DIR
      });
    }
  });

  // 6. Root endpoint
  app.get('/', (req, res) => {
    const acceptsHtml = req.accepts(['html', 'json']) === 'html';
    if (acceptsHtml) {
      res.set('Cache-Control', 'no-store');
      return res.sendFile(path.join(__dirname, 'qr.html'));
    }

    res.status(200).json({
      status: 'ok',
      service: 'WhatsApp Gemini Bot',
      qrUrl: '/qr',
      qrPngUrl: '/api/whatsapp/qr.png'
    });
  });

  // 7. Health check endpoint: GET /health
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      whatsapp: whatsappState.status === 'connected' ? 'connected' : whatsappState.status,
      hasQr: !!getCurrentQr(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 8. Full System Overview: GET /status
  app.get('/status', (req, res) => {
    const memory = getMemoryStats();
    res.status(200).json({
      status: 'ok',
      whatsapp: whatsappState.status,
      hasQr: !!getCurrentQr(),
      user: whatsappState.userName || whatsappState.jid,
      memory,
      business: business.businessName,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 9. Start HTTP Listener & SINGLE Baileys Background Socket
  const httpServer = app.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ HTTP sunucu başlatılamadı:', err.message);
      process.exit(1);
    }

    console.log(`[HTTP] Sunucu aktif: http://localhost:${PORT}`);
    console.log(`[HTTP] QR Sayfası: http://localhost:${PORT}/qr`);
    console.log(`[HTTP] Doğrudan PNG QR: http://localhost:${PORT}/api/whatsapp/qr.png`);
    console.log(`[HTTP] Health Check: http://localhost:${PORT}/health`);

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

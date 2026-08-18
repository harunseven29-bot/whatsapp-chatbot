/**
 * WhatsApp Gemini Bot - Ultra-Lightweight Production Server
 * Designed for 24/7 low-resource execution (Wispbyte Free / Northflank / VPS)
 * Features a modern, minimal Vanilla HTML/CSS/JS onboarding UI at /connect
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const {
  startWhatsApp,
  disconnectWhatsApp,
  getWhatsAppStatus,
  logoutWhatsApp,
  AUTH_DIR
} = require('./whatsapp');
const { getBusinessData } = require('./business');
const { getMemoryStats } = require('./assistant');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp Gemini Bot - Ultra-Light Backend & Web UI');
  console.log('======================================================');

  // 1. Environment & Config Verification
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  UYARI: GEMINI_API_KEY tanımlanmadı!');
    console.warn('   Yapay zeka yanıtları için lütfen .env dosyasına GEMINI_API_KEY ekleyin.');
  } else {
    console.log('🔑 Gemini API Key: Yüklendi.');
  }

  console.log(`📁 Auth Klasörü (AUTH_DIR): ${AUTH_DIR}`);
  console.log(`🌐 Port: ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'production'})`);

  const business = getBusinessData();
  console.log(`🏢 İşletme: ${business.businessName}`);
  console.log(`💼 Tanımlı Hizmet Sayısı: ${business.services?.length || 0}`);

  // 2. Express Server Setup
  const app = express();
  app.use(express.json());

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
      connectUrl: '/connect'
    });
  });

  // Dedicated WhatsApp Realtime Status API for Web UI: GET /api/whatsapp/status
  app.get('/api/whatsapp/status', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const sessionId = req.query.sessionId || 'default';
    const wa = getWhatsAppStatus(sessionId);

    const currentQr = wa.qrRaw || wa.qr;
    const qrUpdatedAt = wa.qrUpdatedAt;

    console.log("[DEBUG] WEB_QR_SENT", {
      length: currentQr?.length,
      prefix: currentQr?.slice(0, 12),
      updatedAt: qrUpdatedAt
    });

    res.status(200).json({
      sessionId: wa.sessionId,
      status: wa.status, // 'waiting_qr' | 'connecting' | 'connected' | 'disconnected'
      qr: wa.qr, // DataURL or null when connected
      qrRaw: wa.qrRaw,
      updatedAt: wa.qrUpdatedAt || new Date().toISOString(),
      userName: wa.userName,
      userJid: wa.userJid,
      connectedAt: wa.connectedAt,
      pairingCode: wa.pairingCode
    });
  });

  // WhatsApp Logout & Reset API: POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async (req, res) => {
    const sessionId = req.body?.sessionId || 'default';
    try {
      const result = await logoutWhatsApp(sessionId);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Health check endpoint (for Wispbyte / Uptime monitors): GET /health
  app.get('/health', (req, res) => {
    const wa = getWhatsAppStatus('default');
    res.status(200).json({
      status: 'healthy',
      whatsapp: wa.status === 'connected' ? 'connected' : (wa.status === 'waiting_qr' ? 'waiting_qr_scan' : wa.status),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // Full System & Business Status endpoint: GET /status
  app.get('/status', (req, res) => {
    const wa = getWhatsAppStatus('default');
    const memory = getMemoryStats();
    res.status(200).json({
      status: 'ok',
      whatsapp: wa.status,
      user: wa.userName || wa.userJid,
      stats: wa.stats,
      memory,
      business: business.businessName,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 3. Start HTTP Listener & Baileys Socket
  const httpServer = app.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ HTTP sunucu başlatılamadı:', err.message);
      process.exit(1);
    }

    console.log(`[HTTP] Sunucu aktif: http://localhost:${PORT}`);
    console.log(`[HTTP] Web Bağlantı Arayüzü: http://localhost:${PORT}/connect`);
    console.log(`[HTTP] Health Check: http://localhost:${PORT}/health`);

    // 4. Start Baileys WhatsApp Socket (Single instance)
    try {
      console.log('[WhatsApp] Baileys soket bağlantısı başlatılıyor...');
      await startWhatsApp('default');
    } catch (waErr) {
      console.error('❌ WhatsApp başlatma hatası:', waErr.message);
    }

    console.log('======================================================');
    console.log('✨ Sistem hazır ve 7/24 çalışıyor.');
    console.log('======================================================\n');
  });

  // Graceful Shutdown Handler
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] ${signal} sinyali alındı. Güvenli kapatılıyor...`);
    try {
      await disconnectWhatsApp('default');
    } catch (e) {
      console.error('[Shutdown] WhatsApp kapatma hatası:', e.message);
    }
    httpServer.close(() => {
      console.log('[Shutdown] HTTP sunucu kapatıldı.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Sunucu bootstrap hatası:', err);
  process.exit(1);
});

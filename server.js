/**
 * WhatsApp Gemini Bot - Ultra-Lightweight Production Server
 * Designed for 24/7 low-resource execution (Wispbyte Free / Northflank / VPS)
 */

require('dotenv').config();

const express = require('express');
const { startWhatsApp, disconnectWhatsApp, getWhatsAppStatus, AUTH_DIR } = require('./whatsapp');
const { getBusinessData } = require('./business');
const { getMemoryStats } = require('./assistant');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp Gemini Bot - Ultra-Light Backend');
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

  // Root endpoint
  app.get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'WhatsApp Gemini Bot'
    });
  });

  // Health check endpoint (for Wispbyte / uptime monitors)
  app.get('/health', (req, res) => {
    const wa = getWhatsAppStatus();
    res.status(200).json({
      status: 'healthy',
      whatsapp: wa.status === 'connected' ? 'connected' : (wa.status === 'qr_ready' ? 'waiting_qr_scan' : 'disconnected'),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // Optional status overview endpoint
  app.get('/status', (req, res) => {
    const wa = getWhatsAppStatus();
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
    console.log(`[HTTP] Health check: http://localhost:${PORT}/health`);

    // 4. Start Baileys WhatsApp Socket (Single instance)
    try {
      console.log('[WhatsApp] Baileys soket bağlantısı başlatılıyor...');
      await startWhatsApp();
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
      await disconnectWhatsApp();
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

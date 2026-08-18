/**
 * WhatsApp AI Chatbot - Unified Production Server
 * Combines Next.js App Router UI and Baileys WhatsApp Socket on a single PORT.
 * Optimized for 24/7 Deployment on Northflank.
 */

require('dotenv').config();

const express = require('express');
const next = require('next');
const path = require('path');
const fs = require('fs');
const { startWhatsApp, disconnectWhatsApp, getWhatsAppStatus, AUTH_DIR } = require('./whatsapp');
const { getBusinessData } = require('./business');

const hasProductionBuild = fs.existsSync(path.join(__dirname, '.next', 'prerender-manifest.json'));
const dev = process.env.NODE_ENV !== 'production' || !hasProductionBuild;
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = '0.0.0.0';

const app = next({ dev, hostname: HOSTNAME, port: PORT, dir: __dirname });
const handle = app.getRequestHandler();

async function bootstrap() {
  console.log('======================================================');
  console.log('🚀 WhatsApp AI Chatbot Server Başlatılıyor...');
  console.log('======================================================');

  // 1. Environment & Config Verification
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  UYARI: GEMINI_API_KEY environment variable bulunamadı!');
    console.warn('   Yapay zeka yanıtları için lütfen GEMINI_API_KEY değerini tanımlayın.');
  } else {
    console.log('🔑 Gemini API Key: Yüklendi (Güvenli şekilde korundu).');
  }

  console.log(`📁 Auth Klasörü (AUTH_DIR): ${AUTH_DIR}`);
  console.log(`🌐 Port: ${PORT} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);

  const business = getBusinessData();
  console.log(`🏢 İşletme: ${business.businessName}`);
  console.log(`💼 Tanımlı Hizmet Sayısı: ${business.services?.length || 0}`);

  // 2. Prepare Next.js
  console.log('[Next.js] Uygulama hazırlanıyor...');
  await app.prepare();
  console.log('[Next.js] Hazır.');

  const server = express();

  // Fast Northflank Health Check (GET /health -> HTTP 200)
  server.get('/health', (req, res) => {
    const wa = getWhatsAppStatus();
    res.status(200).json({
      status: 'healthy',
      whatsapp: wa.status === 'connected' ? 'connected' : (wa.status === 'qr_ready' ? 'waiting_qr_scan' : 'disconnected'),
      timestamp: new Date().toISOString()
    });
  });

  // All other HTTP requests are handled by Next.js App Router (UI + API routes)
  server.use((req, res) => {
    return handle(req, res);
  });

  // 3. Start Single HTTP Listener
  const httpServer = server.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ Sunucu portu dinleyemedi:', err);
      process.exit(1);
    }

    console.log(`[HTTP Server] Aktif ve dinliyor: http://localhost:${PORT}`);
    console.log(`[HTTP Server] Health check: http://localhost:${PORT}/health`);

    // 4. Start WhatsApp Baileys Socket (Single instance)
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
    console.log(`\n[Shutdown] ${signal} sinyali alındı. Servisler güvenli kapatılıyor...`);
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
  console.error('❌ Sunucu başlatma hatası:', err);
  process.exit(1);
});

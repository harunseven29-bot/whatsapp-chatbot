require('dotenv').config();

/**
 * Express HTTP Server & Multi-Client WhatsApp Bot Host
 * Ultra-lightweight backend (Max 5 Clients)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const {
  startAllEnabledClients,
  startWhatsAppClient,
  logoutWhatsAppClient,
  disconnectAllClients
} = require('./whatsapp');
const clientManager = require('./client-manager');
const { getMemoryStats } = require('./assistant');

const PORT = process.env.PORT || 3000;
const HOSTNAME = '0.0.0.0';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

async function bootstrap() {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // CORS and Cache-Control headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Serve static assets if any
  app.use(express.static(path.join(__dirname, 'public')));

  // 1. Client Connect Page: GET /connect/:clientId
  app.get('/connect/:clientId', (req, res) => {
    const { clientId } = req.params;
    const client = clientManager.getClient(clientId);

    if (!client && !clientManager.loadAllClientConfigs().some(c => c.id === clientId && c.enabled)) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head><title>Müşteri Bulunamadı</title><meta charset="utf-8"></head>
        <body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:24px;background:#1e293b;border-radius:12px;border:1px solid #334155;">
            <h2 style="color:#f43f5e;margin-bottom:8px;">Müşteri Bulunamadı veya Pasif</h2>
            <p style="color:#94a3b8;">'${clientId}' kimlikli aktif bir müşteri yapılandırması mevcut değil.</p>
          </div>
        </body>
        </html>
      `);
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const connectHtmlPath = path.join(__dirname, 'public', 'connect.html');
    if (path.resolve(connectHtmlPath)) {
      return res.sendFile(connectHtmlPath);
    }
    return res.sendFile(path.join(__dirname, 'qr.html'));
  });

  // 2. Legacy /qr Route -> Redirect to client-001 connect page
  app.get(['/qr', '/connect'], (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.redirect('/connect/client-001');
  });

  // 3. Client Specific PNG QR: GET /api/clients/:clientId/qr.png
  app.get('/api/clients/:clientId/qr.png', async (req, res) => {
    const { clientId } = req.params;
    const client = clientManager.getClient(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found or disabled', clientId });
    }

    if (!client.currentQr) {
      return res.status(404).json({
        error: 'QR not ready for this client',
        clientId,
        status: client.status,
        hasQr: false
      });
    }

    try {
      const pngBuffer = await QRCode.toBuffer(client.currentQr, {
        type: 'png',
        width: 700,
        margin: 5,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(200).send(pngBuffer);
    } catch (qrErr) {
      console.error(`[QR Generator][${clientId}] Hata:`, qrErr.message);
      return res.status(500).json({ error: 'Failed to generate QR image', details: qrErr.message });
    }
  });

  // 4. Client Specific Status: GET /api/clients/:clientId/status
  app.get('/api/clients/:clientId/status', (req, res) => {
    const { clientId } = req.params;
    const clientStatus = clientManager.getClientStatus(clientId);

    if (!clientStatus) {
      return res.status(404).json({ error: 'Client not found or disabled', clientId });
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    return res.status(200).json(clientStatus);
  });

  // 5. Client Specific Logout: POST /api/clients/:clientId/logout
  app.post('/api/clients/:clientId/logout', async (req, res) => {
    const { clientId } = req.params;
    try {
      const result = await logoutWhatsAppClient(clientId);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Backward Compatibility for single-client API:
  // GET /api/whatsapp/qr.png
  app.get('/api/whatsapp/qr.png', (req, res) => {
    return res.redirect('/api/clients/client-001/qr.png');
  });

  // GET /api/whatsapp/status
  app.get('/api/whatsapp/status', (req, res) => {
    const status = clientManager.getClientStatus('client-001');
    if (!status) {
      return res.status(404).json({ error: 'client-001 not configured' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).json(status);
  });

  // POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async (req, res) => {
    const result = await logoutWhatsAppClient('client-001');
    return res.status(200).json(result);
  });

  // 7. Root endpoint
  app.get('/', (req, res) => {
    const acceptsHtml = req.accepts(['html', 'json']) === 'html';
    if (acceptsHtml) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      const connectHtmlPath = path.join(__dirname, 'public', 'connect.html');
      if (fs.existsSync(connectHtmlPath)) {
        return res.sendFile(connectHtmlPath);
      }
      return res.redirect('/connect/client-001');
    }

    const enabledClients = clientManager.getEnabledClients();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({
      status: 'ok',
      service: 'Multi-Client WhatsApp Gemini Bot (Max 5 Clients)',
      publicBaseUrl: PUBLIC_BASE_URL,
      activeClients: enabledClients.length,
      maxClients: clientManager.MAX_CLIENTS,
      connectUrls: enabledClients.map(c => `${PUBLIC_BASE_URL}/connect/${c.id}`)
    });
  });

  // 8. Health Check: GET /health
  app.get('/health', (req, res) => {
    const enabledClients = clientManager.getEnabledClients();
    const clientsOverview = enabledClients.map(c => {
      const state = clientManager.getClient(c.id);
      return {
        id: c.id,
        businessName: c.businessName,
        status: state?.status || 'starting',
        hasQr: Boolean(state?.currentQr),
        jid: state?.jid || null
      };
    });

    res.status(200).json({
      status: 'healthy',
      activeClients: enabledClients.length,
      maxClients: clientManager.MAX_CLIENTS,
      clients: clientsOverview,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 9. Full System Overview: GET /status
  app.get('/status', (req, res) => {
    const memory = getMemoryStats();
    const all = clientManager.getAllClients().map(c => clientManager.getClientStatus(c.id));

    res.status(200).json({
      status: 'ok',
      activeClientsCount: all.length,
      maxClients: clientManager.MAX_CLIENTS,
      clients: all,
      memory,
      hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  // 10. Start HTTP Listener & Multi-Client Baileys sockets
  const httpServer = app.listen(PORT, HOSTNAME, async (err) => {
    if (err) {
      console.error('❌ HTTP sunucu başlatılamadı:', err.message);
      process.exit(1);
    }

    console.log(`[HTTP] Sunucu aktif: http://${HOSTNAME}:${PORT}`);
    console.log('[ENV] PUBLIC_BASE_URL:', process.env.PUBLIC_BASE_URL);
    console.log(`[HTTP] Public Base URL: ${PUBLIC_BASE_URL}`);
    console.log(`[HTTP] Health Check: ${PUBLIC_BASE_URL}/health`);
    console.log(`[HTTP] Client-001 Connect URL: ${PUBLIC_BASE_URL}/connect/client-001`);

    // Start all enabled clients in background
    try {
      await startAllEnabledClients();
    } catch (waErr) {
      console.error('❌ WhatsApp multi-client başlatma hatası:', waErr.message);
    }
  });

  // Graceful shutdown handler
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] ${signal} sinyali alındı.`);
    try {
      await disconnectAllClients();
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

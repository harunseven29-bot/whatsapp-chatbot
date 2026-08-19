/**
 * Client Configuration & Multi-Client State Manager
 * Supports up to 5 concurrent business clients
 */

const fs = require('fs');
const path = require('path');

const MAX_CLIENTS = 5;
const CLIENTS_DIR = path.resolve(__dirname, 'clients');

// Map<string, ClientRuntimeState>
const clients = new Map();

/**
 * Load and validate all client configurations from clients/ directory
 * @returns {Array<object>} List of client configs
 */
function loadAllClientConfigs() {
  if (!fs.existsSync(CLIENTS_DIR)) {
    fs.mkdirSync(CLIENTS_DIR, { recursive: true });
  }

  const files = fs.readdirSync(CLIENTS_DIR)
    .filter(file => file.endsWith('.json'))
    .sort();

  const loadedConfigs = [];

  for (const file of files) {
    try {
      const filePath = path.join(CLIENTS_DIR, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(raw);
      if (!config.id) {
        config.id = path.basename(file, '.json');
      }
      loadedConfigs.push(config);
    } catch (err) {
      console.error(`[ClientManager] Config okuma hatası (${file}):`, err.message);
    }
  }

  return loadedConfigs;
}

/**
 * Get all enabled client configs with maximum active check
 */
function getEnabledClients() {
  const all = loadAllClientConfigs();
  const enabled = all.filter(c => c.enabled === true);

  if (enabled.length > MAX_CLIENTS) {
    throw new Error(`Maximum active client limit exceeded: 5 (Found: ${enabled.length})`);
  }

  return enabled;
}

/**
 * Initialize runtime states for enabled clients
 */
function initializeClients() {
  const enabledConfigs = getEnabledClients();

  for (const config of enabledConfigs) {
    if (!clients.has(config.id)) {
      clients.set(config.id, {
        id: config.id,
        config: config,
        socket: null,
        status: 'starting', // 'starting' | 'connecting' | 'waiting_qr' | 'connected' | 'disconnected'
        currentQr: null,
        qrUpdatedAt: null,
        jid: null,
        userName: null,
        connectedAt: null,
        updatedAt: Date.now(),
        reconnectScheduled: false,
        stats: {
          messagesReceived: 0,
          messagesSent: 0,
          errors: 0,
          lastActivity: null
        }
      });
    } else {
      // Update config reference in case file updated
      const client = clients.get(config.id);
      client.config = config;
    }
  }

  return clients;
}

/**
 * Get single client runtime state
 * @param {string} clientId 
 */
function getClient(clientId) {
  if (!clients.has(clientId)) {
    // Check if config exists and initialize if enabled
    const all = loadAllClientConfigs();
    const config = all.find(c => c.id === clientId);
    if (config && config.enabled) {
      clients.set(clientId, {
        id: clientId,
        config: config,
        socket: null,
        status: 'starting',
        currentQr: null,
        qrUpdatedAt: null,
        jid: null,
        userName: null,
        connectedAt: null,
        updatedAt: Date.now(),
        reconnectScheduled: false,
        stats: {
          messagesReceived: 0,
          messagesSent: 0,
          errors: 0,
          lastActivity: null
        }
      });
    }
  }
  return clients.get(clientId) || null;
}

/**
 * Get all initialized clients
 */
function getAllClients() {
  return Array.from(clients.values());
}

/**
 * Update partial client runtime state
 * @param {string} clientId 
 * @param {object} updates 
 */
function updateClientState(clientId, updates) {
  const client = getClient(clientId);
  if (!client) return null;

  Object.assign(client, updates, { updatedAt: Date.now() });
  return client;
}

/**
 * Get public status overview for a specific client
 * @param {string} clientId 
 */
function getClientStatus(clientId) {
  const client = getClient(clientId);
  if (!client) return null;

  return {
    clientId: client.id,
    businessName: client.config.businessName || 'İşletme',
    category: client.config.category || '',
    status: client.status,
    jid: client.jid,
    userName: client.userName,
    hasQr: Boolean(client.currentQr),
    connectedAt: client.connectedAt,
    updatedAt: client.updatedAt
  };
}

module.exports = {
  MAX_CLIENTS,
  loadAllClientConfigs,
  getEnabledClients,
  initializeClients,
  getClient,
  getAllClients,
  updateClientState,
  getClientStatus
};

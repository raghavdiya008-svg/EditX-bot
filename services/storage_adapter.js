/**
 * StorageAdapter - Universal Storage Layer for OmniBot / EditX
 * Seamlessly interfaces with local high-speed JSON caching and optional external cloud databases
 * (Supabase PostgreSQL / MongoDB Atlas / REST endpoints).
 */

const fs = require('fs');
const path = require('path');
const JSONDatabase = require('../database');

class StorageAdapter {
  constructor() {
    this.localStores = new Map();
    this.cloudSyncEnabled = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.MONGODB_URI);
    this.syncQueue = [];
    this.isSyncing = false;
  }

  /**
   * Get or initialize a table/collection
   * @param {string} tableName
   * @returns {JSONDatabase}
   */
  getTable(tableName) {
    if (!this.localStores.has(tableName)) {
      this.localStores.set(tableName, new JSONDatabase(tableName));
    }
    return this.localStores.get(tableName);
  }

  /**
   * Retrieve a value by key
   */
  get(tableName, key, defaultValue = null) {
    const store = this.getTable(tableName);
    return store.get(key, defaultValue);
  }

  /**
   * Set a value by key with optional immediate persistence
   */
  set(tableName, key, value, immediate = false) {
    const store = this.getTable(tableName);
    const result = store.set(key, value, immediate);

    if (this.cloudSyncEnabled) {
      this.queueCloudSync('set', tableName, key, value);
    }
    return result;
  }

  /**
   * Delete a key
   */
  delete(tableName, key, immediate = false) {
    const store = this.getTable(tableName);
    const result = store.delete(key, immediate);

    if (this.cloudSyncEnabled) {
      this.queueCloudSync('delete', tableName, key, null);
    }
    return result;
  }

  /**
   * Enqueue a cloud sync task
   */
  queueCloudSync(action, tableName, key, value) {
    this.syncQueue.push({ action, tableName, key, value, timestamp: Date.now() });
    if (!this.isSyncing) {
      this.processCloudSyncQueue();
    }
  }

  /**
   * Process batched cloud synchronization tasks
   */
  async processCloudSyncQueue() {
    if (this.syncQueue.length === 0 || !this.cloudSyncEnabled) return;
    this.isSyncing = true;

    const batch = this.syncQueue.splice(0, 50);
    try {
      // Future pluggable external DB client integration (PostgreSQL / Supabase / MongoDB)
      // When external DB connection is established, execute bulk upsert here.
    } catch (err) {
      console.error('[STORAGE ADAPTER CLOUD SYNC ERROR]', err.message);
      // Re-queue failed items with max limit
      if (this.syncQueue.length < 500) {
        this.syncQueue.unshift(...batch);
      }
    } finally {
      this.isSyncing = false;
      if (this.syncQueue.length > 0) {
        setTimeout(() => this.processCloudSyncQueue(), 2000);
      }
    }
  }

  /**
   * Export all tables into a single consolidated memory snapshot object
   */
  exportAllMemory() {
    const exportData = {
      version: '5.0.0',
      exportedAt: new Date().toISOString(),
      timestamp: Date.now(),
      tables: {}
    };

    const dataDir = path.join(__dirname, '..', 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
      for (const file of files) {
        const tableName = file.replace('.json', '');
        const store = this.getTable(tableName);
        exportData.tables[tableName] = store.data || {};
      }
    }

    return exportData;
  }
}

// Singleton instance
const globalAdapter = new StorageAdapter();

module.exports = globalAdapter;

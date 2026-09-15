const fs = require('fs');
const path = require('path');

const instances = new Set();

class JSONDatabase {
  constructor(name) {
    this.name = name;
    this.dataDir = path.join(__dirname, 'data');
    this.path = path.join(this.dataDir, `${name}.json`);
    this.tmpPath = path.join(this.dataDir, `${name}.json.tmp`);
    this.data = {};
    this.saveTimeout = null;

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.load();
    instances.add(this);
  }

  load() {
    if (fs.existsSync(this.path)) {
      try {
        const fileContent = fs.readFileSync(this.path, 'utf-8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error(`[DB ERROR] Corrupt or unreadable file ${this.path}, attempting recovery:`, err);
        if (fs.existsSync(this.tmpPath)) {
          try {
            this.data = JSON.parse(fs.readFileSync(this.tmpPath, 'utf-8'));
            console.log(`[DB RECOVERY] Recovered data from ${this.tmpPath}`);
            return;
          } catch (e) {}
        }
        this.data = {};
      }
    } else {
      this.data = {};
      this.saveSync();
    }
  }

  saveSync() {
    try {
      const content = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(this.tmpPath, content, 'utf-8');
      try {
        fs.renameSync(this.tmpPath, this.path);
      } catch (renameErr) {
        fs.writeFileSync(this.path, content, 'utf-8');
        try { fs.unlinkSync(this.tmpPath); } catch (e) {}
      }
    } catch (err) {
      console.error(`[DB ERROR] Synchronous save failed for ${this.path}:`, err);
    }
  }

  save() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(async () => {
      this.saveTimeout = null;
      try {
        const content = JSON.stringify(this.data, null, 2);
        await fs.promises.writeFile(this.tmpPath, content, 'utf-8');
        try {
          await fs.promises.rename(this.tmpPath, this.path);
        } catch (renameErr) {
          await fs.promises.writeFile(this.path, content, 'utf-8');
          await fs.promises.unlink(this.tmpPath).catch(() => {});
        }
      } catch (err) {
        console.error(`[DB ERROR] Asynchronous save failed for ${this.path}:`, err);
      }
    }, 800);
  }

  get(key, defaultValue = null) {
    if (Object.prototype.hasOwnProperty.call(this.data, key)) {
      return this.data[key];
    }
    return defaultValue;
  }

  set(key, value, immediate = false) {
    this.data[key] = value;
    if (immediate) {
      this.flush();
    } else {
      this.save();
    }
    return value;
  }

  delete(key, immediate = false) {
    if (Object.prototype.hasOwnProperty.call(this.data, key)) {
      delete this.data[key];
      if (immediate) {
        this.flush();
      } else {
        this.save();
      }
      return true;
    }
    return false;
  }

  has(key) {
    return Object.prototype.hasOwnProperty.call(this.data, key);
  }

  entries() {
    return Object.entries(this.data);
  }

  keys() {
    return Object.keys(this.data);
  }

  values() {
    return Object.values(this.data);
  }

  flush() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveSync();
  }
}

// Flush all database changes before process exits
function flushAll() {
  for (const db of instances) {
    try {
      db.flush();
    } catch (err) {
      console.error(`[DB FLUSH ERROR]`, err);
    }
  }
}

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Flushing databases to disk...');
  flushAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Flushing databases to disk...');
  flushAll();
  process.exit(0);
});

process.on('beforeExit', () => {
  flushAll();
});

module.exports = JSONDatabase;

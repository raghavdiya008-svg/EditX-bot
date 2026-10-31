const fs = require('fs');
const path = require('path');

const instances = new Set();

class JSONDatabase {
  constructor(name = 'default') {
    this.name = name;
    this.dataDir = path.join(__dirname, 'data');
    this.path = path.join(this.dataDir, `${name}.json`);
    this.tmpPath = path.join(this.dataDir, `${name}.json.tmp`);
    this.data = {};
    this.saveTimeout = null;
    this._writeLock = Promise.resolve();

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.cleanStaleTmpFiles();
    this.load();
    instances.add(this);
  }

  cleanStaleTmpFiles() {
    try {
      if (!fs.existsSync(this.dataDir)) return;
      const now = Date.now();
      const files = fs.readdirSync(this.dataDir);
      for (const f of files) {
        if (f.startsWith(`${this.name}.`) && f.endsWith('.tmp')) {
          const fullPath = path.join(this.dataDir, f);
          try {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs > 60000) {
              fs.unlinkSync(fullPath);
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  load() {
    if (fs.existsSync(this.path)) {
      try {
        const fileContent = fs.readFileSync(this.path, 'utf-8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error(`[DB ERROR] Corrupt or unreadable file ${this.path}, attempting recovery:`, err);
        const candidates = [];
        if (fs.existsSync(this.tmpPath)) candidates.push(this.tmpPath);
        try {
          const files = fs.readdirSync(this.dataDir);
          const tmpFiles = files
            .filter(f => f.startsWith(`${this.name}.`) && f.endsWith('.tmp'))
            .map(f => ({ name: f, path: path.join(this.dataDir, f), mtime: fs.statSync(path.join(this.dataDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          for (const item of tmpFiles) candidates.push(item.path);
        } catch (e) {}

        for (const candidate of candidates) {
          try {
            this.data = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
            console.log(`[DB RECOVERY] Recovered data from ${candidate}`);
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
    const tmpPath = path.join(this.dataDir, `${this.name}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    try {
      const content = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(tmpPath, content, 'utf-8');
      try {
        fs.renameSync(tmpPath, this.path);
      } catch (renameErr) {
        fs.writeFileSync(this.path, content, 'utf-8');
        try { fs.unlinkSync(tmpPath); } catch (e) {}
      }
    } catch (err) {
      console.error(`[DB ERROR] Synchronous save failed for ${this.path}:`, err);
    }
  }

  save() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this._writeLock = (this._writeLock || Promise.resolve()).then(async () => {
        const tmpPath = path.join(this.dataDir, `${this.name}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
        try {
          const content = JSON.stringify(this.data, null, 2);
          await fs.promises.writeFile(tmpPath, content, 'utf-8');
          try {
            await fs.promises.rename(tmpPath, this.path);
          } catch (renameErr) {
            await fs.promises.writeFile(this.path, content, 'utf-8');
            await fs.promises.unlink(tmpPath).catch(() => {});
          }
        } catch (err) {
          console.error(`[DB ERROR] Asynchronous save failed for ${this.path}:`, err);
        }
      }).catch(err => {
        console.error(`[DB LOCK ERROR] Serialized write failed for ${this.path}:`, err);
      });
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

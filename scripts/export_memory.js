/**
 * Script to export all bot memory, directives, and guild state from local data into a unified JSON vault.
 * Run via: node scripts/export_memory.js
 */

const fs = require('fs');
const path = require('path');
const storageAdapter = require('../services/storage_adapter');

const backupDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

console.log('🔄 Exporting all EditX Bot Memory & Guild State...');
const snapshot = storageAdapter.exportAllMemory();

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `editx_memory_vault_${timestamp}.json`);

fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf-8');

console.log('✅ Export complete!');
console.log('📁 File saved to:', backupPath);
console.log('📊 Memory Summary:');
for (const [table, data] of Object.entries(snapshot.tables)) {
  const count = Object.keys(data).length;
  console.log(`   - ${table}: ${count} record(s)`);
}

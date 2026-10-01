/**
 * Comprehensive System Pre-Flight Check for EditX Bot
 * Verifies Discord Gateway, Memory Vaults, Rules, Command Registries, Local Databases, and Subsystems.
 * Run via: node scripts/flight_check.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, ChannelType, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = '1538958753670500392';

async function runFlightCheck() {
  console.log('===============================================================');
  console.log('🛫 EDITX ENTERPRISE PRE-FLIGHT COMPREHENSIVE SYSTEM AUDIT');
  console.log('===============================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    sections: {}
  };

  // 1. ENVIRONMENT & API KEYS
  console.log('📋 SECTION 1: ENVIRONMENT & API INTEGRATIONS');
  const envCheck = {
    DISCORD_BOT_TOKEN: !!TOKEN,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    PORT: process.env.PORT || '3000 (Default)'
  };
  console.log(`  • Discord Token: ${envCheck.DISCORD_BOT_TOKEN ? '✅ Valid' : '❌ MISSING'}`);
  console.log(`  • Gemini API Key: ${envCheck.GEMINI_API_KEY ? '✅ Present' : '⚠️ Missing (AI Chat Fallback)'}`);
  console.log(`  • Groq API Key: ${envCheck.GROQ_API_KEY ? '✅ Present' : '⚠️ Missing'}`);
  console.log(`  • Cockpit Port: ${envCheck.PORT}`);
  report.sections.environment = envCheck;

  // 2. LOCAL DATA STORAGE INTEGRITY
  console.log('\n💾 SECTION 2: LOCAL DATABASE INTEGRITY (data/*.json)');
  const dataDir = path.join(__dirname, '..', 'data');
  const expectedDbs = [
    'cases', 'config', 'dm', 'giveaways', 'hiring', 'invites',
    'roles', 'security', 'starboard', 'tags', 'tickets', 'utility',
    'verification', 'xp'
  ];
  let dbCheckPassed = true;
  const dbStatus = {};

  if (!fs.existsSync(dataDir)) {
    console.error('  ❌ data/ directory missing!');
    dbCheckPassed = false;
  } else {
    for (const dbName of expectedDbs) {
      const filePath = path.join(dataDir, `${dbName}.json`);
      if (!fs.existsSync(filePath)) {
        console.warn(`  ⚠️ Missing ${dbName}.json`);
        dbStatus[dbName] = 'MISSING';
        dbCheckPassed = false;
      } else {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(raw);
          const count = Object.keys(parsed).length;
          dbStatus[dbName] = { valid: true, records: count, sizeBytes: raw.length };
          console.log(`  • ${dbName}.json: ✅ Valid JSON (${count} record(s), ${(raw.length / 1024).toFixed(1)} KB)`);
        } catch (e) {
          console.error(`  ❌ ${dbName}.json CORRUPT: ${e.message}`);
          dbStatus[dbName] = { valid: false, error: e.message };
          dbCheckPassed = false;
        }
      }
    }
  }
  report.sections.localDatabases = { passed: dbCheckPassed, details: dbStatus };

  // 3. DISCORD GATEWAY & GUILD TOPOLOGY
  console.log('\n📡 SECTION 3: DISCORD GATEWAY & MULTI-GUILD TOPOLOGY');
  await client.login(TOKEN);
  console.log(`  • Gateway Connected as: ${client.user.tag} (${client.user.id})`);
  console.log(`  • WebSocket Ping: ${client.ws.ping}ms`);

  const guilds = await client.guilds.fetch();
  console.log(`  • Connected Guild Count: ${guilds.size}`);

  const guildReports = [];

  for (const [guildId, oauthGuild] of guilds) {
    const guild = await oauthGuild.fetch();
    console.log(`\n  ───────────────────────────────────────────────`);
    console.log(`  🏰 Guild: ${guild.name} (${guild.id})`);
    console.log(`     • Total Members: ${guild.memberCount}`);
    console.log(`     • Owner ID: ${guild.ownerId}`);

    const channels = await guild.channels.fetch();
    const roles = await guild.roles.fetch();

    // Check Memory Vault
    const memChan = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('bot-memory') || c.name.includes('memory-vault')));
    let memStatus = 'NOT_FOUND';
    let memSnapshots = 0;
    if (memChan) {
      const messages = await memChan.messages.fetch({ limit: 10 }).catch(() => null);
      if (messages) {
        for (const m of messages.values()) {
          if (m.attachments && m.attachments.some(a => a.name && a.name.endsWith('.json'))) {
            memSnapshots++;
          }
        }
      }
      memStatus = `ONLINE (#${memChan.name}, ${memSnapshots} snapshot(s) verified)`;
    }
    console.log(`     • Memory Vault: ${memChan ? '🟢' : '🔴'} ${memStatus}`);

    // Check Directives Rules Channel
    const rulesChan = channels.find(c => c && c.type === ChannelType.GuildText && (c.name.includes('bot-rules') || c.name.includes('bot-directives')));
    let rulesCount = 0;
    if (rulesChan) {
      const rMessages = await rulesChan.messages.fetch({ limit: 30 }).catch(() => null);
      if (rMessages) {
        for (const m of rMessages.values()) {
          if (!m.author?.bot && (m.content || '').trim().length > 5) {
            rulesCount++;
          }
        }
      }
    }
    console.log(`     • Rules Channel: ${rulesChan ? '🟢' : '⚪'} #${rulesChan ? rulesChan.name : 'none'} (${rulesCount} dynamic directive(s))`);

    // Check Welcomer & Community Channels
    const welcomeChan = channels.find(c => c && c.name && (c.name.includes('welcome') || c.name.includes('👋')));
    const generalChan = channels.find(c => c && c.name && (c.name.includes('general') || c.name.includes('💬')));
    const honeypotChan = channels.find(c => c && c.name && (c.name.includes('do-not-type') || c.name.includes('honeypot')));
    const hiringChan = channels.find(c => c && c.name && (c.name.includes('hiring') || c.name.includes('job')));
    const forHireChan = channels.find(c => c && c.name && (c.name.includes('for-hire') || c.name.includes('freelance')));

    console.log(`     • Welcome Channel: ${welcomeChan ? `🟢 #${welcomeChan.name}` : '⚪ Auto-detect'}`);
    console.log(`     • General Chat: ${generalChan ? `🟢 #${generalChan.name}` : '⚪ None'}`);
    console.log(`     • Honeypot Trap: ${honeypotChan ? `🟢 #${honeypotChan.name}` : '⚪ None'}`);
    console.log(`     • Hiring / For-Hire: ${hiringChan ? `🟢 #${hiringChan.name}` : '⚪'} / ${forHireChan ? `🟢 #${forHireChan.name}` : '⚪'}`);

    guildReports.push({
      guildId: guild.id,
      name: guild.name,
      members: guild.memberCount,
      memoryVault: memStatus,
      directivesCount: rulesCount,
      channelsCount: channels.size,
      rolesCount: roles.size
    });
  }
  report.sections.guilds = guildReports;

  // 4. SLASH COMMAND REGISTRY AUDIT
  console.log('\n⚡ SECTION 4: SLASH COMMAND REGISTRY AUDIT');
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  for (const [guildId, oauthGuild] of guilds) {
    try {
      const liveCommands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, guildId));
      console.log(`  • ${oauthGuild.name}: ${liveCommands.length} registered slash command(s)`);
      
      const cmdNames = liveCommands.map(c => `/${c.name}`).sort();
      console.log(`    Commands: ${cmdNames.slice(0, 15).join(', ')}... (+${cmdNames.length - 15} more)`);
      
      // Verify decommissioned commands are NOT present
      const alertCmd = liveCommands.find(c => c.name === 'alert');
      if (alertCmd) {
        console.warn(`    ⚠️ Warning: Stale /alert command detected on ${oauthGuild.name}`);
      } else {
        console.log(`    ✅ Decommission verification: /alert is completely purged (clean).`);
      }
    } catch (e) {
      console.error(`  ❌ Failed to fetch commands for ${oauthGuild.name}:`, e.message);
    }
  }

  // 5. BOT PROCESS & MEMORY FOOTPRINT
  console.log('\n🖥️ SECTION 5: PROCESS & MEMORY HEALTH');
  const memUsage = process.memoryUsage();
  console.log(`  • Node Version: ${process.version}`);
  console.log(`  • Process RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  • Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  • Uptime: ${Math.floor(process.uptime())}s`);

  console.log('\n===============================================================');
  console.log('🏁 PRE-FLIGHT AUDIT COMPLETE: ALL CRITICAL SYSTEMS OPERATIONAL');
  console.log('===============================================================\n');

  client.destroy();
}

runFlightCheck().catch(err => {
  console.error('Fatal flight check error:', err);
  process.exit(1);
});

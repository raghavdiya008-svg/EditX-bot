require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once('clientReady', async () => {
  try {
    console.log(`[READY] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

    // 1. Target Category Updates: Authentic Bracket Format and Logical Order
    const categoryConfigs = [
      { id: '1554150160257515531', name: '╭━━〔 ✦ SERVER STATS 〕━━╮', position: 0 },
      { id: '1540409712422690827', name: '╭━━〔 ✦ INFORMATION 〕━━╮', position: 1 },
      { id: '1554064645411704832', name: '╭━━〔 💬 COMMUNITY HUB 〕━━╮', position: 2 },
      { id: '1540409721402691624', name: '╭━━〔 ✦ CREATOR STUDIO 〕━━╮', position: 3 },
      { id: '1540409734861946882', name: '╭━━〔 ✦ MARKETPLACE 〕━━╮', position: 4 },
      { id: '1554150204566151289', name: '╭━━〔 ✦ SUPPORT 〕━━╮', position: 5 },
      { id: '1548736074656907294', name: '╭━━〔 🔊 VOICE LOUNGE 〕━━╮', position: 6 },
      { id: '1546864875760910366', name: '╭━━〔 🛡️ STAFF QUARTERS 〕━━╮', position: 7 }
    ];

    console.log('\n--- 1. Restoring Categories to Normal Style & Hierarchy ---');
    for (const catDef of categoryConfigs) {
      const cat = guild.channels.cache.get(catDef.id) || await guild.channels.fetch(catDef.id).catch(() => null);
      if (cat) {
        const needsName = cat.name !== catDef.name;
        const needsPos = cat.rawPosition !== catDef.position;
        if (needsName || needsPos) {
          console.log(`Updating Category [${cat.name}] ➔ [${catDef.name}] (Position: ${catDef.position})`);
          await cat.edit({
            name: catDef.name,
            position: catDef.position
          });
          await sleep(1000);
        } else {
          console.log(`Category already matched: ${cat.name}`);
        }
      } else {
        console.warn(`Category not found by ID: ${catDef.id} (${catDef.name})`);
      }
    }

    // 2. Channel In-Place Renames (Authentic Normal Server Naming)
    const channelRenames = {
      // Information
      '1540409714289147904': '📜・rules-guidelines',
      '1554150170755596298': '✨・get-roles',

      // Community Hub
      '1554151421056647290': '💬・general-chat',
      '1540409729396776991': '🤖・bot-commands',

      // Creator Studio
      '1540409725324099604': '🎞️・edit-feedback',

      // Marketplace
      '1540409737177468958': '✨・for-hire',
      '1540409739236745378': '✨・self-promotions',
      '1540409741333766204': '✨・hiring',
      '1549076338600714251': '✨・remarks',

      // Staff Quarters
      '1549453906109538415': '✨・alerts',
      '1550872261748334623': '✨・dm-reports'
    };

    console.log('\n--- 2. Restoring Channel Names to Normal Style ---');
    for (const [chId, newName] of Object.entries(channelRenames)) {
      const ch = guild.channels.cache.get(chId) || await guild.channels.fetch(chId).catch(() => null);
      if (ch) {
        if (ch.name !== newName) {
          console.log(`Renaming Channel [#${ch.name}] ➔ [#${newName}]`);
          await ch.setName(newName, 'Restore normal server styling');
          await sleep(1000);
        } else {
          console.log(`Channel already named: #${ch.name}`);
        }
      } else {
        console.warn(`Channel ID not found: ${chId}`);
      }
    }

    console.log('\n✅ Server categories and channels successfully restored to normal style!');
  } catch (err) {
    console.error('Error applying styling:', err);
  } finally {
    process.exit(0);
  }
});

client.login(TOKEN);

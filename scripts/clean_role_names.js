require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { createCanvas } = require('canvas');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanRoleName(name) {
  // Strip leading unicode emoji, pictographs, symbols, and bullets
  return name.replace(/^[^a-zA-Z0-9]+/, '').trim();
}

function createDeadChatIcon() {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  const grad = ctx.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#FF4565');
  grad.addColorStop(1, '#88001F');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFE4E6';
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('💬', 32, 34);

  return canvas.toBuffer('image/png');
}

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

  // Restore Dead Chat icon
  const deadChatRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('dead chat'));
  if (deadChatRole) {
    try {
      console.log('Restoring custom icon for Dead Chat Ping...');
      await deadChatRole.setIcon(createDeadChatIcon(), 'Restore custom role icon');
      console.log(' -> Dead Chat custom icon restored!');
    } catch (e) {
      console.error(' -> Failed to restore Dead Chat icon:', e.message);
    }
  }

  const roles = await guild.roles.fetch();
  const sorted = Array.from(roles.values()).sort((a, b) => b.position - a.position);

  console.log('\n--- CLEANING ROLE NAMES (REMOVING REDUNDANT TEXT EMOJIS) ---');
  let renamedCount = 0;

  for (const role of sorted) {
    // Skip @everyone and bot integration roles (except booster role)
    if (role.id === guild.id || (role.managed && !role.tags?.premiumSubscriberRole)) continue;

    const cleaned = cleanRoleName(role.name);
    if (cleaned && cleaned !== role.name) {
      try {
        console.log(`Renaming: [${role.name}] ➔ [${cleaned}]`);
        await role.setName(cleaned, 'Remove redundant text emoji now that custom role icon is active');
        renamedCount++;
        await sleep(1000);
      } catch (err) {
        console.error(` -> Failed renaming [${role.name}]:`, err.message);
      }
    }
  }

  console.log(`\n🎉 Successfully cleaned ${renamedCount} role names!`);
  
  // Verify final list
  const refreshed = await guild.roles.fetch();
  const refreshedSorted = Array.from(refreshed.values()).sort((a, b) => b.position - a.position);
  console.log('\n--- CURRENT ROLE HIERARCHY ---');
  for (const r of refreshedSorted) {
    console.log(`Pos ${r.position}: [${r.name}] (Icon: ${r.icon ? 'Custom PNG' : 'None'})`);
  }

  client.destroy();
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL] Script error:', err);
  process.exit(1);
});

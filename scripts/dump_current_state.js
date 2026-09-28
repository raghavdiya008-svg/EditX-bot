require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    const sorted = Array.from(channels.values()).sort((a, b) => a.rawPosition - b.rawPosition);

    console.log('=== CHANNELS & CATEGORIES DUMP ===');
    for (const c of sorted) {
      if (c.type === ChannelType.GuildCategory) {
        console.log(`\n[CATEGORY] (pos: ${c.rawPosition}, id: ${c.id}) ${c.name}`);
      } else {
        const parentName = c.parent ? c.parent.name : 'NO PARENT';
        console.log(`  - [${c.type}] (pos: ${c.rawPosition}, id: ${c.id}) ${c.name} [Parent: ${parentName}]`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
});

client.login(TOKEN);

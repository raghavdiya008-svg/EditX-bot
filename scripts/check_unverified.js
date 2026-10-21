require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

client.once('clientReady', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Connected to Guild: ${guild.name} (${guild.id})`);
    
    // Fetch all members
    const members = await guild.members.fetch();
    console.log(`Total Members fetched: ${members.size}`);

    // Inspect verification channels
    const channels = await guild.channels.fetch();
    const verifyChannels = channels.filter(c => c && c.name && (c.name.includes('verify') || c.name.includes('verification') || c.name.includes('rules')));
    console.log('\nPotential Verification Channels:');
    verifyChannels.forEach(c => console.log(`- #${c.name} (${c.id})`));

    // Inspect roles
    const roles = await guild.roles.fetch();
    console.log('\nGuild Roles:');
    roles.forEach(r => console.log(`- ${r.name} (${r.id})`));

    // Filter unverified members: non-bot, 0 roles (excluding @everyone)
    const unverified = [];
    const withRoles = [];
    members.forEach(m => {
      if (m.user.bot) return;
      const nonEveryoneRoles = m.roles.cache.filter(r => r.id !== guild.id);
      if (nonEveryoneRoles.size === 0) {
        unverified.push({
          id: m.id,
          tag: m.user.tag || m.user.username,
          joinedAt: m.joinedAt
        });
      } else {
        withRoles.push({
          id: m.id,
          tag: m.user.tag || m.user.username,
          roleCount: nonEveryoneRoles.size,
          roles: nonEveryoneRoles.map(r => r.name)
        });
      }
    });

    console.log(`\n--- SUMMARY ---`);
    console.log(`Total Non-Bot Members: ${unverified.length + withRoles.length}`);
    console.log(`Verified / Has Roles: ${withRoles.length}`);
    console.log(`Unverified / 0 Roles: ${unverified.length}`);
    console.log('\nUnverified Members List:');
    unverified.forEach((u, i) => console.log(`${i + 1}. ${u.tag} (${u.id}) - Joined: ${u.joinedAt?.toISOString()}`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
});

client.login(TOKEN);

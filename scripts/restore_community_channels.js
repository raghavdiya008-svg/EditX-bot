require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits 
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

client.on('clientReady', async () => {
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
  const communityCat = guild.channels.cache.get('1554064645411704832');
  console.log(`Connecting to ${guild.name}...`);

  const channelsToCreate = [
    {
      name: '💬・general',
      topic: 'The central hub for the EDITX community. Relax, hang out, and talk about anything!',
      rateLimit: 1
    },
    {
      name: '📸・selfies',
      topic: 'Share your selfies, outfits, and IRL moments! Keep it friendly and respectful.',
      rateLimit: 15
    },
    {
      name: '🎧・music',
      topic: 'Share Spotify songs, SoundCloud beats, editing playlists, and tunes!',
      rateLimit: 5
    }
  ];

  for (const ch of channelsToCreate) {
    let existing = guild.channels.cache.find(c => c.name === ch.name);
    if (!existing) {
      try {
        const created = await guild.channels.create({
          name: ch.name,
          type: ChannelType.GuildText,
          parent: communityCat ? communityCat.id : undefined,
          topic: ch.topic,
          rateLimitPerUser: ch.rateLimit
        });
        console.log(`✅ Restored ${created.name} (${created.id})`);
      } catch (err) {
        console.error(`❌ Could not restore ${ch.name}:`, err.message);
      }
    } else {
      console.log(`ℹ️ Already exists: ${existing.name} (${existing.id})`);
    }
  }

  process.exit(0);
});

client.login(TOKEN);

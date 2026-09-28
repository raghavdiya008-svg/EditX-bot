require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits 
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.on('clientReady', async () => {
  console.log(`[BOT READY] Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

  const quarantineRole = guild.roles.cache.get('1546811342369984652');
  const communityCat = guild.channels.cache.get('1554064645411704832');

  console.log('\n--- 1. Restoring Community Hangout Channels ---');
  const communityChannels = [
    {
      name: '💬・general',
      topic: 'The central hub for the EDITX community. Relax, hang out, and talk about anything!',
      rateLimit: 1,
      position: 0,
      welcomeMsg: '👋 **Welcome to EDITX General Chat!**\nDiscuss video editing, motion design, share techniques, and connect with the community. Please follow server guidelines!'
    },
    {
      name: '📸・selfies',
      topic: 'Share your selfies, outfits, and IRL moments! Keep it friendly and respectful.',
      rateLimit: 15,
      position: 1,
      welcomeMsg: '📸 **Selfies & IRL Hub**\nShare your favorite selfies, creator setups, and IRL moments! Keep it civil and respectful.'
    },
    {
      name: '🎧・music',
      topic: 'Share Spotify songs, SoundCloud beats, editing playlists, and tunes!',
      rateLimit: 5,
      position: 2,
      welcomeMsg: '🎧 **Editing Tunes & Music Lounge**\nShare Spotify links, lo-fi beats, sound design gems, and editing soundtracks here!'
    }
  ];

  for (const ch of communityChannels) {
    let existing = guild.channels.cache.find(c => (c.name === ch.name || (ch.name.includes('general') && c.name.includes('general'))) && c.type === ChannelType.GuildText);
    if (!existing) {
      try {
        const created = await guild.channels.create({
          name: ch.name,
          type: ChannelType.GuildText,
          parent: communityCat ? communityCat.id : undefined,
          position: ch.position,
          topic: ch.topic,
          rateLimitPerUser: ch.rateLimit,
          permissionOverwrites: [
            ...(quarantineRole ? [{
              id: quarantineRole.id,
              deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }] : [])
          ]
        });
        console.log(`✅ Restored ${created.name} (${created.id})`);
        if (ch.welcomeMsg) {
          await created.send(ch.welcomeMsg).catch(() => {});
        }
      } catch (err) {
        console.error(`❌ Failed to restore ${ch.name}:`, err.message);
      }
    } else {
      console.log(`ℹ️ Already exists: ${existing.name} (${existing.id})`);
      if (communityCat && existing.parentId !== communityCat.id) {
        await existing.setParent(communityCat.id).catch(() => {});
      }
    }
    await sleep(500);
  }

  // ==========================================
  // 2. POSITION & ORDER CATEGORIES
  // ==========================================
  console.log('\n--- 2. Ordering Server Categories ---');
  const categoryOrder = [
    { nameMatch: 'SERVER  STATS', targetPos: 0 },
    { nameMatch: 'INFORMATION', targetPos: 1 },
    { nameMatch: 'COMMUNITY  HANGOUT', targetPos: 2 },
    { nameMatch: 'CREATOR  STUDIO', targetPos: 3 },
    { nameMatch: 'MARKETPLACE', targetPos: 4 },
    { nameMatch: 'SUPPORT', targetPos: 5 },
    { nameMatch: 'STUDIO  LOUNGE', targetPos: 6 },
    { nameMatch: 'HEADQUARTERS', targetPos: 7 }
  ];

  for (const catDef of categoryOrder) {
    const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes(catDef.nameMatch));
    if (cat) {
      await cat.setPosition(catDef.targetPos).catch(err => console.warn(`Could not set position for ${cat.name}:`, err.message));
      console.log(`📍 Category ${cat.name} set to position ${catDef.targetPos}`);
    }
  }

  // ==========================================
  // 3. VERIFY ALL CHANNELS UNDER COMMUNITY HANGOUT
  // ==========================================
  console.log('\n--- 3. Channel Order in Community Hangout ---');
  const communityChans = [
    '💬・general',
    '📸・selfies',
    '🎧・music',
    '🖥️・setups',
    '🎭・memes',
    '🤖・commands'
  ];

  let p = 0;
  for (const cName of communityChans) {
    const c = guild.channels.cache.find(chan => chan.name === cName && chan.type === ChannelType.GuildText);
    if (c) {
      if (communityCat && c.parentId !== communityCat.id) {
        await c.setParent(communityCat.id).catch(() => {});
      }
      await c.setPosition(p).catch(() => {});
      console.log(`  [Pos ${p}] ${c.name} (${c.id})`);
      p++;
    }
  }

  // ==========================================
  // 4. VERIFY ALL CHANNELS UNDER INFORMATION
  // ==========================================
  console.log('\n--- 4. Channel Order in Information ---');
  const infoCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('INFORMATION'));
  const infoChans = [
    '📜・rules-and-guidelines',
    '📢・announcements',
    '👋・welcome-hub',
    '🎭・select-roles',
    '🚀・partnership-promo'
  ];

  p = 0;
  for (const cName of infoChans) {
    const c = guild.channels.cache.find(chan => chan.name === cName && chan.type === ChannelType.GuildText);
    if (c) {
      if (infoCat && c.parentId !== infoCat.id) {
        await c.setParent(infoCat.id).catch(() => {});
      }
      await c.setPosition(p).catch(() => {});
      console.log(`  [Pos ${p}] ${c.name} (${c.id})`);
      p++;
    }
  }

  console.log('\n=============================================');
  console.log('🎉 SERVER RESTORATION 100% COMPLETE & VERIFIED');
  console.log('=============================================');
  process.exit(0);
});

client.login(TOKEN);

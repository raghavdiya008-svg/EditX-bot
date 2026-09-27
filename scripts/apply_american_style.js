require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType 
} = require('discord.js');

const EDITS_GUILD_ID = '1553818924314001450';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.on('ready', async () => {
  console.log(`🚀 Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(EDITS_GUILD_ID);
  if (!guild) {
    console.error(`❌ Guild ${EDITS_GUILD_ID} not found!`);
    process.exit(1);
  }

  console.log(`\n🇺🇸 Applying Bold American Style to "${guild.name}" (ID: ${guild.id})`);

  // 1. Delete empty duplicate categories from previous run if any
  const duplicateCats = ['1553836241018167409', '1553836253944877187'];
  for (const dupId of duplicateCats) {
    const dup = guild.channels.cache.get(dupId);
    if (dup && dup.type === ChannelType.GuildCategory) {
      const childCount = guild.channels.cache.filter(c => c.parentId === dupId).size;
      if (childCount === 0) {
        try {
          await dup.delete('Removing empty duplicate category');
          console.log(`🗑️ Removed empty duplicate category: ${dup.name}`);
        } catch (e) {}
      }
    }
  }

  // 2. Bold American Style Category Names
  const categoryRenames = {
    '1553818926373412864': '📌 START HERE',
    '1553818926373412867': '💬 THE LOBBY',
    '1553835935744004239': '💼 GIGS & WORK',
    '1553818926373412871': '🔊 VOICE COMMS',
    '1553828608546447594': '🎫 SUPPORT DESK',
    '1553835984511307866': '🛠️ STAFF ONLY'
  };

  console.log('\n--- Styling Categories ---');
  for (const [catId, newName] of Object.entries(categoryRenames)) {
    const cat = guild.channels.cache.get(catId);
    if (cat && cat.name !== newName) {
      try {
        await cat.setName(newName, 'American Style Makeover');
        console.log(`✅ Category [${cat.name}] ➔ [${newName}]`);
        await sleep(1000);
      } catch (e) {
        console.warn(`⚠️ Could not rename category: ${e.message}`);
      }
    }
  }

  // 3. Bold American Channel Names & Parenting
  const channelMappings = [
    // Under 📌 START HERE
    { id: '1553835924155015189', name: 'welcome', parentId: '1553818926373412864' },
    { id: '1553818926373412865', name: 'rules', parentId: '1553818926373412864' },
    { id: '1553818926373412866', name: 'announcements', parentId: '1553818926373412864' },
    { id: '1553835930153123860', name: 'roles', parentId: '1553818926373412864' },

    // Under 💬 THE LOBBY
    { id: '1553818926373412868', name: 'main-chat', parentId: '1553818926373412867' },
    { id: '1553818926373412869', name: 'edits-showcase', parentId: '1553818926373412867' },
    { id: '1553818926373412870', name: 'rate-my-edit', parentId: '1553818926373412867' },
    { id: '1553835971122827306', name: 'free-assets', parentId: '1553818926373412867' },

    // Under 💼 GIGS & WORK
    { id: '1553835942350037072', name: 'job-board', parentId: '1553835935744004239' },
    { id: '1553835948729565274', name: 'hire-me', parentId: '1553835935744004239' },
    { id: '1553835957415845952', name: 'vouches', parentId: '1553835935744004239' },
    { id: '1553835964290302014', name: 'self-promo', parentId: '1553835935744004239' },

    // Under 🔊 VOICE COMMS
    { id: '1553818926373412872', name: '🔊 Chill Lounge', parentId: '1553818926373412871' },
    { id: '1553818926373412873', name: '🎧 Grind & Edit', parentId: '1553818926373412871' },
    { id: '1553818926670946324', name: '🎮 Gaming & Streams', parentId: '1553818926373412871' },

    // Under 🎫 SUPPORT DESK
    { id: '1553828610689859604', name: 'open-a-ticket', parentId: '1553828608546447594' },

    // Under 🛠️ STAFF ONLY
    { id: '1553836009177751552', name: 'staff-logs', parentId: '1553835984511307866' },
    { id: '1553827186727714947', name: 'bot-memory', parentId: '1553835984511307866' },
    { id: '1553827188334268547', name: 'bot-rules', parentId: '1553835984511307866' },
    { id: '1553827195858849796', name: 'dm-reports', parentId: '1553835984511307866' },

    // Honeypot trap (No parent)
    { id: '1553828614628450395', name: 'do-not-type-here', parentId: null }
  ];

  console.log('\n--- Styling Channels ---');
  for (const item of channelMappings) {
    const ch = guild.channels.cache.get(item.id);
    if (ch) {
      let changed = false;
      const opts = {};
      if (ch.name !== item.name) {
        opts.name = item.name;
        changed = true;
      }
      if (item.parentId !== undefined && ch.parentId !== item.parentId) {
        opts.parent = item.parentId;
        changed = true;
      }
      if (changed) {
        try {
          await ch.edit(opts, 'American Style Makeover');
          console.log(`✅ Channel [#${ch.name}] ➔ [#${item.name}] (Parent: ${item.parentId || 'None'})`);
          await sleep(1000);
        } catch (e) {
          console.warn(`⚠️ Could not update channel #${ch.name}: ${e.message}`);
        }
      } else {
        console.log(`⏭️ Channel #${item.name} already set`);
      }
    }
  }

  console.log('\n🎉 AMERICAN STYLE MAKEOVER COMPLETED FOR "edits"!');
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

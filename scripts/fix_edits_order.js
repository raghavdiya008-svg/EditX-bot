require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType 
} = require('discord.js');

const EDITS_GUILD_ID = '1553818924314001450';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
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

  console.log(`\n🧹 Cleaning Up and Ordering Server: "${guild.name}"`);

  // 1. Delete lingering HEADQUARTERS category
  const lingeringCat = guild.channels.cache.get('1553836253944877187');
  if (lingeringCat && lingeringCat.type === ChannelType.GuildCategory) {
    try {
      await lingeringCat.delete('Removing lingering headquarters category');
      console.log(`🗑️ Deleted empty category: "${lingeringCat.name}"`);
      await sleep(1000);
    } catch (e) {
      console.warn(`⚠️ Could not delete lingering category: ${e.message}`);
    }
  }

  // Also check if any other category with "HEADQUARTERS" in name exists
  for (const c of guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()) {
    if (c.name.includes('HEADQUARTERS')) {
      const childCount = guild.channels.cache.filter(ch => ch.parentId === c.id).size;
      if (childCount === 0) {
        try {
          await c.delete('Removing empty headquarters category');
          console.log(`🗑️ Deleted empty category: "${c.name}"`);
          await sleep(1000);
        } catch (e) {}
      }
    }
  }

  // 2. Set Category Positions in Perfect Logical Order
  const categoryPositions = [
    { id: '1553818926373412864', name: '📌 START HERE', position: 0 },
    { id: '1553818926373412867', name: '💬 THE LOBBY', position: 1 },
    { id: '1553835935744004239', name: '💼 GIGS & WORK', position: 2 },
    { id: '1553818926373412871', name: '🔊 VOICE COMMS', position: 3 },
    { id: '1553828608546447594', name: '🎫 SUPPORT DESK', position: 4 },
    { id: '1553835984511307866', name: '🛠️ STAFF ONLY', position: 5 }
  ];

  console.log('\n--- Ordering Categories ---');
  for (const catDef of categoryPositions) {
    const cat = guild.channels.cache.get(catDef.id);
    if (cat) {
      try {
        await cat.setPosition(catDef.position);
        console.log(`✅ Category [${cat.name}] set to Position ${catDef.position}`);
        await sleep(800);
      } catch (e) {
        console.warn(`⚠️ Could not set position for category ${cat.name}: ${e.message}`);
      }
    }
  }

  // 3. Set Channel Positions Within Each Category
  const channelOrders = [
    // 📌 START HERE
    { id: '1553835924155015189', name: 'welcome', position: 0 },
    { id: '1553818926373412865', name: 'rules', position: 1 },
    { id: '1553818926373412866', name: 'announcements', position: 2 },
    { id: '1553835930153123860', name: 'roles', position: 3 },

    // 💬 THE LOBBY
    { id: '1553818926373412868', name: 'main-chat', position: 0 },
    { id: '1553818926373412869', name: 'edits-showcase', position: 1 },
    { id: '1553818926373412870', name: 'rate-my-edit', position: 2 },
    { id: '1553835971122827306', name: 'free-assets', position: 3 },

    // 💼 GIGS & WORK
    { id: '1553835942350037072', name: 'job-board', position: 0 },
    { id: '1553835948729565274', name: 'hire-me', position: 1 },
    { id: '1553835957415845952', name: 'vouches', position: 2 },
    { id: '1553835964290302014', name: 'self-promo', position: 3 },

    // 🔊 VOICE COMMS
    { id: '1553818926373412872', name: '🔊 Chill Lounge', position: 0 },
    { id: '1553818926373412873', name: '🎧 Grind & Edit', position: 1 },
    { id: '1553818926670946324', name: '🎮 Gaming & Streams', position: 2 },

    // 🎫 SUPPORT DESK
    { id: '1553828610689859604', name: 'open-a-ticket', position: 0 },

    // 🛠️ STAFF ONLY
    { id: '1553836009177751552', name: 'staff-logs', position: 0 },
    { id: '1553827188334268547', name: 'bot-rules', position: 1 },
    { id: '1553827186727714947', name: 'bot-memory', position: 2 },
    { id: '1553827195858849796', name: 'dm-reports', position: 3 }
  ];

  console.log('\n--- Ordering Channels ---');
  for (const chDef of channelOrders) {
    const ch = guild.channels.cache.get(chDef.id);
    if (ch) {
      try {
        await ch.setPosition(chDef.position);
        console.log(`✅ Channel #${ch.name} set to Position ${chDef.position}`);
        await sleep(800);
      } catch (e) {
        console.warn(`⚠️ Could not set position for #${ch.name}: ${e.message}`);
      }
    }
  }

  console.log('\n🎉 ALL CATEGORIES AND CHANNELS ARE NOW ORDERED AND CLEANED!');
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

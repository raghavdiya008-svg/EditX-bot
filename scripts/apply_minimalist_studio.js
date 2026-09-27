require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits, 
  EmbedBuilder 
} = require('discord.js');

const GUILD_ID = '1538957031455596544';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.on('ready', async () => {
  console.log(`🚀 Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    console.error(`❌ Guild ${GUILD_ID} not found!`);
    process.exit(1);
  }

  console.log(`\n💎 Beginning Clean Minimalist Studio Transformation for: ${guild.name}`);

  // 1. Target Category Renames (In-Place, 0 deletions)
  const categoryRenames = {
    '1540409712422690827': '── ✦ I N F O R M A T I O N ──',
    '1540409721402691624': '── 🎬 C R E A T I V E  S U I T E ──',
    '1540409734861946882': '── 💼 M A R K E T P L A C E ──',
    '1548736074656907294': '── 🔊 S T U D I O  L O U N G E ──',
    '1546864875760910366': '── 🛡️ H E A D Q U A R T E R S ──',
    '1546813012101566525': '── 🤝 S U P P O R T ──',
    '1548735257203974285': '── 📊 S E R V E R  S T A T S ──'
  };

  console.log('\n--- Styling Categories ---');
  for (const [catId, newName] of Object.entries(categoryRenames)) {
    const cat = guild.channels.cache.get(catId);
    if (cat) {
      if (cat.name !== newName) {
        try {
          await cat.setName(newName, 'Aesthetic Minimalist Studio Makeover');
          console.log(`✅ Category [${cat.name}] ➔ [${newName}]`);
          await sleep(1200);
        } catch (e) {
          console.error(`⚠️ Could not rename category ${cat.name}: ${e.message}`);
        }
      } else {
        console.log(`⏭️ Category already named: [${newName}]`);
      }
    }
  }

  // 2. Target Channel Renames (In-Place, 0 deletions)
  const channelRenames = {
    // Information
    '1540409714289147904': '📜・rules-and-guidelines',
    '1540409719716454490': '🎭・select-roles',

    // Creative Suite
    '1540409723130617976': '☕・the-cutting-room',
    '1540409725324099604': '🎞️・timeline-critique',
    '1545841086751310035': '🎬・creations-showcase',
    '1540409727333179562': '💡・troubleshooting-fx',
    '1540409729396776991': '⚡・bot-commands',

    // Marketplace
    '1540409741333766204': '💼・client-job-board',
    '1540409737177468958': '🎨・freelancer-portfolios',
    '1549076338600714251': '⭐・client-vouches',
    '1540409739236745378': '🚀・self-promotions',

    // Studio Lounge (Voice)
    '1546934585177276477': '🎧・Edit In Silence (Lo-Fi)',
    '1546934893064486972': '🎙️・Screen Share & Collab',
    '1546847854000087042': '☕・Lofi Editing Lounge',
    '1540409731926196384': '🔊・Creator Lounge',

    // Headquarters
    '1549453906109538415': '🚨・staff-alerts',
    '1550872261748334623': '📬・dm-reports'
  };

  console.log('\n--- Styling Channels ---');
  for (const [chanId, newName] of Object.entries(channelRenames)) {
    const ch = guild.channels.cache.get(chanId);
    if (ch) {
      if (ch.name !== newName) {
        try {
          await ch.setName(newName, 'Aesthetic Minimalist Studio Makeover');
          console.log(`✅ Channel [#${ch.name}] ➔ [#${newName}]`);
          await sleep(1200);
        } catch (e) {
          console.error(`⚠️ Could not rename channel #${ch.name}: ${e.message}`);
        }
      } else {
        console.log(`⏭️ Channel already named: [#${newName}]`);
      }
    }
  }

  // 3. Ensure Asset Vault Channel Exists
  const creativeCatId = '1540409721402691624';
  let assetVault = guild.channels.cache.find(c => c.name && c.name.includes('asset-vault'));
  if (!assetVault) {
    console.log('\n--- Creating 📦・asset-vault ---');
    try {
      assetVault = await guild.channels.create({
        name: '📦・asset-vault',
        type: ChannelType.GuildText,
        parent: creativeCatId,
        topic: 'Curated free editing assets: SFX packs, cinematic LUTs, overlays, fonts & presets.',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads]
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
          }
        ]
      });
      console.log(`✅ Created #📦・asset-vault (ID: ${assetVault.id})`);

      const vaultEmbed = new EmbedBuilder()
        .setColor(0x06B6D4)
        .setTitle('📦・EDITX CREATIVE ASSET VAULT')
        .setDescription(
          `Welcome to the **EDITX Asset Vault**! Here we drop curated, verified, high-value resources for video editors, motion designers, and sound engineers.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `### 🔊 Essential Sound FX Packs\n` +
          `▸ **Sonniss GDC Game Audio Archives** (Hundreds of GBs of 100% royalty-free cinematic whooshes, impacts, and ambiences): [sonniss.com/gameaudioarchive](https://sonniss.com/gameaudioarchive)\n` +
          `▸ **Freesound.org** (Collaborative database of CC audio samples & Foley): [freesound.org](https://freesound.org)\n\n` +
          `### 🎨 Cinematic LUTs & Color Grading\n` +
          `▸ **Kodak 2383 & Fuji Film Emulation Profiles** (Classic 35mm Hollywood film stock contrast curves)\n` +
          `▸ **Rec.709 Conversions** for S-Log3, C-Log, and D-Log M\n\n` +
          `### 🔤 Modern Creator Typography & Fonts\n` +
          `▸ **Monument Extended** (Heavy, bold editorial display typography)\n` +
          `▸ **Bebas Neue** (The staple bold sans-serif for YouTube thumbnails & pacing)\n` +
          `▸ **Clash Display** (Geometric neo-grotesque for modern tech & motion reels)\n\n` +
          `### 🎞️ Overlays & Textures\n` +
          `▸ **4K Film Grain (16mm & 35mm)** — blend using \`Overlay\` or \`Soft Light\` in Premiere/AE\n` +
          `▸ **Light Leaks & Prism Flares** — blend using \`Screen\` mode\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `-# 💡 *Staff regularly drops new presets, sound packs, and project templates here.*`
        )
        .setFooter({ text: 'EDITX | The Creative Network • Resource Hub' })
        .setTimestamp();

      await assetVault.send({ embeds: [vaultEmbed] });
      console.log('✅ Posted Starter Asset Vault Pack');
    } catch (e) {
      console.error(`⚠️ Could not create asset vault: ${e.message}`);
    }
  } else {
    console.log(`⏭️ #📦・asset-vault already exists (ID: ${assetVault.id})`);
  }

  // 4. Ensure VIP Booster Lounge Channel Exists
  let boosterLounge = guild.channels.cache.find(c => c.name && c.name.includes('booster-lounge'));
  const boosterRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('booster'));
  if (!boosterLounge && boosterRole) {
    console.log('\n--- Creating 💎・booster-lounge ---');
    try {
      boosterLounge = await guild.channels.create({
        name: '💎・booster-lounge',
        type: ChannelType.GuildText,
        parent: creativeCatId,
        topic: 'Exclusive private sanctuary for EDITX Server Boosters and VIP supporters.',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: boosterRole.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.UseExternalEmojis
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks
            ]
          }
        ]
      });
      console.log(`✅ Created #💎・booster-lounge (ID: ${boosterLounge.id})`);

      const boosterEmbed = new EmbedBuilder()
        .setColor(0xF47FFF)
        .setTitle('💎・EXCLUSIVE BOOSTER & VIP LOUNGE')
        .setDescription(
          `Welcome to the **EDITX VIP Sanctuary**!\n\n` +
          `This private lounge is reserved exclusively for our **Server Boosters** whose support unlocked **Level 1** perks for the entire network.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `### 💎 Your Booster Perks:\n` +
          `▸ **Private Lounge Access**: Direct line to discuss upcoming studio initiatives and projects.\n` +
          `▸ **High-Priority Feedback**: Drop your edits here for direct, prioritized review from experienced staff.\n` +
          `▸ **Enhanced Audio Quality**: Enjoy 128 Kbps pristine audio across all studio voice channels.\n` +
          `▸ **Custom Role Color & Hoist**: Stand out proudly at the top of the member directory.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `-# 💖 *Thank you for fueling the growth of EDITX | The Creative Network!*`
        )
        .setFooter({ text: 'EDITX VIP Club • Server Booster Perks' })
        .setTimestamp();

      await boosterLounge.send({ embeds: [boosterEmbed] });
      console.log('✅ Posted Booster Lounge Welcome Card');
    } catch (e) {
      console.error(`⚠️ Could not create booster lounge: ${e.message}`);
    }
  } else if (boosterLounge) {
    console.log(`⏭️ #💎・booster-lounge already exists (ID: ${boosterLounge.id})`);
  }

  console.log('\n🎉 ALL MINIMALIST STUDIO TRANSFORMATION ACTIONS COMPLETED!');
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits, 
  EmbedBuilder 
} = require('discord.js');

const QuickSetupModule = require('../modules/quick_setup');
const DecorationModule = require('../modules/decoration');
const JSONDatabase = require('../database');
const db = {
  config: new JSONDatabase('config'),
  xp: new JSONDatabase('xp'),
  security: new JSONDatabase('security'),
  cases: new JSONDatabase('cases'),
  tickets: new JSONDatabase('tickets'),
  invites: new JSONDatabase('invites'),
  roles: new JSONDatabase('roles'),
  utility: new JSONDatabase('utility'),
  giveaways: new JSONDatabase('giveaways'),
  starboard: new JSONDatabase('starboard'),
  tags: new JSONDatabase('tags'),
  verification: new JSONDatabase('verification'),
  social: new JSONDatabase('social'),
  hiring: new JSONDatabase('hiring'),
  dm: new JSONDatabase('dm')
};

const EDITS_GUILD_ID = '1553818924314001450';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
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

  console.log(`\n💎 Beginning Complete Server Setup for: "${guild.name}" (ID: ${guild.id})`);

  // 1. Rename existing Categories to Minimalist Studio Format
  const catRenames = {
    'Information': '── ✦ I N F O R M A T I O N ──',
    'Text Channels': '── 🎬 C R E A T I V E  S U I T E ──',
    'Voice Channels': '── 🔊 S T U D I O  L O U N G E ──'
  };

  for (const cat of guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()) {
    const targetName = catRenames[cat.name];
    if (targetName && cat.name !== targetName) {
      try {
        await cat.setName(targetName, 'EditX Server Initialization');
        console.log(`✅ Category [${cat.name}] ➔ [${targetName}]`);
        await sleep(1000);
      } catch (e) {
        console.warn(`⚠️ Could not rename category ${cat.name}: ${e.message}`);
      }
    }
  }

  // 2. Rename existing channels to sleek names
  const chanRenames = {
    'welcome-and-rules': '📜・rules-and-guidelines',
    'announcements': '📢・announcements',
    'general': '☕・the-cutting-room',
    'ideas-and-feedback': '🎞️・timeline-critique',
    'events': '🎬・creations-showcase',
    'Lounge': '☕・Creator Lounge',
    'Community Hangout': '🎧・Edit In Silence (Lo-Fi)',
    'Stream Room': '🎙️・Screen Share & Collab'
  };

  for (const ch of guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).values()) {
    const targetName = chanRenames[ch.name];
    if (targetName && ch.name !== targetName) {
      try {
        await ch.setName(targetName, 'EditX Server Initialization');
        console.log(`✅ Channel [#${ch.name}] ➔ [#${targetName}]`);
        await sleep(1000);
      } catch (e) {
        console.warn(`⚠️ Could not rename channel #${ch.name}: ${e.message}`);
      }
    }
  }

  // 3. Ensure Welcome Channel Exists in Information
  const infoCat = guild.channels.cache.find(c => c.name.includes('INFORMATION') && c.type === ChannelType.GuildCategory);
  let welcomeChan = guild.channels.cache.find(c => c.name.includes('welcome-hub'));
  if (!welcomeChan) {
    try {
      welcomeChan = await guild.channels.create({
        name: '👋・welcome-hub',
        type: ChannelType.GuildText,
        parent: infoCat?.id,
        topic: 'Official welcome gate for new creators and editors'
      });
      console.log(`✅ Created #${welcomeChan.name}`);
      await sleep(1000);
    } catch (e) {
      console.warn(`⚠️ Could not create welcome-hub: ${e.message}`);
    }
  }

  // 4. Ensure Select Roles Channel Exists
  let rolesChan = guild.channels.cache.find(c => c.name.includes('select-roles') || c.name.includes('roles'));
  if (!rolesChan) {
    try {
      rolesChan = await guild.channels.create({
        name: '🎭・select-roles',
        type: ChannelType.GuildText,
        parent: infoCat?.id,
        topic: 'Self-assignable editing crafts, software suites, and notification pings'
      });
      console.log(`✅ Created #${rolesChan.name}`);
      await sleep(1000);
    } catch (e) {
      console.warn(`⚠️ Could not create select-roles: ${e.message}`);
    }
  }

  // 5. Ensure Marketplace Category & Channels Exist
  let marketCat = guild.channels.cache.find(c => c.name.includes('MARKETPLACE') && c.type === ChannelType.GuildCategory);
  if (!marketCat) {
    try {
      marketCat = await guild.channels.create({
        name: '── 💼 M A R K E T P L A C E ──',
        type: ChannelType.GuildCategory
      });
      console.log(`✅ Created Category [${marketCat.name}]`);
      await sleep(1000);
    } catch (e) {}
  }

  const marketChannels = [
    { name: '💼・client-job-board', topic: 'Looking to hire editors, animators or designers' },
    { name: '🎨・freelancer-portfolios', topic: 'Editors and creators offering services and portfolios' },
    { name: '⭐・client-vouches', topic: 'Client feedback and vouches for freelancers' },
    { name: '🚀・self-promotions', topic: 'Share social media links, YouTube channels, and reels' }
  ];

  for (const mc of marketChannels) {
    let exists = guild.channels.cache.find(c => c.name === mc.name);
    if (!exists) {
      try {
        const c = await guild.channels.create({
          name: mc.name,
          type: ChannelType.GuildText,
          parent: marketCat?.id,
          topic: mc.topic
        });
        console.log(`✅ Created #${c.name}`);
        await sleep(1000);
      } catch (e) {
        console.warn(`⚠️ Could not create ${mc.name}: ${e.message}`);
      }
    }
  }

  // 6. Ensure Asset Vault Exists in Creative Suite
  const creativeCat = guild.channels.cache.find(c => c.name.includes('CREATIVE') && c.type === ChannelType.GuildCategory);
  let assetVault = guild.channels.cache.find(c => c.name.includes('asset-vault'));
  if (!assetVault) {
    try {
      assetVault = await guild.channels.create({
        name: '📦・asset-vault',
        type: ChannelType.GuildText,
        parent: creativeCat?.id,
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
      console.log(`✅ Created #${assetVault.name}`);

      const vaultEmbed = new EmbedBuilder()
        .setColor(0x06B6D4)
        .setTitle('📦・CREATIVE ASSET VAULT')
        .setDescription(
          `Welcome to the **Asset Vault**! Here we drop curated, verified, high-value resources for video editors, motion designers, and sound engineers.\n\n` +
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
        .setFooter({ text: `${guild.name} • Resource Hub` })
        .setTimestamp();

      await assetVault.send({ embeds: [vaultEmbed] });
      console.log('✅ Posted Starter Asset Vault Pack');
      await sleep(1000);
    } catch (e) {
      console.warn(`⚠️ Could not create asset vault: ${e.message}`);
    }
  }

  // 7. Ensure Modlogs channel exists in Headquarters
  let hqCat = guild.channels.cache.find(c => c.name.includes('HEADQUARTERS') || c.name.includes('STAFF'));
  if (!hqCat) {
    try {
      hqCat = await guild.channels.create({
        name: '── 🛡️ H E A D Q U A R T E R S ──',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ]
      });
      console.log(`✅ Created Category [${hqCat.name}]`);
      await sleep(1000);
    } catch (e) {}
  }

  // Move bot-memory, bot-rules, dm-reports under Headquarters if not already
  const hqChannelNames = ['bot-memory', 'bot-rules', 'dm-reports'];
  for (const name of hqChannelNames) {
    const ch = guild.channels.cache.find(c => c.name.includes(name));
    if (ch && hqCat && ch.parentId !== hqCat.id) {
      try {
        await ch.setParent(hqCat.id, { lockPermissions: false });
        await sleep(800);
      } catch (e) {}
    }
  }

  let modlogsChan = guild.channels.cache.find(c => c.name.includes('modlogs') || c.name.includes('mod-logs'));
  if (!modlogsChan && hqCat) {
    try {
      modlogsChan = await guild.channels.create({
        name: '🛡️・modlogs',
        type: ChannelType.GuildText,
        parent: hqCat.id,
        topic: 'Automated audit and moderation security logs'
      });
      console.log(`✅ Created #${modlogsChan.name}`);
      await sleep(1000);
    } catch (e) {}
  }

  // 8. Initialize Default Roles
  console.log('\n--- Initializing Server Roles & Badges ---');
  const quickSetup = new QuickSetupModule(client, db);
  const createdRoles = await quickSetup.createDefaultRoles(guild);
  console.log(`✅ Verified/Created ${createdRoles.length} core roles`);

  // 9. Deploy Interactive Role Panels
  if (rolesChan) {
    console.log('\n--- Deploying Reaction Role Menus ---');
    try {
      await quickSetup.deployReactionRoles(guild, rolesChan);
      console.log(`✅ Deployed Interactive Role Menus in #${rolesChan.name}`);
    } catch (e) {
      console.warn(`⚠️ Role deployment notice: ${e.message}`);
    }
  }

  // 10. Post Official Rules Card in rules-and-guidelines
  const rulesChan = guild.channels.cache.find(c => c.name.includes('rules'));
  if (rulesChan) {
    try {
      const dec = new DecorationModule(client, db);
      const rulesEmbed = dec.getEmbedTemplate('rules', guild);
      await rulesChan.send({ embeds: [rulesEmbed] });
      console.log(`✅ Posted Official Rules Card in #${rulesChan.name}`);
    } catch (e) {}
  }

  // 11. Run Auto-Pilot Engine to Bind All Systems
  console.log('\n--- Activating 100% Autonomous Auto-Pilot ---');
  const autoPilotResults = await quickSetup.runAutoPilot(guild, true);
  console.log('Auto-Pilot Results:', JSON.stringify(autoPilotResults, null, 2));

  console.log(`\n🎉 SERVER SETUP COMPLETED FOR "${guild.name}"!`);
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);

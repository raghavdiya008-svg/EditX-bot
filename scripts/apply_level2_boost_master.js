require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  EmbedBuilder 
} = require('discord.js');
const { 
  createRoleIcon, 
  createCreatorEmoji, 
  createEditorSticker, 
  downloadFile 
} = require('./level2_asset_generator');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const EDITX_GUILD_ID = '1538957031455596544';
const rest = new REST({ version: '10' }).setToken(TOKEN);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(EDITX_GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

  // ==========================================
  // PHASE 1: CUSTOM ROLE ICONS (PNG Badges)
  // ==========================================
  console.log('\n--- PHASE 1: ASSIGNING CUSTOM ROLE ICONS ---');
  const roles = await guild.roles.fetch();

  const roleMap = [
    { id: '1538964378026516673', type: 'admin', name: '👑 Admin' },
    { id: '1538964380090245221', type: 'mod', name: '🛡️ Moderator' },
    { id: '1550881183254974589', type: 'staff', name: '🛡️ Staff' },
    { id: '1538964382157906071', type: 'video', name: '🎬 Video Editor' },
    { id: '1538964384158851243', type: 'photo', name: '📸 Photo Editor' },
    { id: '1538964386335690772', type: 'graphics', name: '🎨 Graphic Designer' },
    { id: '1538964388059553942', type: 'animator', name: '💫 Animator' },
    { id: '1538964389921816627', type: 'motion', name: '✨ Motion Designer' },
    { id: '1538964392337612931', type: 'client', name: '💼 Client' },
    { id: '1538964396095840466', type: 'ae', name: '⚡ After Effects' },
    { id: '1538964399753011321', type: 'pr', name: '🎞️ Premiere Pro' },
    { id: '1538964401732853871', type: 'davinci', name: '🎛️ Davinci Resolve' },
    { id: '1538964403649511477', type: 'capcut', name: '📱 CapCut' },
    { id: '1538964409043521766', type: 'ps', name: '🖌️ Photoshop' }
  ];

  for (const item of roleMap) {
    const role = roles.get(item.id);
    if (!role) continue;
    try {
      console.log(`Setting Role Icon for ${item.name}...`);
      const iconBuf = createRoleIcon(item.type);
      await role.setIcon(iconBuf, 'EDITX Level 2 Boost Custom Role Icon');
      console.log(` -> Set icon for ${item.name}!`);
      await sleep(1000);
    } catch (err) {
      console.error(` -> Failed setting icon for ${item.name}:`, err.message);
    }
  }

  // ==========================================
  // PHASE 2: MEME SOUNDBOARD SOUNDS
  // ==========================================
  console.log('\n--- PHASE 2: INSTALLING FAMOUS MEME SOUNDBOARD SOUNDS ---');
  let currentSounds = await rest.get(Routes.guildSoundboardSounds(EDITX_GUILD_ID));
  const existingNames = new Set((currentSounds.items || currentSounds || []).map(s => s.name));

  const memeSounds = [
    {
      name: 'Taco Bell Bong',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Taco%20Bell%20Bong.mp3',
      emoji: '🔔'
    },
    {
      name: 'Bruh',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Bruh.mp3',
      emoji: '🗿'
    },
    {
      name: 'Anime Wow',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Anime%20Wow.mp3',
      emoji: '✨'
    },
    {
      name: 'Roblox Oof',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Roblox%20Oof.mp3',
      emoji: '💀'
    },
    {
      name: 'Minecraft Oof',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Minecraft%20Oof.mp3',
      emoji: '⛏️'
    },
    {
      name: 'Wasted',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Wasted.mp3',
      emoji: '🚗'
    },
    {
      name: 'FBI Open Up',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/FBI%20Open%20Up.mp3',
      emoji: '🚨'
    },
    {
      name: 'Discord Ping',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Discord%20Ping.mp3',
      emoji: '🔔'
    },
    {
      name: 'Yeah Babyy',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Yeah%20Babyy.mp3',
      emoji: '🎉'
    },
    {
      name: 'Hitmarker',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Hitmarker.wav',
      emoji: '🎯'
    },
    {
      name: 'PS2 Startup',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/PS2%20Startup.mp3',
      emoji: '🎮'
    },
    {
      name: 'Click Noice',
      url: 'https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/Click%2C%20Noice.wav',
      emoji: '👌'
    }
  ];

  for (const sound of memeSounds) {
    if (existingNames.has(sound.name)) {
      console.log(`Sound "${sound.name}" already installed.`);
      continue;
    }
    try {
      console.log(`Downloading and installing sound: ${sound.name}...`);
      const audioBuf = await downloadFile(sound.url);
      const isWav = sound.url.endsWith('.wav');
      const mime = isWav ? 'audio/wav' : 'audio/mp3';
      const base64Audio = `data:${mime};base64,` + audioBuf.toString('base64');

      await rest.post(Routes.guildSoundboardSounds(EDITX_GUILD_ID), {
        body: {
          name: sound.name,
          sound: base64Audio,
          volume: 1,
          emoji_name: sound.emoji
        }
      });
      console.log(` -> Sound "${sound.name}" added successfully!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed adding sound "${sound.name}":`, err.message);
    }
  }

  // ==========================================
  // PHASE 3: CUSTOM EMOJIS (Animated & Creator)
  // ==========================================
  console.log('\n--- PHASE 3: INSTALLING CUSTOM EMOJIS ---');
  const existingEmojis = await guild.emojis.fetch();
  const existingEmojiNames = new Set(existingEmojis.map(e => e.name));

  // 3a. Animated Emojis from web
  const animatedList = [
    {
      name: 'party_parrot',
      url: 'https://cultofthepartyparrot.com/parrots/parrot.gif'
    },
    {
      name: 'fiesta_parrot',
      url: 'https://cultofthepartyparrot.com/parrots/fiestaparrot.gif'
    },
    {
      name: 'pepe_sip',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngerySip.png'
    },
    {
      name: 'pepe_tuxedo',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryTuxedo.png'
    }
  ];

  for (const emo of animatedList) {
    if (existingEmojiNames.has(emo.name)) {
      console.log(`Emoji :${emo.name}: already exists.`);
      continue;
    }
    try {
      console.log(`Installing emoji :${emo.name}:...`);
      const buf = await downloadFile(emo.url);
      await guild.emojis.create({ attachment: buf, name: emo.name });
      console.log(` -> Emoji :${emo.name}: uploaded!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed uploading emoji :${emo.name}:`, err.message);
    }
  }

  // 3b. High-Res Canvas Creator Emojis
  const creatorEmojiList = ['w_edit', 'fire_cut', 'render_error', 'render_100', 'timeline_keyframe'];
  for (const cName of creatorEmojiList) {
    if (existingEmojiNames.has(cName)) {
      console.log(`Emoji :${cName}: already exists.`);
      continue;
    }
    try {
      console.log(`Creating creator emoji :${cName}:...`);
      const buf = createCreatorEmoji(cName);
      await guild.emojis.create({ attachment: buf, name: cName });
      console.log(` -> Creator Emoji :${cName}: uploaded!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed uploading creator emoji :${cName}:`, err.message);
    }
  }

  // ==========================================
  // PHASE 4: CUSTOM STICKERS
  // ==========================================
  console.log('\n--- PHASE 4: INSTALLING CUSTOM STICKERS ---');
  let stickers = await guild.stickers.fetch();
  const existingStickerNames = new Set(stickers.map(s => s.name));

  const stickerList = [
    {
      name: 'W Edit',
      tags: 'w_edit',
      description: 'Verified W video edit',
      key: 'w_edit_sticker'
    },
    {
      name: 'AE Not Responding',
      tags: 'error',
      description: 'After Effects render crashed',
      key: 'ae_not_responding'
    },
    {
      name: 'One Last Revision',
      tags: 'client',
      description: 'Client asks for another revision',
      key: 'one_last_revision'
    }
  ];

  for (const stk of stickerList) {
    if (existingStickerNames.has(stk.name)) {
      console.log(`Sticker "${stk.name}" already exists.`);
      continue;
    }
    try {
      console.log(`Creating sticker "${stk.name}"...`);
      const buf = createEditorSticker(stk.key);
      await guild.stickers.create({
        file: buf,
        name: stk.name,
        tags: stk.tags,
        description: stk.description
      });
      console.log(` -> Sticker "${stk.name}" uploaded!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed uploading sticker "${stk.name}":`, err.message);
    }
  }

  // ==========================================
  // PHASE 5: ASSET VAULT 50MB ANNOUNCEMENT
  // ==========================================
  console.log('\n--- PHASE 5: POSTING 50MB ASSET VAULT HIGHLIGHT ---');
  const channels = await guild.channels.fetch();
  const assetVault = channels.find(c => c && c.name.includes('asset-vault'));
  if (assetVault) {
    const vaultEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📦 EDITX Level 2 Asset Vault — 50MB Direct Uploads Active!')
      .setDescription(
        'Thanks to our **Level 2 Server Boost**, our server upload limit is permanently elevated to **50MB**!\n\n' +
        '**What you can drop directly in this channel:**\n' +
        '• 🎬 Raw project files (`.prproj`, `.aep`, `.drp`)\n' +
        '• 🎨 High-res LUT bundles & Color Grade presets\n' +
        '• 🎞️ 4K Textures, Film Overlays, Glitch & Light Leaks\n' +
        '• 🔊 High-fidelity SFX packs, Whooshes & Riser stems\n' +
        '• ⚡ Transition packs & Sapphire / Boris FX presets\n\n' +
        '> 💡 *Tip: Direct uploads up to 50MB mean no external Google Drive links required!*'
      )
      .setFooter({ text: 'EDITX Network • Powered by Level 2 Boost' })
      .setTimestamp();

    await assetVault.send({ embeds: [vaultEmbed] }).catch(() => null);
    console.log(' -> Asset vault highlight posted!');
  }

  console.log('\n[SUCCESS] ALL LEVEL 2 BOOST PERKS & MASTER ASSETS DEPLOYED!');
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});

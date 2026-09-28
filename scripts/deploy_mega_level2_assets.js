require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes 
} = require('discord.js');
const { createCanvas } = require('canvas');
const https = require('https');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const EDITX_GUILD_ID = '1538957031455596544';
const rest = new REST({ version: '10' }).setToken(TOKEN);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url} (HTTP ${res.statusCode})`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
});

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(EDITX_GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name}`);

  // ==========================================
  // PART 1: MASSIVE MEME SOUNDBOARD POPULATION
  // ==========================================
  console.log('\n--- 1. POPULATING MEME SOUNDBOARD ---');
  let currentSounds = await rest.get(Routes.guildSoundboardSounds(EDITX_GUILD_ID));
  const existingSoundNames = new Set((currentSounds.items || currentSounds || []).map(s => s.name));

  const memeSoundsList = [
    { name: 'Hello There', file: 'Hello%20There.mp3', emoji: '👋' },
    { name: 'Megalovania', file: 'Megalovania.mp3', emoji: '💀' },
    { name: 'Nut', file: 'Nut.mp3', emoji: '🌰' },
    { name: 'Perfect', file: 'Perfect%20-%20Street%20Fighter.mp3', emoji: '🥊' },
    { name: 'What The Heck', file: 'What%20In%20The%20Fuck%20Was%20That.mp3', emoji: '❓' },
    { name: 'Jontron What', file: 'Jontron%20What.mp3', emoji: '🦅' },
    { name: 'What Is This', file: 'What%20The%20Hell%20Is%20This.mp3', emoji: '🧐' },
    { name: 'Screm', file: 'Screm.mp3', emoji: '😱' },
    { name: 'Creeper', file: 'Creeper%20-%20Minecraft.mp3', emoji: '💣' },
    { name: 'Kids Cheering', file: 'Kids%20Cheering.mp3', emoji: '🎉' },
    { name: 'Item Catch', file: 'Item%20Catch.mp3', emoji: '💎' },
    { name: 'Losing Horn', file: 'Losing%20Horn%20-%20The%20Price%20Is%20Right.mp3', emoji: '🎺' },
    { name: 'Discord Call', file: 'DiscordCall.mp3', emoji: '📞' },
    { name: 'Whats Up', file: 'Whats%20Up%20Fuckers.mp3', emoji: '😎' },
    { name: 'Triple MLG', file: 'OH%20BABY%20A%20TRIPLE%20-%20MLG%20Sound%20Effects%20(HD).mp3', emoji: '🎯' },
    { name: 'Beans', file: 'Beans.mp3', emoji: '🥫' },
    { name: 'GTA Here We Go', file: 'Ah%20Shit%2C%20Here%20We%20Go%20Again%20-%20GTA%20IV.mp3', emoji: '🚶' }
  ];

  for (const s of memeSoundsList) {
    if (existingSoundNames.has(s.name)) {
      console.log(`Sound "${s.name}" already installed.`);
      continue;
    }
    try {
      console.log(`Installing Soundboard: ${s.name}...`);
      const url = `https://raw.githubusercontent.com/jschiro99/MemeSoundboard/main/Soundboard/${s.file}`;
      const buf = await downloadFile(url);
      const base64Audio = `data:audio/mp3;base64,` + buf.toString('base64');
      await rest.post(Routes.guildSoundboardSounds(EDITX_GUILD_ID), {
        body: {
          name: s.name,
          sound: base64Audio,
          volume: 1,
          emoji_name: s.emoji
        }
      });
      console.log(` -> Sound "${s.name}" successfully added!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed adding sound "${s.name}":`, err.message);
    }
  }

  // ==========================================
  // PART 2: ANIMATED & REAL MEME EMOJIS
  // ==========================================
  console.log('\n--- 2. INSTALLING VIRAL ANIMATED & PEPE EMOJIS ---');
  const existingEmojis = await guild.emojis.fetch();
  const existingEmojiNames = new Set(existingEmojis.map(e => e.name));

  const viralEmojiList = [
    // Animated Blobs & Cats
    { name: 'bongo_blob', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Bongo/ablobbongo.gif' },
    { name: 'bongo_fast', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Bongo/ablobbongofastree.gif' },
    { name: 'blob_cry', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Bongo/ablobbongocrying.gif' },
    { name: 'blob_love', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Bongo/ablobbongolove.gif' },
    { name: 'cat_bongo', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatbongo.gif' },
    { name: 'cat_coffee', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatcoffee.gif' },
    { name: 'cat_heart', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatheart.gif' },
    { name: 'cat_bop', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatbop.gif' },
    { name: 'blob_fire', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tblobonfire.gif' },
    { name: 'blob_rage', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tblobcontrollerthrow.gif' },
    { name: 'blob_shake', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tblobheadshake.gif' },
    { name: 'blob_party', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tbolbpartyattention.gif' },
    { name: 'blob_yeet', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/ablobyeet.gif' },

    // Real Pepe Emojis
    { name: 'pepe_angel', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_Angel.png' },
    { name: 'pepe_angery', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_Angery.png' },
    { name: 'pepe_cry', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryCry.png' },
    { name: 'pepe_sword', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryDiamondSword.png' },
    { name: 'pepe_police', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryPolice.png' },
    { name: 'pepe_amateur', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_Amateur.png' },
    { name: 'pepe_vampire', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngeryVampire.png' },
    { name: 'pepe_chef', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngeryChef.png' },
    { name: 'pepe_sleep', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngerySleep.png' },
    { name: 'pepe_vacation', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngeryVacation.png' },
    { name: 'pepe_amongus', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_AmongUs.png' },
    { name: 'pepe_cowboy', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_BlushCowboy.png' },
    { name: 'pepe_rich', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_BlushRich.png' },
    { name: 'pepe_banana', url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_Banana.png' },

    // Meme Blobs
    { name: 'blob_champ', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/blobchamp.png' },
    { name: 'blob_dab', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/blobdab.png' },
    { name: 'blob_angy', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/blobangy.png' },
    { name: 'blob_cuphead', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Gaming/blobcuphead.png' },
    { name: 'blob_goomba', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Gaming/blobgoomba.png' },
    { name: 'blob_bomberman', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Gaming/blobbomberman.png' }
  ];

  for (const emo of viralEmojiList) {
    if (existingEmojiNames.has(emo.name)) {
      console.log(`Emoji :${emo.name}: already exists.`);
      continue;
    }
    try {
      console.log(`Uploading Emoji :${emo.name}:...`);
      const buf = await downloadFile(emo.url);
      await guild.emojis.create({ attachment: buf, name: emo.name });
      console.log(` -> Emoji :${emo.name}: added!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed emoji :${emo.name}:`, err.message);
    }
  }

  // ==========================================
  // PART 3: REAL VIRAL STICKERS (320x320)
  // ==========================================
  console.log('\n--- 3. INSTALLING VIRAL MEME STICKERS ---');
  let stickers = await guild.stickers.fetch();
  const existingStickerNames = new Set(stickers.map(s => s.name));

  // Helper to convert any image buffer into a 320x320 sticker with padding
  const { loadImage } = require('canvas');
  async function makeStickerFromImage(imgBuf, title) {
    const canvas = createCanvas(320, 320);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 320, 320);

    const img = await loadImage(imgBuf);
    const aspect = img.width / img.height;
    let drawW = 280;
    let drawH = 280;
    if (aspect > 1) {
      drawH = 280 / aspect;
    } else {
      drawW = 280 * aspect;
    }
    const x = (320 - drawW) / 2;
    const y = (320 - drawH) / 2;
    ctx.drawImage(img, x, y, drawW, drawH);

    return canvas.toBuffer('image/png');
  }

  const stickerCandidates = [
    {
      name: 'Pepe Rich',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_BlushRich.png',
      tags: 'pepe',
      desc: 'Pepe looking rich with cash'
    },
    {
      name: 'Pepe Cowboy',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_BlushCowboy.png',
      tags: 'pepe',
      desc: 'Howdy Pepe cowboy'
    },
    {
      name: 'Blob Champ',
      url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/blobchamp.png',
      tags: 'pog',
      desc: 'Poggers champion blob'
    },
    {
      name: 'Pepe Cry',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryCry.png',
      tags: 'cry',
      desc: 'Pepe crying tears'
    },
    {
      name: 'Pepe Police',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryPolice.png',
      tags: 'police',
      desc: 'Stop right there officer Pepe'
    },
    {
      name: 'Blob Dab',
      url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Meme/blobdab.png',
      tags: 'dab',
      desc: 'Blob dabbing on haters'
    }
  ];

  for (const s of stickerCandidates) {
    if (existingStickerNames.has(s.name)) {
      console.log(`Sticker "${s.name}" already installed.`);
      continue;
    }
    try {
      console.log(`Creating and uploading sticker: ${s.name}...`);
      const rawBuf = await downloadFile(s.url);
      const stickerBuf = await makeStickerFromImage(rawBuf, s.name);
      await guild.stickers.create({
        file: stickerBuf,
        name: s.name,
        tags: s.tags,
        description: s.desc
      });
      console.log(` -> Sticker "${s.name}" added successfully!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed adding sticker "${s.name}":`, err.message);
    }
  }

  console.log('\n[SUCCESS] MEGA ASSET POPULATION COMPLETE!');
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});

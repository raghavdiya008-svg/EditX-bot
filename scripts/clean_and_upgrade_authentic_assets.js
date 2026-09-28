require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const https = require('https');
const { createCanvas, loadImage } = require('canvas');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const EDITX_GUILD_ID = '1538957031455596544';

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

async function makeStickerFromImage(imgBuf) {
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

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
});

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(EDITX_GUILD_ID);
  const g = await guild.fetch();
  console.log(`[CONNECTED] Guild: ${guild.name}`);

  // 1. Delete flat bot emojis
  const emojis = await g.emojis.fetch();
  const botEmojiNames = ['w_edit', 'fire_cut', 'render_error', 'render_100', 'timeline_keyframe'];
  for (const name of botEmojiNames) {
    const e = emojis.find(x => x.name === name);
    if (e) {
      await e.delete('Removing flat canvas bot emoji');
      console.log(`Deleted flat emoji :${name}:`);
      await sleep(1000);
    }
  }

  // 2. Delete flat bot stickers
  const stickers = await g.stickers.fetch();
  const botStickerNames = ['W Edit', 'AE Not Responding', 'One Last Revision'];
  for (const name of botStickerNames) {
    const s = stickers.find(x => x.name === name);
    if (s) {
      await s.delete('Removing flat canvas bot sticker');
      console.log(`Deleted flat sticker "${name}"`);
      await sleep(1000);
    }
  }

  // 3. Add more real animated GIFs
  const moreAnimated = [
    { name: 'conga_parrot', url: 'https://cultofthepartyparrot.com/parrots/hd/congaparrot.gif' },
    { name: 'cat_bongo2', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatbongo2.gif' },
    { name: 'cat_grumpy', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Cats%201/ablobcatgrumpy.gif' },
    { name: 'blob_attention', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tbolbattentiontimo.gif' },
    { name: 'blob_knife', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Aniblobs/tblobknifepeek.gif' },
    { name: 'blob_bongo_lr', url: 'https://raw.githubusercontent.com/BlazeK1ng420/DiscordEmojis/master/px128/Bongo/ablobbongoLR.gif' }
  ];

  const existingEmojiNames = new Set((await g.emojis.fetch()).map(e => e.name));
  for (const a of moreAnimated) {
    if (existingEmojiNames.has(a.name)) continue;
    try {
      console.log(`Uploading real animated emoji :${a.name}:...`);
      const buf = await downloadFile(a.url);
      await g.emojis.create({ attachment: buf, name: a.name });
      console.log(` -> Uploaded :${a.name}:!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed :${a.name}:`, err.message);
    }
  }

  // 4. Add more real authentic Pepe stickers
  const newStickers = [
    {
      name: 'Pepe Chef',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngeryChef.png',
      tags: 'chef'
    },
    {
      name: 'Pepe Vacation',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%202/PES2_AngeryVacation.png',
      tags: 'vacation'
    },
    {
      name: 'Pepe AmongUs',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_AmongUs.png',
      tags: 'sus'
    },
    {
      name: 'Pepe Angel',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_Angel.png',
      tags: 'angel'
    },
    {
      name: 'Pepe Sword',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%201/PES_AngeryDiamondSword.png',
      tags: 'sword'
    },
    {
      name: 'Pepe Banana',
      url: 'https://raw.githubusercontent.com/Overimagine1/pepe-server-archive/main/Pepe%20Server%203/PES3_Banana.png',
      tags: 'banana'
    }
  ];

  const existingStickerNames = new Set((await g.stickers.fetch()).map(s => s.name));
  for (const s of newStickers) {
    if (existingStickerNames.has(s.name)) continue;
    try {
      console.log(`Uploading real meme sticker "${s.name}"...`);
      const raw = await downloadFile(s.url);
      const stickerBuf = await makeStickerFromImage(raw);
      await g.stickers.create({
        file: stickerBuf,
        name: s.name,
        tags: s.tags,
        description: `${s.name} meme sticker`
      });
      console.log(` -> Uploaded sticker "${s.name}"!`);
      await sleep(1500);
    } catch (err) {
      console.error(` -> Failed sticker "${s.name}":`, err.message);
    }
  }

  console.log('\n[SUCCESS] PURGED BOT EMOJIS & REPLACED WITH AUTHENTIC COMMUNITY ASSETS!');
  process.exit(0);
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});

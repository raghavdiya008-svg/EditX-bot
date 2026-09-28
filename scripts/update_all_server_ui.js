require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  AttachmentBuilder, 
  EmbedBuilder 
} = require('discord.js');
const { createCanvas } = require('canvas');
const { 
  createRulesBanner, 
  createRolesBanner, 
  createTicketsBanner, 
  createAssetVaultBanner, 
  createBoosterLoungeBanner, 
  createHoneypotBanner 
} = require('../modules/banner_generator');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function createCustomRoleIcon(type) {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  if (type === 'booster') {
    // Discord Nitro / Server Booster Crystal
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#FF73FA');
    grad.addColorStop(0.5, '#F43F5E');
    grad.addColorStop(1, '#8B5CF6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(58, 24);
    ctx.lineTo(32, 58);
    ctx.lineTo(6, 24);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💎', 32, 30);
  } else if (type === 'vegas') {
    // Sony Vegas Pro
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#0284C7');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.roundRect(4, 4, 56, 56, 10);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#38BDF8';
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VP', 32, 34);
  } else if (type === 'alight') {
    // Alight Motion
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#EC4899');
    grad.addColorStop(1, '#8B5CF6');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FBCFE8';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AM', 32, 34);
  } else if (type === 'lightroom') {
    // Adobe Lightroom "Lr"
    ctx.fillStyle = '#001E36';
    ctx.roundRect(4, 4, 56, 56, 10);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#31A8FF';
    ctx.stroke();

    ctx.fillStyle = '#31A8FF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Lr', 32, 34);
  } else if (type === 'canva') {
    // Canva Circle
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#00C4CC');
    grad.addColorStop(1, '#7D2AE8');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', 32, 34);
  } else if (type === 'gimp') {
    // GIMP Wilber
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#5C5446');
    grad.addColorStop(1, '#2F2B24');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#E2B883';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦊', 32, 34);
  } else if (type === 'ping_announcements') {
    // Cyber Cyan Announcement Bell
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#00E5FF');
    grad.addColorStop(1, '#007799');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E0F7FA';
    ctx.stroke();

    ctx.fillStyle = '#05111B';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📢', 32, 34);
  } else if (type === 'ping_giveaways') {
    // Neon Magenta Giveaway Gift
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#D946EF');
    grad.addColorStop(1, '#701A75');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FAE8FF';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎉', 32, 34);
  } else if (type === 'ping_resources') {
    // Amber Gold Asset Box
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#F59E0B');
    grad.addColorStop(1, '#78350F');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FEF3C7';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', 32, 34);
  } else if (type === 'ping_deadchat') {
    // Electric Coral Bolt
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#FF4565');
    grad.addColorStop(1, '#88001F');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFE4E6';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💬', 32, 34);
  } else if (type === 'ping_editoftheweek') {
    // Radiant Golden Trophy
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#FFD700');
    grad.addColorStop(1, '#B8860B');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFE0';
    ctx.stroke();

    ctx.fillStyle = '#261C02';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆', 32, 34);
  } else if (type === 'ping_editinghelp') {
    // Cyber Emerald Lightbulb
    const grad = ctx.createLinearGradient(0, 0, 64, 64);
    grad.addColorStop(0, '#10B981');
    grad.addColorStop(1, '#064E3B');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#D1FAE5';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💡', 32, 34);
  }

  return canvas.toBuffer('image/png');
}

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

  // ==========================================
  // PHASE 1: REMAINING ROLE ICONS
  // ==========================================
  console.log('\n--- PHASE 1: COMPLETING ROLE ICONS ---');
  const roles = await guild.roles.fetch();

  const missingRoleIcons = [
    { id: '1553787784177651838', type: 'booster', name: '💎・Server Booster' },
    { id: '1538964405507596378', type: 'vegas', name: '✂️ Sony Vegas' },
    { id: '1538964407206547559', type: 'alight', name: '✨ Alight Motion' },
    { id: '1538964410570383401', type: 'lightroom', name: '📷 Lightroom' },
    { id: '1538964413615313067', type: 'canva', name: '🎨 Canva' },
    { id: '1538964415854944376', type: 'gimp', name: '🖌️ Gimp' },
    { id: '1538964417717469277', type: 'ping_announcements', name: '📢 Announcements Ping' },
    { id: '1538964419718029474', type: 'ping_giveaways', name: '🎉 Giveaways Ping' },
    { id: '1538964421844668467', type: 'ping_resources', name: '📦 New Resources Ping' },
    { id: '1538964423887294525', type: 'ping_deadchat', name: '💬 Dead Chat Ping' },
    { id: '1538964425438924844', type: 'ping_editoftheweek', name: '🏆 Edit of the Week Ping' },
    { id: '1538964427246665860', type: 'ping_editinghelp', name: '💡 Editing Help Ping' }
  ];

  for (const item of missingRoleIcons) {
    const role = roles.get(item.id);
    if (!role) continue;
    try {
      console.log(`Setting custom role icon for [${item.name}]...`);
      const iconBuf = createCustomRoleIcon(item.type);
      await role.setIcon(iconBuf, 'EDITX Level 2 Boost Custom Role Icon');
      console.log(` -> Set icon for [${item.name}]!`);
      await sleep(1000);
    } catch (err) {
      console.error(` -> Failed for [${item.name}]:`, err.message);
    }
  }

  // ==========================================
  // PHASE 2: CHANNEL EMBEDS & UI UPGRADES
  // ==========================================
  console.log('\n--- PHASE 2: UPDATING CHANNEL EMBEDS & UI WITH RESTYLED BANNERS ---');

  // 1. Rules & Guidelines (1540409714289147904)
  try {
    const rulesChan = await guild.channels.fetch('1540409714289147904');
    console.log(`Updating UI in #${rulesChan.name}...`);
    const rulesBannerBuf = createRulesBanner();
    const rulesAttachment = new AttachmentBuilder(rulesBannerBuf, { name: 'banner_rules.png' });

    const rulesEmbed = new EmbedBuilder()
      .setColor(0x00E5FF)
      .setTitle('📜・COMMUNITY GUIDELINES & DIRECTIVES')
      .setDescription(
        `### 🌐 EDITX CREATIVE NETWORK STANDARDS\n\n` +
        `> Welcome to **EDITX | The Creative Network**. To cultivate a premier environment for editors, motion designers, VFX artists, and creators, all members must abide by these directives.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `### 1. 🛡️ Professional Conduct & Zero Harassment\n` +
        `Treat every creator with mutual respect. Hate speech, racism, slurs, doxxing threats, targeted toxicity, or unsolicited sexual content will trigger an **immediate permanent ban**.\n\n` +
        `### 2. 🚫 Zero Scam, Phishing, or Rogue Links\n` +
        `Posting unverified external downloads, token grabbers, fake Nitro gifts, or crypto promotions is strictly prohibited and continuously monitored by our security Sentinel.\n\n` +
        `### 3. 🎬 Creative Integrity & Constructive Feedback\n` +
        `Only upload work you created, edited, or have explicit rights to. In critique channels, offer thoughtful, constructive advice on pacing, transitions, and audio rather than low-effort negativity.\n\n` +
        `### 4. 📁 Channel Purpose & Asset Hygiene\n` +
        `Keep discussions within their designated spaces. Showcase edits in creative channels, keep casual talk in <#1540409723130617976>, and download resources in <#1553832430618681394>.\n\n` +
        `### 5. ⚖️ Staff Authority & Security Compliance\n` +
        `Follow moderator directives. If you detect compromised accounts or raiders, open an instant confidential ticket in <#1540414017733140560>.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `-# 💎 *EDITX Studio System • Level 2 Boosted Network*`
      )
      .setImage('attachment://banner_rules.png')
      .setFooter({
        text: 'EDITX | The Creative Network • Official Directives',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const rulesMsg = await rulesChan.messages.fetch('1548735133845037159').catch(() => null);
    if (rulesMsg) {
      await rulesMsg.edit({ embeds: [rulesEmbed], files: [rulesAttachment] });
      console.log('✅ Rules message edited with restyled banner!');
    } else {
      await rulesChan.send({ embeds: [rulesEmbed], files: [rulesAttachment] });
      console.log('✅ Rules message posted with restyled banner!');
    }
  } catch (err) {
    console.error('⚠️ Rules UI update error:', err.message);
  }
  await sleep(1500);

  // 2. Select Roles (1540409719716454490)
  try {
    const rolesChan = await guild.channels.fetch('1540409719716454490');
    console.log(`Updating UI in #${rolesChan.name}...`);
    const rolesBannerBuf = createRolesBanner();
    const rolesAttachment = new AttachmentBuilder(rolesBannerBuf, { name: 'banner_roles.png' });

    const rolesEmbed = new EmbedBuilder()
      .setColor(0xD946EF)
      .setTitle('✨・CREATIVE SKILL & SOFTWARE ROLES')
      .setDescription(
        `### 🎨 BUILD YOUR CREATIVE IDENTITY\n\n` +
        `> Personalize your profile! Choose your creative disciplines and primary editing software suites below. Your selections automatically grant specialized access, showcase tags, and event pings.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `▸ 🎨 **Creative Disciplines**: Video Editor, Photo Editor, Graphic Designer, Animator, Motion Designer\n` +
        `▸ ⚡ **Editing Suites**: After Effects, Premiere Pro, DaVinci Resolve, Photoshop, CapCut\n` +
        `▸ 🔔 **Notification Pings**: Announcements, Giveaways, Resource Drops, Editing Help\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `-# 💡 *Select options from the dropdown menus below to toggle roles on/off instantly.*`
      )
      .setImage('attachment://banner_roles.png')
      .setFooter({
        text: 'EDITX Creator Station • Interactive Self-Roles',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const roleMsg = await rolesChan.messages.fetch('1548964613750530079').catch(() => null);
    if (roleMsg) {
      await roleMsg.edit({ 
        embeds: [rolesEmbed], 
        files: [rolesAttachment],
        components: roleMsg.components 
      });
      console.log('✅ Role selection message edited with restyled banner & menus preserved!');
    } else {
      console.log('⚠️ Could not find roleMsg 1548964613750530079');
    }
  } catch (err) {
    console.error('⚠️ Roles UI update error:', err.message);
  }
  await sleep(1500);

  // 3. Support Tickets (1540414017733140560)
  try {
    const ticketChan = await guild.channels.fetch('1540414017733140560');
    console.log(`Updating UI in #${ticketChan.name}...`);
    const ticketBannerBuf = createTicketsBanner();
    const ticketAttachment = new AttachmentBuilder(ticketBannerBuf, { name: 'banner_tickets.png' });

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x00E5FF)
      .setTitle('🎫・SUPPORT & ASSISTANCE DISPATCH')
      .setDescription(
        `### 🛡️ OFFICIAL STAFF CONCIERGE & SUPPORT DISPATCH\n\n` +
        `> Welcome to the **EDITX Support Portal**. Need assistance from our moderation team, want to report a rule violator, or collaborate on a project? Select an authorized department below to create a 100% private ticket channel.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💬 **General Inquiries** — Server questions, role assistance, partnerships\n` +
        `🚨 **Player & Staff Reports** — Report policy violations, scammers, or harassment\n` +
        `💳 **Billing & Creator Perks** — Store purchases, commissions, VIP booster perks\n` +
        `🛠️ **Technical Support** — Bot permissions, audio issues, stream setup\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `-# 🔒 *All communications are confidential between you and the EDITX administration team.*`
      )
      .setImage('attachment://banner_tickets.png')
      .setFooter({
        text: 'EDITX Support Dispatch • Fast Response Guarantee',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const ticketMsg = await ticketChan.messages.fetch('1548964608822218834').catch(() => null);
    if (ticketMsg) {
      await ticketMsg.edit({ 
        embeds: [ticketEmbed], 
        files: [ticketAttachment],
        components: ticketMsg.components 
      });
      console.log('✅ Ticket message edited with restyled banner & dropdown preserved!');
    } else {
      console.log('⚠️ Could not find ticketMsg 1548964608822218834');
    }
  } catch (err) {
    console.error('⚠️ Tickets UI update error:', err.message);
  }
  await sleep(1500);

  // 4. Asset Vault (1553832430618681394)
  try {
    const vaultChan = await guild.channels.fetch('1553832430618681394');
    console.log(`Updating UI in #${vaultChan.name}...`);
    const vaultBannerBuf = createAssetVaultBanner();
    const vaultAttachment = new AttachmentBuilder(vaultBannerBuf, { name: 'banner_asset_vault.png' });

    const vaultEmbed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('📦・EDITX CREATIVE ASSET VAULT (50MB UPLOADS ACTIVE)')
      .setDescription(
        `Welcome to the **EDITX Asset Vault**! Empowered by our **Level 2 Server Boost**, our direct file upload capacity is permanently elevated to **50MB**!\n\n` +
        `Here we drop curated, verified, high-value resources for video editors, motion designers, and sound engineers.\n\n` +
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
        `-# 💡 *Staff regularly drops direct 50MB presets, sound packs, and project templates here.*`
      )
      .setImage('attachment://banner_asset_vault.png')
      .setFooter({
        text: 'EDITX | The Creative Network • Resource Archive',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const vaultMsg = await vaultChan.messages.fetch('1553832433072472236').catch(() => null);
    if (vaultMsg) {
      await vaultMsg.edit({ embeds: [vaultEmbed], files: [vaultAttachment] });
      console.log('✅ Asset Vault message edited with restyled banner!');
    } else {
      await vaultChan.send({ embeds: [vaultEmbed], files: [vaultAttachment] });
      console.log('✅ Asset Vault message posted with restyled banner!');
    }
  } catch (err) {
    console.error('⚠️ Asset Vault UI update error:', err.message);
  }
  await sleep(1500);

  // 5. Booster Lounge (1553832436406812784)
  try {
    const boosterChan = await guild.channels.fetch('1553832436406812784');
    console.log(`Updating UI in #${boosterChan.name}...`);
    const boosterBannerBuf = createBoosterLoungeBanner();
    const boosterAttachment = new AttachmentBuilder(boosterBannerBuf, { name: 'banner_booster_lounge.png' });

    const boosterEmbed = new EmbedBuilder()
      .setColor(0xF47FFF)
      .setTitle('💎・EXCLUSIVE BOOSTER & VIP LOUNGE')
      .setDescription(
        `Welcome to the **EDITX VIP Sanctuary**!\n\n` +
        `This private lounge is reserved exclusively for our **Server Boosters** whose support unlocked **Level 2 Perks** for the entire network!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `### 💎 Your Active Level 2 Booster Perks:\n` +
        `▸ **50MB Direct Upload Limit**: Share uncompressed project files, 4K clips, and audio tracks.\n` +
        `▸ **1080p 60FPS HD Streaming**: Crystal-clear screen sharing during live editing collaborations.\n` +
        `▸ **256 Kbps High-Fidelity Audio**: Studio-grade pristine audio across all voice channels.\n` +
        `▸ **Exclusive VIP Lounge Access**: Direct channel to chat with server leadership & staff.\n` +
        `▸ **Priority Edit Critique**: Skip the line for personalized feedback on your creative reels.\n` +
        `▸ **Custom Role Color & Hoist**: Stand out proudly at the top of the member directory.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `-# 💖 *Thank you for fueling the growth of EDITX | The Creative Network!*`
      )
      .setImage('attachment://banner_booster_lounge.png')
      .setFooter({
        text: 'EDITX VIP Club • Server Booster Perks',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const boosterMsgs = await boosterChan.messages.fetch({ limit: 5 });
    const botBoosterMsg = boosterMsgs.find(m => m.author.id === client.user.id);
    if (botBoosterMsg) {
      await botBoosterMsg.edit({ embeds: [boosterEmbed], files: [boosterAttachment] });
      console.log('✅ Booster Lounge message edited with restyled banner!');
    } else {
      await boosterChan.send({ embeds: [boosterEmbed], files: [boosterAttachment] });
      console.log('✅ Booster Lounge message posted with restyled banner!');
    }
  } catch (err) {
    console.error('⚠️ Booster Lounge UI update error:', err.message);
  }
  await sleep(1500);

  // 6. Do Not Type Here / Honeypot (1546818053059379251)
  try {
    const honeypotChan = await guild.channels.fetch('1546818053059379251');
    console.log(`Updating UI in #${honeypotChan.name}...`);
    const honeypotBannerBuf = createHoneypotBanner();
    const honeypotAttachment = new AttachmentBuilder(honeypotBannerBuf, { name: 'banner_honeypot.png' });

    const honeypotEmbed = new EmbedBuilder()
      .setColor(0xEF4444)
      .setTitle('🚨・RESTRICTED DEFENSE PERIMETER — DO NOT SEND MESSAGES')
      .setDescription(
        `### ⚡ AUTOMATED SENTINEL DEFENSE PERIMETER\n\n` +
        `> **WARNING**: This channel is an automated security trap designed to capture automated spam bots, scraper accounts, and rogue raid scripts.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `▸ 🚫 **Any message sent in this channel will result in immediate role revocation and instant quarantine.**\n` +
        `▸ 👤 **If you are a legitimate human member, navigate away immediately to <#1540409723130617976>.**\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `-# 🛡️ *EDITX Sentinel • Active Perimeter Security*`
      )
      .setImage('attachment://banner_honeypot.png')
      .setFooter({
        text: 'EDITX Security Sentinel • Zero Tolerance Zone',
        iconURL: guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    const honeypotMsgs = await honeypotChan.messages.fetch({ limit: 5 });
    const botHoneypotMsg = honeypotMsgs.find(m => m.author.id === client.user.id);
    if (botHoneypotMsg) {
      await botHoneypotMsg.edit({ embeds: [honeypotEmbed], files: [honeypotAttachment] });
      console.log('✅ Honeypot message edited with restyled banner!');
    } else {
      await honeypotChan.send({ embeds: [honeypotEmbed], files: [honeypotAttachment] });
      console.log('✅ Honeypot message posted with restyled banner!');
    }
  } catch (err) {
    console.error('⚠️ Honeypot UI update error:', err.message);
  }

  console.log('\n🎉 ALL UI & BRAND ASSETS UPDATED SUCCESSFULLY ACROSS THE SERVER!');
  client.destroy();
  process.exit(0);
}

run().catch(err => {
  console.error('[FATAL] Script failed:', err);
  process.exit(1);
});

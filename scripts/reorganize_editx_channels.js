require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits, 
  EmbedBuilder 
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const EDITX_GUILD_ID = '1538957031455596544';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  console.log('[START] Connecting to Discord...');
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(EDITX_GUILD_ID);
  console.log(`[CONNECTED] Guild: ${guild.name} (${guild.id})`);

  const roles = await guild.roles.fetch();
  let channels = await guild.channels.fetch();

  const quarantineRole = roles.get('1546811342369984652');
  const everyoneRole = guild.roles.everyone;

  const baseOverwrites = [
    {
      id: everyoneRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers
      ],
      deny: []
    }
  ];

  if (quarantineRole) {
    baseOverwrites.push({
      id: quarantineRole.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads
      ]
    });
  }

  // 1. Find Community Hangout Category
  let communityCat = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('C O M M U N I T Y'));
  if (!communityCat) {
    console.log('[ACTION] Creating Category: ── ✦ C O M M U N I T Y  H A N G O U T ──');
    communityCat = await guild.channels.create({
      name: '── ✦ C O M M U N I T Y  H A N G O U T ──',
      type: ChannelType.GuildCategory,
      position: 2,
      permissionOverwrites: baseOverwrites
    });
    await sleep(1500);
  } else {
    console.log(`[EXISTS] Category: ${communityCat.name}`);
    await communityCat.edit({ position: 2, permissionOverwrites: baseOverwrites });
    await sleep(1000);
  }

  // 2. Ensure Creator Studio Category
  const suiteCat = channels.get('1540409721402691624');
  if (suiteCat) {
    console.log('[ACTION] Updating Creator Studio Category position...');
    await suiteCat.edit({
      name: '── ✦ C R E A T O R  S T U D I O ──',
      position: 3
    });
    await sleep(1000);
  }

  // 3. Ensure General Chat
  const genChat = channels.get('1540409723130617976');
  if (genChat) {
    console.log('[ACTION] Ensuring 💬・general-chat properties...');
    await genChat.edit({
      name: '💬・general-chat',
      parent: communityCat.id,
      position: 0,
      topic: 'The central hub for the EDITX community. Relax, hang out, and talk about anything!'
    });
    await sleep(1000);
  }

  // 4. Create Music & Vibes if not exists
  let musicChannel = channels.find(c => c && c.parentId === communityCat.id && c.name.includes('music-and-vibes'));
  if (!musicChannel) {
    console.log('[ACTION] Creating Channel: #🎧・music-and-vibes');
    musicChannel = await guild.channels.create({
      name: '🎧・music-and-vibes',
      type: ChannelType.GuildText,
      parent: communityCat.id,
      topic: 'Share Spotify songs, SoundCloud beats, editing playlists, and tunes!',
      rateLimitPerUser: 5,
      position: 4,
      permissionOverwrites: baseOverwrites
    });
    await sleep(1500);

    const musicEmbed = new EmbedBuilder()
      .setColor(0x1DB954)
      .setTitle('🎧 Music, Playlists & Vibes')
      .setDescription('What are you listening to while editing?\n\n• Share your favorite Spotify / Apple Music / SoundCloud tracks\n• Recommend lofi, phonk, synthwave, or chill editing playlists\n• Talk about your favorite producers and artists!')
      .setFooter({ text: 'EDITX Community' });
    
    await musicChannel.send({ embeds: [musicEmbed] }).catch(() => null);
    await sleep(1000);
  } else {
    console.log('[EXISTS] Channel: #🎧・music-and-vibes');
  }

  // 5. Move Bot Commands to Community Hangout
  const botCommands = channels.get('1540409729396776991');
  if (botCommands) {
    console.log('[ACTION] Moving #bot-commands to Community Hangout');
    await botCommands.edit({
      parent: communityCat.id,
      position: 5
    });
    await sleep(1000);
  }

  // 6. Consolidate Editing Channels
  // Rename timeline-critique to edit-critique-help
  const critique = channels.get('1540409725324099604');
  if (critique) {
    console.log('[ACTION] Renaming timeline-critique to 🎞️・edit-critique-help');
    await critique.edit({
      name: '🎞️・edit-critique-help',
      topic: 'Get feedback on your edits, transitions, pacing, or ask technical editing questions.',
      position: 0
    });
    await sleep(1000);
  }

  // Remove redundant troubleshooting-fx
  const troubleshootingFx = channels.get('1540409727333179562');
  if (troubleshootingFx) {
    console.log('[ACTION] Deleting redundant channel: #troubleshooting-fx');
    await troubleshootingFx.delete('Consolidated into #edit-critique-help');
    await sleep(1500);
  }

  // Remove redundant creations-showcase
  const creationsShowcase = channels.get('1545841086751310035');
  if (creationsShowcase) {
    console.log('[ACTION] Deleting redundant channel: #creations-showcase');
    await creationsShowcase.delete('Redundant with Marketplace portfolio channels');
    await sleep(1500);
  }

  // 7. Verify positions of all categories
  const marketplaceCat = channels.get('1540409734861946882');
  if (marketplaceCat) {
    await marketplaceCat.edit({ position: 4 });
    await sleep(500);
  }
  const studioLoungeCat = channels.get('1548736074656907294');
  if (studioLoungeCat) {
    await studioLoungeCat.edit({ position: 5 });
    await sleep(500);
  }
  const serverStatsCat = channels.get('1548735257203974285');
  if (serverStatsCat) {
    await serverStatsCat.edit({ position: 6 });
    await sleep(500);
  }
  const supportCat = channels.get('1546813012101566525');
  if (supportCat) {
    await supportCat.edit({ position: 7 });
    await sleep(500);
  }

  console.log('[SUCCESS] All channels and categories reorganized successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});

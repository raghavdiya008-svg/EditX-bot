/**
 * OMNI BOT - Enterprise All-in-One Discord System (V5 Supreme)
 * Self-sufficient engine replacing Beemo, Honeypot, Invite Tracker, Welcomer, Ticket Tool, Wick, and Carl-bot.
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Events,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const http = require('http');
require('dotenv').config();

// Built-in HTTP Health Check Server (Enables 24/7 Free Hosting on Render, Koyeb, Glitch, etc.)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: 'EditX Discord Bot',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }));
}).listen(PORT, () => {
  console.log(`[HTTP HEALTH CHECK] Online on port ${PORT} (24/7 ping ready)`);
});

const JSONDatabase = require('./database');

// Load Essential Focused Modules
const QuickSetupModule = require('./modules/quick_setup');
const UtilityModule = require('./modules/utility');
const TicketsModule = require('./modules/tickets');
const ModerationModule = require('./modules/moderation');
const DecorationModule = require('./modules/decoration');
const RolesModule = require('./modules/roles');
const LoggingModule = require('./modules/logging');
const AIModerationModule = require('./modules/ai_moderator');
const HousekeeperModule = require('./modules/housekeeper');
const TagsModule = require('./modules/tags');
const HiringModule = require('./modules/hiring');
const TranslatorModule = require('./modules/translator');
const LevelingModule = require('./modules/leveling');
const GiveawaysModule = require('./modules/giveaways');
const StarboardModule = require('./modules/starboard');
const SocialAlertsModule = require('./modules/social_alerts');
const AIChatModule = require('./modules/ai_chat');
const BotMemoryModule = require('./modules/bot_memory');
const DMReminderModule = require('./modules/dm_reminder');

// Persistent Database Collections
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

const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error('[FATAL ERROR] Missing DISCORD_TOKEN in environment (.env).');
  process.exit(1);
}

process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));
process.on('uncaughtException', (err) => console.error('[UNCAUGHT EXCEPTION]', err));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction, Partials.User],
  sweepers: { messages: { interval: 1800, lifetime: 900 } }
});

// Supreme Bot Owner Identity (Bypasses all guild-level permission restrictions)
const BOT_OWNER_ID = '1320083615475830797';
client.botOwnerId = BOT_OWNER_ID;

// Invite cache for tracking
client.inviteCache = new Map();

// Initialize Modules
const botMemory = new BotMemoryModule(client, db);
client.botMemory = botMemory;
const roles = new RolesModule(client, db);
const leveling = new LevelingModule(client, db, roles);
const quickSetup = new QuickSetupModule(client, db);
const utility = new UtilityModule(client, db);
const tickets = new TicketsModule(client, db);
const moderation = new ModerationModule(client, db);
const decoration = new DecorationModule(client, db);
const logging = new LoggingModule(client, db);
const aiModerator = new AIModerationModule(client, db);
const housekeeper = new HousekeeperModule(client, db, aiModerator);
const tags = new TagsModule(client, db);
const hiring = new HiringModule(client, db);
const translator = new TranslatorModule(client, db);
const giveaways = new GiveawaysModule(client, db);
const starboard = new StarboardModule(client, db);
const socialAlerts = new SocialAlertsModule(client, db);
const aiChat = new AIChatModule(client, db, botMemory);
aiChat.setHousekeeper(housekeeper);
const dmReminder = new DMReminderModule(client, db);

// All active modules list
const modules = [
  botMemory,
  quickSetup,
  utility,
  tickets,
  moderation,
  decoration,
  roles,
  logging,
  aiModerator,
  housekeeper,
  tags,
  hiring,
  translator,
  leveling,
  giveaways,
  starboard,
  socialAlerts,
  aiChat,
  dmReminder
];

client.once(Events.ClientReady, async () => {
  console.log(`[BOOT SUCCESS] Omni Enterprise System online as: ${client.user.tag}`);

  // Collect all commands
  const commands = [];
  modules.forEach(m => {
    if (typeof m.getCommands === 'function') {
      commands.push(...m.getCommands());
    }
  });

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const commandData = commands.map(c => c.toJSON());

  // Sync commands per-guild for INSTANT (<5s) availability instead of global (up to 1h delay).
  // This guarantees /autopilot and all other commands appear immediately in Discord.
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commandData });
      console.log(`[GUILD REGISTRY] ✅ Synced ${commandData.length} commands instantly to ${guild.name}`);
    } catch (gErr) {
      console.error(`[GUILD REGISTRY WARNING] Could not sync commands for ${guild.name}:`, gErr.message);
    }
  }

  // Also clear global commands so there are no stale duplicates from previous deployments
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log('[GLOBAL REGISTRY] Cleared stale global commands (guild-scoped commands are now canonical).');
  } catch (err) {
    console.warn('[GLOBAL REGISTRY] Could not clear global commands:', err.message);
  }


  // Run Autonomous Auto-Pilot across all connected servers (zero manual setup required)
  for (const guild of client.guilds.cache.values()) {
    await quickSetup.runAutoPilot(guild);
    await utility.handleGuildCreate(guild);
    await botMemory.initGuild(guild);
    await dmReminder.initGuild(guild);
  }
  console.log(`[AUTOPILOT] 100% Autonomous server operations online for ${client.guilds.cache.size} guild(s).`);

  // Pre-fetch & cache Application Emojis from Developer Portal
  try {
    if (client.application) {
      const appEmojis = await client.application.emojis.fetch();
      console.log(`[APPLICATION EMOJIS] Successfully cached ${appEmojis.size} application emojis.`);
    }
  } catch (e) {}
});

// Guild Join Event
client.on(Events.GuildCreate, async (guild) => {
  // Instantly deploy all commands to the new guild
  try {
    const commands = [];
    modules.forEach(m => { if (typeof m.getCommands === 'function') commands.push(...m.getCommands()); });
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands.map(c => c.toJSON()) });
    console.log(`[GUILD REGISTRY] ✅ Synced ${commands.length} commands to new guild: ${guild.name}`);
  } catch (err) {
    console.warn(`[GUILD REGISTRY] Could not sync commands for ${guild.name}:`, err.message);
  }
  await quickSetup.runAutoPilot(guild);
  await utility.handleGuildCreate(guild);
  await botMemory.initGuild(guild);
  await dmReminder.initGuild(guild);
});

// Member Lifecycle Events (Welcomer & Invite Tracking & Auto-Roles)
client.on(Events.GuildMemberAdd, async (member) => {
  await utility.handleJoin(member);
  await roles.handleMemberJoin(member);
});

client.on(Events.GuildMemberRemove, async (member) => {
  await utility.handleLeave(member);
  await roles.handleMemberLeave(member);
});

// Directives Real-Time Sync on Rule Updates/Deletions
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (newMsg && newMsg.guild) {
    await botMemory.handleRulesChannelEvent(newMsg, 'update');
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (message && message.guild) {
    await botMemory.handleRulesChannelEvent(message, 'delete');
  }
});

// Essential Event Routing: Honeypot, Autonomous Sentinel, Staff Copilot, Bump Buddy, Showcase Auto-Threads, Sticky Tags, Hiring Guard & Auto Translator
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) {
    await dmReminder.handleDirectMessage(message);
    return;
  }

  // Handle staff native reply in DM reports channel
  const handledReportReply = await dmReminder.handleGuildMessage(message);
  if (handledReportReply) return;

  // --- Owner & Admin Plain-Text Command Dispatcher ---
  // Guarantees Bot Owner (1320083615475830797) can run commands even if Discord hides slash commands!
  const isBotOwner = message.author.id === BOT_OWNER_ID;
  const isServerAdmin = isBotOwner ||
    message.author.id === message.guild.ownerId ||
    Boolean(message.member?.permissions?.has(PermissionFlagsBits.Administrator));

  let text = (message.content || '').trim();
  let isPrefixCmd = false;
  if (text.startsWith('!')) {
    isPrefixCmd = true;
    text = text.slice(1).trim();
  } else if (client.user && (text.startsWith(`<@${client.user.id}>`) || text.startsWith(`<@!${client.user.id}>`))) {
    const afterMention = text.replace(new RegExp(`^<@!?${client.user.id}>\\s*`), '').trim();
    if (/^(autopilot|setup|scan|rules|memory|decorate|roles|help)/i.test(afterMention)) {
      isPrefixCmd = true;
      text = afterMention;
    }
  }

  if (isPrefixCmd && isServerAdmin && !message.author.bot) {
    const parts = text.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();
    const sub = (parts[1] || '').toLowerCase();
    const args = parts.slice(1);

    if (cmd === 'autopilot') {
      const waitMsg = await message.reply('⚡ **Activating 100% Autonomous Auto-Pilot...**').catch(() => null);
      const results = await quickSetup.runAutoPilot(message.guild, true);
      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('⚡・EditX 100% Autonomous Auto-Pilot Online')
        .setDescription(
          `Your server is operating on **complete autonomous auto-pilot**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👋 **1. Welcomer & Canvas Cards**\n▸ ${results.welcomer}\n\n` +
          `🏷️ **2. Auto-Role On Arrival**\n▸ ${results.autorole}\n\n` +
          `📋 **3. Mod & Server Audit Logs**\n▸ ${results.logging}\n\n` +
          `💼 **4. Hiring & Freelance Desk**\n▸ ${results.hiring}\n\n` +
          `🎫 **5. Support Ticket Dispatch**\n▸ ${results.tickets}\n\n` +
          `🚀 **6. Bump Reminders**\n▸ ${results.bump}\n\n` +
          `🍯 **7. Honeypot Anti-Raid Shield**\n▸ ${results.honeypot}\n\n` +
          `🧠 **8. State Vault & Custom Rules**\n▸ ${results.memory}\n\n` +
          `🌐 **9. Server Knowledge & AI Context**\n▸ ${results.serverScan}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✨ *EditX is managing member arrivals, roles, tickets, hiring threads, and security 24/7.*`
        )
        .setFooter({ text: `${message.guild.name} • 100% Autonomous Auto-Pilot` })
        .setTimestamp();
      if (waitMsg) await waitMsg.edit({ content: null, embeds: [embed] }).catch(() => {});
      return;
    }

    if (cmd === 'setup') {
      if (sub === 'roles' || sub === 'reactionroles') {
        const waitMsg = await message.reply('🎭 **Deploying interactive reaction role panels & verifying roles...**').catch(() => null);
        const res = await quickSetup.deployReactionRoles(message.guild, message.channel);
        if (waitMsg) await waitMsg.edit({ content: res }).catch(() => {});
        return;
      }
      if (sub === 'create-roles' || sub === 'createroles') {
        const waitMsg = await message.reply('👑 **Initializing complete server role hierarchy...**').catch(() => null);
        const created = await quickSetup.createDefaultRoles(message.guild);
        const textRes = `✅ **Role Hierarchy Initialized!**\nVerified/created ${created.length} roles:\n${created.map(r => `• <@&${r.id}>`).join('\n')}`;
        if (waitMsg) await waitMsg.edit({ content: textRes }).catch(() => {});
        return;
      }
      if (sub === 'quick') {
        const waitMsg = await message.reply('⚡ **Running 1-Click Quick Setup...**').catch(() => null);
        const fakeInteraction = {
          guild: message.guild,
          channel: message.channel,
          user: message.author,
          member: message.member,
          commandName: 'setup',
          options: { getSubcommand: () => 'quick' },
          deferReply: async () => {},
          editReply: async (data) => {
            if (waitMsg) await waitMsg.edit(data).catch(() => {});
          }
        };
        await quickSetup.handleCommand(fakeInteraction);
        return;
      }
    }

    if (cmd === 'scan') {
      const waitMsg = await message.reply('🔍 **Deep-scanning channels, categories, roles & rules into bot memory...**').catch(() => null);
      await botMemory.scanServer(message.guild, message.author);
      if (waitMsg) await waitMsg.edit({ content: `✅ **Deep Server Scan Complete!**\nEditX AI now has full knowledge of all channels, roles, and guidelines in **${message.guild.name}**.` }).catch(() => {});
      return;
    }

    if (cmd === 'rules') {
      if (sub === 'update') {
        const waitMsg = await message.reply('📜 **Publishing and synchronizing community rules...**').catch(() => null);
        const res = await botMemory.publishCommunityRules(message.guild, message.channel);
        if (waitMsg) await waitMsg.edit(res).catch(() => {});
        return;
      }
      if (sub === 'add') {
        const instruction = args.slice(1).join(' ').trim();
        if (!instruction) {
          return message.reply('⚠️ Please provide directive text. Example: `!rules add Always be friendly to newcomers`').catch(() => {});
        }
        const res = await botMemory.addDirective(message.guild, instruction, message.author);
        if (res.success) {
          return message.reply(`🧠 **Directive Learned & Saved to Memory!**\n• **Rule:** "${instruction}"\n• **Vault Channel:** ${res.channelId ? `<#${res.channelId}>` : '`#bot-rules`'}`).catch(() => {});
        } else {
          return message.reply(`❌ **Failed to save directive:** ${res.error}`).catch(() => {});
        }
      }
      if (sub === 'view' || !sub) {
        const secDb = botMemory.db.security || botMemory.configDb;
        const storedRules = secDb.get(`rules_${message.guild.id}`) ||
          '1. Respect all members and maintain civil discussions.\n2. No spam, unsolicited promotion, or malicious links.\n3. Keep media in respective showcase channels.\n4. Follow all Discord Terms of Service.';
        const viewEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📜 Active Community Rules • ${message.guild.name}`)
          .setDescription(storedRules)
          .setFooter({ text: 'Use !rules update to refresh and post to #rules' })
          .setTimestamp();
        return message.reply({ embeds: [viewEmbed] }).catch(() => {});
      }
    }

    if (cmd === 'memory') {
      if (sub === 'status' || !sub) {
        const vaultChan = message.guild.channels.cache.find(c => c.name.includes('bot-memory'));
        const rulesChan = message.guild.channels.cache.find(c => c.name.includes('bot-rules'));
        const directives = botMemory.getDirectivesList(message.guild.id);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🧠 EditX Memory Vault Health • ${message.guild.name}`)
          .setDescription(
            `• **Vault Channel**: ${vaultChan ? `<#${vaultChan.id}>` : '`#bot-memory`'}\n` +
            `• **Rules Channel**: ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}\n` +
            `• **Active Directives**: \`${directives.length}\`\n` +
            `• **Memory Isolation**: 🔒 Strictly isolated to Guild ID \`${message.guild.id}\`\n` +
            `• **Bot Owner**: <@${BOT_OWNER_ID}> (Supreme Authority)`
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] }).catch(() => {});
      }
      if (sub === 'backup') {
        const waitMsg = await message.reply('💾 **Backing up guild state to #bot-memory...**').catch(() => null);
        const success = await botMemory.backupGuildState(message.guild);
        if (waitMsg) await waitMsg.edit({ content: success ? '✅ **State backup complete and recorded in #bot-memory!**' : '⚠️ Backup completed with warnings.' }).catch(() => {});
        return;
      }
    }

    if (cmd === 'decorate') {
      if (sub === 'apply') {
        const waitMsg = await message.reply('✨ **Applying non-destructive aesthetic makeover...**').catch(() => null);
        const res = await decoration.applyStyling(message.guild);
        if (waitMsg) await waitMsg.edit({ content: `💎 **Makeover Applied!**\nStyled \`${res.styledCategories}\` categories and \`${res.styledChannels}\` channels with 0 deletions.` }).catch(() => {});
        return;
      }
    }

    if (cmd === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('⚡ EditX Supreme Bot Commands')
        .setDescription(
          `**👑 Bot Owner (<@${BOT_OWNER_ID}>) & Server Admin Commands:**\n\n` +
          `• \`!autopilot\` — Activate 100% Autonomous Auto-Pilot across the server\n` +
          `• \`!setup quick\` — Run 1-click core setup (Welcomer, Tickets, Honeypot, Logging)\n` +
          `• \`!setup roles\` — Deploy interactive reaction role panels in #roles\n` +
          `• \`!setup create-roles\` — Create all standard server roles automatically\n` +
          `• \`!scan server\` — Deep-scan channels, categories, roles & rules into bot memory\n` +
          `• \`!rules update\` — Publish and synchronize official guidelines in #rules\n` +
          `• \`!rules add <rule>\` — Add a new live directive for the bot to strictly obey\n` +
          `• \`!rules view\` — View current server rules in memory\n` +
          `• \`!memory status\` — Inspect server memory vault and isolation status\n` +
          `• \`!memory backup\` — Force immediate backup to #bot-memory\n` +
          `• \`!decorate apply\` — Non-destructively style category & channel names\n\n` +
          `🔒 *All commands work unconditionally for the Bot Owner even without server Admin role.*`
        )
        .setFooter({ text: `${message.guild.name} • Supreme Command Engine` })
        .setTimestamp();
      return message.reply({ embeds: [helpEmbed] }).catch(() => {});
    }
  }

  // Real-time custom directives ingestion in #bot-rules
  await botMemory.handleRulesChannelEvent(message, 'create');

  // 0. Track message for Ghost-Ping detection
  housekeeper.trackMessage(message);

  // 1. Honeypot Trap: unauthorized accounts speaking in honeypot are softbanned immediately
  const isHoneypot = await moderation.checkHoneypot(message);
  if (isHoneypot) return;

  // 2. AI Moderation & Security Sentinel (Sliding context, instant phishing detection, jailbreak guard & mod copilot)
  const allowed = await aiModerator.checkMessage(message);
  if (allowed === false) return;

  // 3. Staff Ping AI Responder (Answers questions or auto-forwards to human staff)
  const handledStaffPing = await housekeeper.handleStaffPing(message);
  if (handledStaffPing) return;

  // 4. Showcase Auto-Threading: Automatically opens discussion thread on video uploads
  if (!message.author.bot && message.channel.name && (message.channel.name.includes('showcase') || message.channel.name.includes('portfolio'))) {
    if (message.attachments.size > 0 || /https?:\/\/(www\.)?(youtube\.com|youtu\.be|streamable\.com|drive\.google\.com|vimeo\.com|tiktok\.com)/i.test(message.content)) {
      try {
        if (!message.hasThread && message.channel.threads) {
          const thread = await message.startThread({
            name: `🎬 Feedback • ${message.author.username}'s Edit`,
            autoArchiveDuration: 1440
          });
          thread.send(`💬 **Feedback Thread Opened!** Leave your color grading notes, audio feedback, and pacing critiques for <@${message.author.id}>.`).catch(() => {});
        }
      } catch (tErr) {}
    }
  }

  // 6. Utility & Invites Plain-Text Commands & Bump Buddy
  utility.checkBump(message);
  const handledUtil = await utility.checkMessage(message);
  if (handledUtil) return;

  // 7. Tags, AFK, Auto-Responders & Persistent Sticky Message Reposting
  await tags.checkMessage(message);

  // 8. Hiring Channel Guard: Cleans off-topic chatter and routes through 1-click modal forms
  await hiring.checkMessage(message);

  // 9. Auto English Translator: Detects foreign language messages and replies with instant English translation
  await translator.checkMessage(message);

  // 10. AI Chat: Answers when pinged or in dedicated AI chat channels
  await aiChat.checkMessage(message);

  // 11. Experience & Leveling Progress
  leveling.handleChatXP(message);
});

// Message Deletion Handlers (Ghost-Ping Catcher; Audit Logger handled via LoggingModule event registration)
client.on(Events.MessageDelete, async (message) => {
  await housekeeper.handleMessageDelete(message);
});

// Unified Interaction Router (Commands, Buttons, Menus, Modals)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) {
    if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
      try {
        const handled = await dmReminder.handleInteraction(interaction);
        if (handled) return;
      } catch (err) {
        console.error('[DM INTERACTION ERROR]', err);
      }
    }
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      return interaction.reply({ content: '❌ Commands are only supported within server channels.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  // Dynamic Component & Modal Interaction Dispatcher
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    for (const mod of modules) {
      if (typeof mod.handleInteraction === 'function') {
        try {
          const handled = await mod.handleInteraction(interaction);
          if (handled) return;
        } catch (err) {
          console.error(`[INTERACTION ERROR in ${mod.constructor.name}]`, err);
        }
      }
    }
    return;
  }

  // Slash Command Dispatcher
  if (!interaction.isChatInputCommand()) return;

  for (const mod of modules) {
    if (typeof mod.handleCommand === 'function') {
      try {
        const handled = await mod.handleCommand(interaction);
        if (handled) return;
      } catch (err) {
        console.error(`[COMMAND ERROR in ${mod.constructor.name}]`, err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: `❌ An unexpected error occurred while executing this command.` }).catch(() => {});
        } else {
          await interaction.reply({ content: `❌ An unexpected error occurred while executing this command.`, ephemeral: true }).catch(() => {});
        }
        return;
      }
    }
  }

  if (!interaction.replied && !interaction.deferred) {
    interaction.reply({ content: '❓ Unknown or unhandled command.', ephemeral: true }).catch(() => {});
  }
});

// Reaction Event Handlers (Honeypot + Starboard + DM Reactions)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (!reaction.message?.guild) {
    await dmReminder.handleDirectMessageReaction(reaction, user);
    return;
  }
  moderation.checkHoneypotReaction(reaction, user);
  for (const mod of modules) {
    if (typeof mod.handleReactionAdd === 'function') {
      try {
        await mod.handleReactionAdd(reaction, user);
      } catch (err) {
        console.error(`[REACTION ADD ERROR in ${mod.constructor.name}]`, err);
      }
    }
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  for (const mod of modules) {
    if (typeof mod.handleReactionRemove === 'function') {
      try {
        await mod.handleReactionRemove(reaction, user);
      } catch (err) {
        console.error(`[REACTION REMOVE ERROR in ${mod.constructor.name}]`, err);
      }
    }
  }
});

// Invite Tracking Delegations
client.on(Events.InviteCreate, i => utility.handleInviteCreate(i));
client.on(Events.InviteDelete, i => utility.handleInviteDelete(i));
client.on(Events.GuildCreate, g => utility.handleGuildCreate(g));
client.on(Events.GuildDelete, g => utility.handleGuildDelete(g));

// Global Process Crash Protection
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

// Resilient Bot Launch & Auto-Reconnect Engine
async function startBot(retries = 15, delay = 5000) {
  try {
    console.log('[BOOT] Connecting to Discord Gateway...');
    await client.login(TOKEN);
  } catch (err) {
    console.error(`[BOOT ERROR] Failed to connect to Discord (HTTP ${err.status || err.code || 'ERR'}):`, err.message);
    if (retries > 0) {
      console.log(`[BOOT RETRY] Retrying connection in ${delay / 1000}s... (${retries} attempts remaining)`);
      setTimeout(() => startBot(retries - 1, Math.min(delay * 1.5, 30000)), delay);
    } else {
      console.error('[BOOT FATAL] Exceeded maximum connection retries to Discord Gateway. Exiting for container restart.');
      process.exit(1);
    }
  }
}

startBot();
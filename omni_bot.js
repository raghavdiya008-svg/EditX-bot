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
require('dotenv').config();
const http = require('http');
const JSONDatabase = require('./database');

// Load Essential Focused Modules
const DashboardModule = require('./modules/dashboard');
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
const AIChatModule = require('./modules/ai_chat');
const BotMemoryModule = require('./modules/bot_memory');
const DMReminderModule = require('./modules/dm_reminder');
const PrefixCommandsModule = require('./modules/prefix_commands');

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
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1320083615475830797';
client.botOwnerId = BOT_OWNER_ID;
client.isOwner = (userId) => {
  if (!userId) return false;
  return userId === client.botOwnerId || userId === process.env.BOT_OWNER_ID || userId === '1320083615475830797';
};

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
const aiChat = new AIChatModule(client, db, botMemory);
aiChat.setHousekeeper(housekeeper);
const dmReminder = new DMReminderModule(client, db);
const PORT = process.env.PORT || 3005;

const dashboard = new DashboardModule(client, db, botMemory);
client.dashboard = dashboard;
const prefixCommands = new PrefixCommandsModule(client, { quickSetup, botMemory, decoration, botOwnerId: BOT_OWNER_ID, port: PORT });

// Built-in HTTP Health Check & Cockpit Dashboard Server
const server = http.createServer((req, res) => {
  dashboard.handleHttpRequest(req, res);
}).listen(PORT, () => {
  console.log(`[COCKPIT & HEALTH CHECK] Live Server Dashboard online on port ${PORT} (http://localhost:${PORT})`);
});

// All active modules list
const modules = [
  dashboard,
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
  aiChat,
  dmReminder
];

// Graceful Shutdown & Resource Cleanup Hook
function shutdown() {
  console.log('[SHUTDOWN] Tearing down modules and clearing active timers...');
  for (const m of modules) {
    if (typeof m.destroy === 'function') {
      try { m.destroy(); } catch (e) {}
    }
  }
  try { if (server && typeof server.close === 'function') server.close(); } catch (e) {}
  try { if (client && typeof client.destroy === 'function') client.destroy(); } catch (e) {}
}
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

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
      // Rate-limit safety: 350ms delay between guild REST puts to avoid Discord API 429 bursts
      await new Promise(r => setTimeout(r, 350));
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
    try {
      // Ensure server nickname is cleanly customized for secondary server if not already set
      if (guild.id === '1553818924314001450') {
        const me = guild.members?.me || (await guild.members?.fetchMe().catch(() => null));
        if (me && !me.nickname && me.permissions?.has(PermissionFlagsBits.ChangeNickname)) {
          await me.setNickname('edits bot').catch(() => {});
        }
      }
      await quickSetup.runAutoPilot(guild);
      await utility.handleGuildCreate(guild);
      await botMemory.initGuild(guild);
      await dmReminder.initGuild(guild);
    } catch (gInitErr) {
      console.error(`[GUILD INIT ERROR ${guild.id}]:`, gInitErr.message);
    }
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
  try {
    if (guild.id === '1553818924314001450') {
      const me = guild.members?.me || (await guild.members?.fetchMe().catch(() => null));
      if (me && !me.nickname && me.permissions?.has(PermissionFlagsBits.ChangeNickname)) {
        await me.setNickname('edits bot').catch(() => {});
      }
    }
    await quickSetup.runAutoPilot(guild);
    await utility.handleGuildCreate(guild);
    await botMemory.initGuild(guild);
    await dmReminder.initGuild(guild);
  } catch (gErr) {
    console.error(`[GUILD CREATE ERROR ${guild.id}]:`, gErr.message);
  }
});

// Member Lifecycle Events (Welcomer & Invite Tracking & Auto-Roles)
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await utility.handleJoin(member);
    await roles.handleMemberJoin(member);
  } catch (err) {
    console.error(`[ISOLATED ERROR in GuildMemberAdd ${member.guild?.id}]:`, err.message);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await utility.handleLeave(member);
    await roles.handleMemberLeave(member);
  } catch (err) {
    console.error(`[ISOLATED ERROR in GuildMemberRemove ${member.guild?.id}]:`, err.message);
  }
});

// Directives Real-Time Sync on Rule Updates/Deletions
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (newMsg && newMsg.guild) {
    await botMemory.handleRulesChannelEvent(newMsg, 'update');
  }
});

// client.on(Events.MessageDelete, async (message) => { // Handled below in unified MessageDelete listener
//   if (message && message.guild) {
//     await botMemory.handleRulesChannelEvent(message, 'delete');
//   }
// });

// Essential Event Routing: Honeypot, Autonomous Sentinel, Staff Copilot, Bump Buddy, Showcase Auto-Threads, Sticky Tags, Hiring Guard & Auto Translator
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild) {
      if (dashboard && typeof dashboard.broadcastDirectMessage === 'function') {
        dashboard.broadcastDirectMessage(message);
      }
      await dmReminder.handleDirectMessage(message);
      return;
    }

    // Broadcast message to live dashboard SSE stream
    if (dashboard && typeof dashboard.broadcastMessage === 'function') {
      dashboard.broadcastMessage(message);
    }

  // Handle staff native reply in DM reports channel
  const handledReportReply = await dmReminder.handleGuildMessage(message);
  if (handledReportReply) return;

  // Staff Mention / Prefix DM Dispatcher (e.g. "@EditX dm @user <msg>" or replying "@EditX dm this person <msg>")
  const handledDmDispatch = await dmReminder.handleDmDispatchCommand(message);
  if (handledDmDispatch) return;

    // Owner & Admin Plain-Text Command Dispatcher (!autopilot, !setup, !scan, !rules, etc.)
  const handledPrefix = await prefixCommands.handle(message);
  if (handledPrefix) return;

  // Real-time custom directives ingestion in #bot-rules
  await botMemory.handleRulesChannelEvent(message, 'create');

  // 0. Track message for Ghost-Ping detection
  housekeeper.trackMessage(message);

  // 0b. Co-Owner Guardian: Prohibits sus/NSFW/promo/rubbish messages & auto-strips roles at 5 strikes
  const handledCoOwner = await moderation.checkCoOwnerMessage(message);
  if (handledCoOwner) return;

  // 1. Honeypot Trap: unauthorized accounts speaking in honeypot are softbanned immediately
  const isHoneypot = await moderation.checkHoneypot(message);
  if (isHoneypot) return;

  // 1b. Self-Promotion Restriction: other than #self-promotions, member-tier promos are deleted with redirect reply
  const isBlockedPromo = await moderation.checkPromoRestriction(message);
  if (isBlockedPromo) return;

  // 1c. Automod & Nitro Guard: Word 'nitro' deletion, anti-invite links, bad words & flood spam
  const isModAllowed = await moderation.checkMessage(message);
  if (isModAllowed === false) return;

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

  // --- Manual Takeover Check ---
  // When the operator is managing the server via the Cockpit Screen,
  // suppress automated AI replies & auto-responders so human control is 100% authentic.
  if (dashboard && dashboard.isTakeoverActive(message.channel.id)) {
    return;
  }

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
  } catch (err) {
    console.error(`[ISOLATED ERROR in MessageCreate ${message.guild?.id || 'DM'}]:`, err.message);
  }
});

// Message Deletion Handlers (Rules Sync & Ghost-Ping Catcher; Audit Logger handled via LoggingModule)
client.on(Events.MessageDelete, async (message) => {
  try {
    if (message && message.guild) {
      await botMemory.handleRulesChannelEvent(message, 'delete');
    }
    await housekeeper.handleMessageDelete(message);
  } catch (err) {
    console.error(`[ISOLATED ERROR in MessageDelete ${message?.guild?.id}]:`, err.message);
  }
});

// Co-Owner Mass-Ban Guard Listener: Kicks Co-Owner if they ban more than 1 member
client.on(Events.GuildBanAdd, async (ban) => {
  try {
    await moderation.handleCoOwnerBan(ban);
  } catch (err) {
    console.error(`[ISOLATED ERROR in GuildBanAdd ${ban.guild?.id}]:`, err.message);
  }
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

  // Slash Command Autocomplete Dispatcher
  if (interaction.isAutocomplete()) {
    for (const mod of modules) {
      if (typeof mod.handleAutocomplete === 'function') {
        try {
          const handled = await mod.handleAutocomplete(interaction);
          if (handled) return;
        } catch (err) {
          console.error(`[AUTOCOMPLETE ERROR in ${mod.constructor?.name || "module"}]`, err);
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
client.on(Events.GuildDelete, g => utility.handleGuildDelete(g));


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
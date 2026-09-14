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
  Events
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
const AutonomousSentinelModule = require('./modules/autonomous_sentinel');
const HousekeeperModule = require('./modules/housekeeper');
const TagsModule = require('./modules/tags');
const HiringModule = require('./modules/hiring');
const TranslatorModule = require('./modules/translator');
const LevelingModule = require('./modules/leveling');
const GiveawaysModule = require('./modules/giveaways');
const StarboardModule = require('./modules/starboard');
const VerificationModule = require('./modules/verification');
const SocialAlertsModule = require('./modules/social_alerts');
const AIChatModule = require('./modules/ai_chat');
const MusicModule = require('./modules/music');

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
  hiring: new JSONDatabase('hiring')
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
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction, Partials.User],
  sweepers: { messages: { interval: 1800, lifetime: 900 } }
});

// Invite cache for tracking
client.inviteCache = new Map();

// Initialize Modules
const roles = new RolesModule(client, db);
const leveling = new LevelingModule(client, db, roles);
const quickSetup = new QuickSetupModule(client, db);
const utility = new UtilityModule(client, db);
const tickets = new TicketsModule(client, db);
const moderation = new ModerationModule(client, db);
const decoration = new DecorationModule(client, db);
const logging = new LoggingModule(client, db);
const aiModerator = new AIModerationModule(client, db);
const sentinel = new AutonomousSentinelModule(client, db);
const housekeeper = new HousekeeperModule(client, db, sentinel);
const tags = new TagsModule(client, db);
const hiring = new HiringModule(client, db);
const translator = new TranslatorModule(client, db);
const giveaways = new GiveawaysModule(client, db);
const starboard = new StarboardModule(client, db);
const verification = new VerificationModule(client, db);
const socialAlerts = new SocialAlertsModule(client, db);
const aiChat = new AIChatModule(client, db);
const music = new MusicModule(client);

// All active modules list
const modules = [
  quickSetup,
  utility,
  tickets,
  moderation,
  decoration,
  roles,
  logging,
  aiModerator,
  sentinel,
  housekeeper,
  tags,
  hiring,
  translator,
  leveling,
  giveaways,
  starboard,
  verification,
  socialAlerts,
  aiChat,
  music
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

  // 1. Clear any guild-scoped commands to eliminate double/duplicate slash commands
  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: [] });
    } catch (gErr) {
      console.error(`[GUILD REGISTRY WARNING] Could not clear guild commands for ${guild.name}:`, gErr.message);
    }
  }

  // 2. Global Sync (Single source of truth, guarantees exactly one entry per command)
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
    console.log(`[GLOBAL REGISTRY] Synchronized ${commands.length} global Slash Commands (Zero duplicates).`);
  } catch (err) {
    console.error('[REGISTRY WARNING] Failed to sync global commands:', err.message);
  }

  // Pre-fetch invites across guilds & auto-detect welcome channels
  for (const guild of client.guilds.cache.values()) {
    await utility.handleGuildCreate(guild);
    await utility.autoDetectWelcomeChannel(guild);
  }
  console.log(`[INVITES] Cached invite tracking for ${client.inviteCache.size} guild(s).`);

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
  await utility.handleGuildCreate(guild);
  await utility.autoDetectWelcomeChannel(guild);
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

// Essential Event Routing: Honeypot, Autonomous Sentinel, Staff Copilot, Bump Buddy, Showcase Auto-Threads, Sticky Tags, Hiring Guard & Auto Translator
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild) return;

  // 0. Track message for Ghost-Ping detection
  housekeeper.trackMessage(message);

  // 1. Honeypot Trap: unauthorized accounts speaking in honeypot are softbanned immediately
  const isHoneypot = await moderation.checkHoneypot(message);
  if (isHoneypot) return;

  // 2. Autonomous Sentinel (Modcord-style multi-message sliding-window context evaluation)
  const handledBySentinel = await sentinel.checkMessage(message);
  if (handledBySentinel) return;

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

  // 5. AI Moderation Copilot: Scans suspicious content and reports to mods in report-only mode
  await aiModerator.checkMessage(message);

  // 6. Bump Buddy: Inspects Disboard / Bump Buddy confirmations
  utility.checkBump(message);

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

// Message Deletion Handlers (Ghost-Ping Catcher + Audit Logger)
client.on(Events.MessageDelete, async (message) => {
  await housekeeper.handleMessageDelete(message);
  await logging.handleMessageDelete(message);
});

// Message Update Handlers (Audit Logger)
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  await logging.handleMessageUpdate(oldMsg, newMsg);
});

// Unified Interaction Router (Commands, Buttons, Menus, Modals)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) {
    if (interaction.isRepliable()) {
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

// Reaction Event Handlers (Honeypot + Starboard)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
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

// Logging Audit Listeners
client.on(Events.GuildMemberUpdate, (oldM, newM) => logging.handleMemberUpdate(oldM, newM));
client.on(Events.VoiceStateUpdate, (oldS, newS) => logging.handleVoiceStateUpdate(oldS, newS));
client.on(Events.ChannelCreate, (c) => logging.handleChannelCreate(c));
client.on(Events.ChannelDelete, (c) => logging.handleChannelDelete(c));
client.on(Events.GuildRoleCreate, (r) => logging.handleRoleCreate(r));
client.on(Events.GuildRoleDelete, (r) => logging.handleRoleDelete(r));
client.on(Events.GuildBanAdd, (b) => logging.handleBanAdd(b));
client.on(Events.GuildBanRemove, (b) => logging.handleBanRemove(b));

// Anti-Nuke & Server Protection yielded exclusively to Wick Bot

// Invite Tracking Delegations
client.on(Events.InviteCreate, i => utility.handleInviteCreate(i));
client.on(Events.InviteDelete, i => utility.handleInviteDelete(i));
client.on(Events.GuildCreate, g => utility.handleGuildCreate(g));
client.on(Events.GuildDelete, g => utility.handleGuildDelete(g));

client.login(TOKEN);
/**
 * Dedicated Slash Command Deployment Utility
 * Run via: node deploy_commands.js [--global | --guild <guild_id>]
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const JSONDatabase = require('./database');
const QuickSetupModule = require('./modules/quick_setup');
const UtilityModule = require('./modules/utility');
const TicketsModule = require('./modules/tickets');
const ModerationModule = require('./modules/moderation');
const DecorationModule = require('./modules/decoration');
const RolesModule = require('./modules/roles');
const LoggingModule = require('./modules/logging');
const AIModerationModule = require('./modules/ai_moderator');
const TagsModule = require('./modules/tags');
const HiringModule = require('./modules/hiring');
const LevelingModule = require('./modules/leveling');
const GiveawaysModule = require('./modules/giveaways');
const StarboardModule = require('./modules/starboard');
const VerificationModule = require('./modules/verification');
const SocialAlertsModule = require('./modules/social_alerts');
const AIChatModule = require('./modules/ai_chat');
const MusicModule = require('./modules/music');
const BotMemoryModule = require('./modules/bot_memory');
const TranslatorModule = require('./modules/translator');
const HousekeeperModule = require('./modules/housekeeper');

const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || '1538958753670500392';

if (!TOKEN) {
  console.error('[ERROR] Missing DISCORD_TOKEN in environment.');
  process.exit(1);
}

// Dummy DB instances for command registration
const dummyDb = {
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

const dummyClient = { on: () => {}, guilds: { cache: new Map() } };

const modules = [
  new QuickSetupModule(dummyClient, dummyDb),
  new UtilityModule(dummyClient, dummyDb),
  new TicketsModule(dummyClient, dummyDb),
  new ModerationModule(dummyClient, dummyDb),
  new DecorationModule(dummyClient, dummyDb),
  new RolesModule(dummyClient, dummyDb),
  new LoggingModule(dummyClient, dummyDb),
  new AIModerationModule(dummyClient, dummyDb),
  new TagsModule(dummyClient, dummyDb),
  new HiringModule(dummyClient, dummyDb),
  new LevelingModule(dummyClient, dummyDb),
  new GiveawaysModule(dummyClient, dummyDb),
  new StarboardModule(dummyClient, dummyDb),
  new VerificationModule(dummyClient, dummyDb),
  new SocialAlertsModule(dummyClient, dummyDb),
  new AIChatModule(dummyClient, dummyDb),
  new MusicModule(dummyClient),
  new BotMemoryModule(dummyClient, dummyDb),
  new TranslatorModule(dummyClient, dummyDb),
  new HousekeeperModule(dummyClient, dummyDb)
];

const allCommands = [];
modules.forEach(m => {
  if (typeof m.getCommands === 'function') {
    allCommands.push(...m.getCommands());
  }
});

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deploy() {
  console.log(`[DEPLOY] Prepared ${allCommands.length} Slash Commands across all ${modules.length} modules.`);
  allCommands.forEach((c, idx) => console.log(`  ${idx + 1}. /${c.name} — ${c.description}`));

  const args = process.argv.slice(2);
  const guildArgIndex = args.indexOf('--guild');
  const defaultGuildId = '1538957031455596544';
  const targetGuildId = guildArgIndex !== -1 ? args[guildArgIndex + 1] : (process.env.GUILD_ID || defaultGuildId);

  try {
    if (targetGuildId) {
      console.log(`\n[GUILD SYNC] Deploying ${allCommands.length} commands directly to Guild ${targetGuildId} for INSTANT (<5s) availability...`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, targetGuildId),
        { body: allCommands.map(c => c.toJSON()) }
      );
      console.log(`✅ Successfully deployed ${allCommands.length} commands to Guild ${targetGuildId} (Instant Availability).`);
    }

    console.log(`\n[GLOBAL SYNC] Deploying ${allCommands.length} commands globally to Application ID: ${CLIENT_ID}...`);
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: allCommands.map(c => c.toJSON()) }
    );
    console.log(`✅ Successfully deployed ${allCommands.length} commands Globally.`);
  } catch (err) {
    console.error('[ERROR] Failed to deploy slash commands:', err);
  }
}

deploy();

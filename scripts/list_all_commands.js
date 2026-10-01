const mockDb = {
  get: () => null,
  set: () => {},
  delete: () => {},
  has: () => false,
  entries: () => [],
  keys: () => [],
  values: () => []
};

const db = {
  config: mockDb,
  xp: mockDb,
  security: mockDb,
  cases: mockDb,
  tickets: mockDb,
  invites: mockDb,
  roles: mockDb,
  utility: mockDb,
  giveaways: mockDb,
  starboard: mockDb,
  tags: mockDb,
  verification: mockDb,
  hiring: mockDb,
  dm: mockDb
};

const dummyClient = { user: { id: 'dummy' } };

// Instantiate modules
const QuickSetupModule = require('../modules/quick_setup');
const UtilityModule = require('../modules/utility');
const TicketsModule = require('../modules/tickets');
const ModerationModule = require('../modules/moderation');
const DecorationModule = require('../modules/decoration');
const RolesModule = require('../modules/roles');
const AIModerationModule = require('../modules/ai_moderator');
const TagsModule = require('../modules/tags');
const HiringModule = require('../modules/hiring');
const TranslatorModule = require('../modules/translator');
const LevelingModule = require('../modules/leveling');
const GiveawaysModule = require('../modules/giveaways');
const StarboardModule = require('../modules/starboard');
const BotMemoryModule = require('../modules/bot_memory');
const DMReminderModule = require('../modules/dm_reminder');
const DashboardModule = require('../modules/dashboard');

const moduleList = [
  { name: '🛡️ Moderation & Enforcement', mod: new ModerationModule(dummyClient, db) },
  { name: '🤖 AI Sentinel & Scam Shield', mod: new AIModerationModule(dummyClient, db) },
  { name: '👥 Roles & Verification Panels', mod: new RolesModule(dummyClient, db) },
  { name: '📨 Invites, Welcomer & Utilities', mod: new UtilityModule(dummyClient, db) },
  { name: '🎫 Support Tickets Concierge', mod: new TicketsModule(dummyClient, db) },
  { name: '📈 Leveling & XP Progression', mod: new LevelingModule(dummyClient, db, new RolesModule(dummyClient, db)) },
  { name: '📌 Tags, Sticky Notices & Carl-bot Engine', mod: new TagsModule(dummyClient, db) },
  { name: '💼 Hiring & Freelance Marketplace', mod: new HiringModule(dummyClient, db) },
  { name: '🎉 Interactive Giveaways', mod: new GiveawaysModule(dummyClient, db) },
  { name: '⭐ Starboard Hall of Fame', mod: new StarboardModule(dummyClient, db) },
  { name: '🌐 Language Translator', mod: new TranslatorModule(dummyClient, db) },
  { name: '🎨 Server Decoration & Layouts', mod: new DecorationModule(dummyClient, db) },
  { name: '⚡ 1-Click Quick Setup', mod: new QuickSetupModule(dummyClient, db) },
  { name: '🤖 Bot Memory & Autonomous Directives', mod: new BotMemoryModule(dummyClient, db) },
  { name: '📬 DM Reminders & Announcements', mod: new DMReminderModule(dummyClient, db) },
  { name: '🖥️ Cockpit Takeover Dashboard', mod: new DashboardModule(dummyClient, db, new BotMemoryModule(dummyClient, db)) }
];

const catalog = {};
let totalCmds = 0;

moduleList.forEach(m => {
  if (typeof m.mod.getCommands === 'function') {
    const cmds = m.mod.getCommands();
    catalog[m.name] = [];
    cmds.forEach(c => {
      totalCmds++;
      const json = c.toJSON();
      const subcommands = (json.options || []).filter(o => o.type === 1).map(s => s.name);
      const subGroups = (json.options || []).filter(o => o.type === 2).map(g => ({
        name: g.name,
        subs: (g.options || []).map(s => s.name)
      }));
      catalog[m.name].push({
        name: `/${json.name}`,
        description: json.description,
        subcommands,
        subGroups,
        optionsCount: (json.options || []).length
      });
    });
  }
});

console.log(`TOTAL REGISTERED SLASH COMMANDS: ${totalCmds}`);
console.log(JSON.stringify(catalog, null, 2));
process.exit(0);

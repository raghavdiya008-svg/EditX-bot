const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder
} = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

class UtilityModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.invites;
    this.utilDb = db.utility;

    // Check reminders every 30 seconds
    setInterval(() => this.checkReminders(), 30 * 1000);

    // Update server stats channels every 10 minutes
    setInterval(() => this.updateServerStats(), 10 * 60 * 1000);
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('help').setDescription('Browse complete command directory, guides, and feature categories')
        .addStringOption(o => o.setName('command').setDescription('Specific command to inspect details for'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('poll').setDescription('Create an interactive community poll with live voting')
        .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
        .addStringOption(o => o.setName('option1').setDescription('First option').setRequired(true))
        .addStringOption(o => o.setName('option2').setDescription('Second option').setRequired(true))
        .addStringOption(o => o.setName('option3').setDescription('Third option'))
        .addStringOption(o => o.setName('option4').setDescription('Fourth option'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('suggest').setDescription('Server suggestion portal and decision tracking')
        .addSubcommand(s => s.setName('submit').setDescription('Submit an idea to the server suggestion portal')
          .addStringOption(o => o.setName('idea').setDescription('Detailed suggestion').setRequired(true)))
        .addSubcommand(s => s.setName('status').setDescription('Update status of a community suggestion')
          .addStringOption(o => o.setName('message_id').setDescription('ID of suggestion message').setRequired(true))
          .addStringOption(o => o.setName('status').setDescription('Decision').setRequired(true)
            .addChoices({ name: 'Accept', value: 'ACCEPTED' }, { name: 'Reject', value: 'REJECTED' }, { name: 'Consider', value: 'CONSIDERED' }))
          .addStringOption(o => o.setName('note').setDescription('Staff note')))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('remind').setDescription('Set a personal reminder')
        .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setMinValue(1).setRequired(true))
        .addStringOption(o => o.setName('reminder').setDescription('What to remind you about').setRequired(true)),

      new SlashCommandBuilder().setName('serverstats').setDescription('Deploy auto-updating server stats counter channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('invites').setDescription('Comprehensive server invite tracking and management')
        .addSubcommand(s => s.setName('check').setDescription('Check your or another member’s detailed invite statistics')
          .addUserOption(o => o.setName('target').setDescription('Target member')))
        .addSubcommand(s => s.setName('sync').setDescription('Reconstruct and sync invite portfolio from #invites-tracker, #modlogs & server invites'))
        .addSubcommand(s => s.setName('leaderboard').setDescription('Display the top server inviters leaderboard'))
        .addSubcommand(s => s.setName('add').setDescription('Manually grant bonus invites to a server member')
          .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
          .addIntegerOption(o => o.setName('amount').setDescription('Number of bonus invites').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('remove').setDescription('Deduct bonus invites from a server member')
          .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
          .addIntegerOption(o => o.setName('amount').setDescription('Number of bonus invites to remove').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('reset').setDescription('Reset invite statistics for a user or entire server')
          .addUserOption(o => o.setName('target').setDescription('Target user (leave empty to reset entire server)')))
        .addSubcommandGroup(g => g.setName('reward').setDescription('Configure automated role rewards for invite milestones')
          .addSubcommand(s => s.setName('add').setDescription('Add an invite milestone role reward')
            .addIntegerOption(o => o.setName('invites').setDescription('Required real invites').setRequired(true).setMinValue(1))
            .addRoleOption(o => o.setName('role').setDescription('Role to reward').setRequired(true)))
          .addSubcommand(s => s.setName('remove').setDescription('Remove an invite milestone reward')
            .addIntegerOption(o => o.setName('invites').setDescription('Milestone invite count to delete').setRequired(true)))
          .addSubcommand(s => s.setName('list').setDescription('List all active invite role rewards')))
        .setDMPermission(false),


      new SlashCommandBuilder().setName('userinfo').setDescription('Inspect detailed profile and account statistics of a member')
        .addUserOption(o => o.setName('target').setDescription('Target user'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('serverinfo').setDescription('Display comprehensive statistics and metrics for this server')
        .setDMPermission(false),

      new SlashCommandBuilder().setName('roleinfo').setDescription('View detailed permissions and member stats for a server role')
        .addRoleOption(o => o.setName('role').setDescription('Role to inspect').setRequired(true))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('avatar').setDescription('Display or download a high-resolution user avatar')
        .addUserOption(o => o.setName('target').setDescription('Target user'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('banner').setDescription('Display a user’s profile banner')
        .addUserOption(o => o.setName('target').setDescription('Target user'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('embed').setDescription('Generate and send a rich custom embed announcement')
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Embed description content').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('Hex color (e.g. #5865F2 or GREEN, RED, BLUE)'))
        .addStringOption(o => o.setName('image').setDescription('Image URL'))
        .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL'))
        .addStringOption(o => o.setName('footer').setDescription('Footer text'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

      new SlashCommandBuilder().setName('welcomer').setDescription('Configure custom welcome cards, leave announcements, and DMs')
        .addSubcommand(s => s.setName('set').setDescription('Configure join announcement and card settings')
          .addChannelOption(o => o.setName('channel').setDescription('Channel for welcome announcements').addChannelTypes(ChannelType.GuildText))
          .addStringOption(o => o.setName('message').setDescription('Custom message (supports {user}, {server}, {membercount})'))
          .addStringOption(o => o.setName('theme').setDescription('Canvas card theme preset')
            .addChoices(
              { name: 'Server Banner (Themed to Server Background / Banner)', value: 'server' },
              { name: 'Classic Dark (Sleek Charcoal & Blurple)', value: 'dark' },
              { name: 'Creative Studio (Video & Photo Editor Aesthetic)', value: 'studio' },
              { name: 'Vibrant Gradient (Purple to Indigo Glow)', value: 'gradient' },
              { name: 'Cyberpunk Neon (Obsidian, Cyan & Yellow)', value: 'cyberpunk' }
            ))
          .addStringOption(o => o.setName('bg_url').setDescription('Direct image URL for custom card background (e.g. Discord CDN or Imgur)'))
          .addBooleanOption(o => o.setName('card_enabled').setDescription('Enable/Disable canvas welcome card'))
          .addBooleanOption(o => o.setName('dm_enabled').setDescription('Send direct message to new members on join'))
          .addStringOption(o => o.setName('dm_message').setDescription('Custom DM text sent to new members')))
        .addSubcommand(s => s.setName('leave').setDescription('Configure leave announcement and card settings')
          .addChannelOption(o => o.setName('channel').setDescription('Channel for leave announcements').addChannelTypes(ChannelType.GuildText))
          .addStringOption(o => o.setName('message').setDescription('Custom leave message (supports {user}, {server}, {membercount})'))
          .addBooleanOption(o => o.setName('card_enabled').setDescription('Enable/Disable canvas leave card'))
          .addBooleanOption(o => o.setName('dm_enabled').setDescription('Send direct message to leaving members (if reachable)'))
          .addStringOption(o => o.setName('dm_message').setDescription('Custom leave DM message')))
        .addSubcommand(s => s.setName('test').setDescription('Simulate and preview join or leave welcome announcements')
          .addStringOption(o => o.setName('type').setDescription('Event to simulate').setRequired(true)
            .addChoices({ name: 'Join Welcome Card', value: 'join' }, { name: 'Leave Goodbye Card', value: 'leave' })))
        .addSubcommand(s => s.setName('disable').setDescription('Disable custom welcomer'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

      new SlashCommandBuilder().setName('channelinfo').setDescription('View detailed technical statistics and settings for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to inspect'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('emojiinfo').setDescription('Display details, ID, and full-resolution image of a custom emoji')
        .addStringOption(o => o.setName('emoji').setDescription('Custom emoji to inspect').setRequired(true))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('bump').setDescription('Configure automated bump reminders for Disboard / Bump Buddy')
        .addSubcommand(s => s.setName('set').setDescription('Set the bump channel and optional ping role')
          .addChannelOption(o => o.setName('channel').setDescription('Channel where bumps occur').addChannelTypes(ChannelType.GuildText))
          .addRoleOption(o => o.setName('role').setDescription('Role to ping when it is time to bump')))
        .addSubcommand(s => s.setName('status').setDescription('View current bump reminder timer and configuration'))
        .addSubcommand(s => s.setName('test').setDescription('Trigger a test bump alert immediately'))
        .addSubcommand(s => s.setName('disable').setDescription('Disable automated bump reminders'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
    ];
  }

  getHelpMenuRow() {
    return new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Select a category to view commands...')
        .addOptions([
          { label: 'Moderation & Security', value: 'help_moderation', emoji: '🛡️', description: 'AI scam shield, automod, punishments, case notes' },
          { label: 'Tickets & Support', value: 'help_tickets', emoji: '🎫', description: 'Department select portal, ticket claiming, transcripts' },
          { label: 'Invites & Welcomer', value: 'help_invites', emoji: '📨', description: 'Real invite tracker, reward roles, canvas welcome cards' },
          { label: 'Roles & Verification', value: 'help_roles', emoji: '👥', description: 'Reaction roles menus/buttons, sticky roles, verification' },
          { label: 'Leveling & XP', value: 'help_leveling', emoji: '📈', description: 'Rank cards, voice/chat XP progression, leaderboard' },
          { label: 'Starboard, Tags & Sticky', value: 'help_tags', emoji: '📌', description: 'Sticky messages, Carl-bot TagScript, autoresponders, starboard' },
          { label: 'Server Utilities', value: 'help_utility', emoji: '🛠️', description: 'Polls, suggestions, reminders, server stats, info tools' },
          { label: 'Music, Giveaways & Alerts', value: 'help_extra', emoji: '🎵', description: 'Voice streaming, giveaway system, YouTube/Twitch alerts' }
        ])
    );
  }

  getCategoryEmbed(category) {
    const embed = new EmbedBuilder().setTimestamp();
    const botAvatar = this.client.user?.avatar ? this.client.user.displayAvatarURL() : undefined;

    const makeBar = (pct, len = 10) => {
      const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
      return '▰'.repeat(filled) + '▱'.repeat(len - filled);
    };

    if (category === 'help_moderation') {
      embed.setColor(0xEF4444)
        .setAuthor({ name: 'Omni Shield • Moderation & Security', iconURL: botAvatar })
        .setTitle('🛡️ Moderation & Server Security Engine')
        .setDescription('Enterprise-grade moderation controls, AI scam & toxicity shield, infraction records, and channel restrictions.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '🤖 AI Scam & Toxicity Defense', value: '▸ `/aimod settings` • Configure AI sensitivity & threshold\n▸ `/aimod check <text>` • Manual AI scam/toxicity analysis\n▸ `/aimod stats` • View API quota usage & protected rate limits\n▸ `/automod` • Spam, invite link, and caps filter\n▸ `/filter` • Blacklist keyword management' },
          { name: '🔨 Punishments & Enforcement', value: '▸ `/ban`, `/tempban`, `/unban`, `/massban`, `/softban`, `/kick`\n▸ `/timeout`, `/untimeout`, `/slowmode [channel]`, `/lockdown [channel]`\n▸ `/purge [count] [filter]` • Bulk prune (bots, humans, links, images)\n▸ `/warn`, `/warnings`, `/clearwarns`, `/punish`, `/audit server`, `/mod report`' },
          { name: '⚖️ Case History & Staff Records', value: '▸ `/modhistory <target>` • User infraction ledger & incident history\n▸ `/modnote` (`add`, `list`, `clear`) • Confidential staff notes\n▸ `/vmute`, `/vdeafen`, `/vdisconnect` • Voice channel controls' }
        )
        .setFooter({ text: 'Omni Security Suite • High-Performance Audit Engine' });
    } else if (category === 'help_tickets') {
      embed.setColor(0x06B6D4)
        .setAuthor({ name: 'Omni Support • Ticketing Concierge', iconURL: botAvatar })
        .setTitle('🎫 Multi-Department Ticket Tool Suite')
        .setDescription('Confidential support channel automation with department routing and transcript archiving.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📍 Support Hub Setup', value: '▸ `/ticket setup` • Deploy interactive department dropdown portal' },
          { name: '⚙️ Active Ticket Channel Controls', value: '▸ `/ticket add <user>` • Grant access to ticket channel\n▸ `/ticket remove <user>` • Revoke access from ticket\n▸ `/ticket rename <name>` • Rename ticket channel\n▸ `/ticket transcript` • Export standalone HTML transcript log\n▸ `/ticket close` • Close, archive, and delete ticket channel' }
        )
        .setFooter({ text: 'Omni Ticket System • Confidential Staff Routing' });
    } else if (category === 'help_invites') {
      embed.setColor(0x10B981)
        .setAuthor({ name: 'Omni Community • Invites & Graphic Welcomer', iconURL: botAvatar })
        .setTitle('📨 Invite Tracker & Canvas Welcomer Graphics')
        .setDescription('Real invite analytics, milestone reward auto-roles, and high-resolution welcome cards.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📈 Invite Tracking Ledger', value: '▸ `/invites check [target]` • Real invites (`reg - leaves - fake + bonus`)\n▸ `/invites add <target> <amount>` • Grant bonus staff invites\n▸ `/invites remove <target> <amount>` • Deduct bonus invites\n▸ `/invites reset [target]` • Reset member or server invite data\n▸ `/invites leaderboard` • Server top inviters leaderboard\n▸ `/invites reward` (`add`, `remove`, `list`) • Milestone auto-roles' },
          { name: '🎨 Canvas Graphic Welcomer & DMs', value: '▸ `/welcomer set` • Configure join channel, DM, and theme (`dark`, `gradient`, `cyberpunk`)\n▸ `/welcomer leave` • Configure leave channel & goodbye card\n▸ `/welcomer test <join|leave>` • Live graphical card preview simulator\n▸ `/welcomer disable` • Toggle welcomer system' }
        )
        .setFooter({ text: 'Omni Welcomer Suite • Dynamic Canvas Graphics' });
    } else if (category === 'help_roles') {
      embed.setColor(0x8B5CF6)
        .setAuthor({ name: 'Omni Access • Roles & Verification', iconURL: botAvatar })
        .setTitle('👥 Role Management, Panels & Verification Gates')
        .setDescription('Carl-bot grade reaction role panels, sticky role restoration, and entry verification.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '🔘 Reaction Role Panels', value: '▸ `/reactionroles menu` • Interactive dropdown select menu panel\n▸ `/reactionroles buttons` • Multi-toggle button panel\n▸ `/reactionroles unique` • Single-choice exclusive role panel' },
          { name: '⚡ Automated & Sticky Roles', value: '▸ `/autorole` • Assign roles automatically on member join\n▸ `/stickyroles` • Restore previous roles when members leave and rejoin\n▸ `/temprole` • Grant role with automated time expiry\n▸ `/levelrole` • Level progression milestone reward roles' },
          { name: '🛡️ Member Gate Verification', value: '▸ `/verify setup` • Deploy interactive entry verification button' }
        )
        .setFooter({ text: 'Omni Access Control • Enterprise Role Automation' });
    } else if (category === 'help_leveling') {
      embed.setColor(0xF59E0B)
        .setAuthor({ name: 'Omni Activity • Leveling & XP Engine', iconURL: botAvatar })
        .setTitle('📈 Participation Progression & Graphical Rank Cards')
        .setDescription('Chat and voice participation progression engine with high-resolution canvas profile cards.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '🎮 Participant Commands', value: '▸ `/rank [target]` • Render luxury glassmorphic graphical rank card\n▸ `/leaderboard` • Server top active XP participants' },
          { name: '🛠️ Administrative XP Controls', value: '▸ `/setxp <target> <amount>` • Manually adjust participant XP\n▸ `/resetxp <target>` • Reset user XP to zero\n▸ `/level config` • Configure announcement channels and DM mode' }
        )
        .setFooter({ text: 'Omni Progression Engine • Chat & Voice Activity' });
    } else if (category === 'help_tags') {
      embed.setColor(0x6366F1)
        .setAuthor({ name: 'Omni Tags • Sticky Notices & Starboard', iconURL: botAvatar })
        .setTitle('📌 Sticky Notices, TagScript Engine & Starboard')
        .setDescription('Persistent channel sticky messages, dynamic server variables, and community hall of fame.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📌 Persistent Sticky Messages (Always at Bottom)', value: '▸ `/sticky set <message> [channel] [cooldown]` • Pin notice that automatically reposts as chat moves\n▸ `/sticky remove [channel]` • Remove sticky notice\n▸ `/sticky list` • View all active sticky messages' },
          { name: '🏷️ Carl-bot TagScript Engine', value: '▸ `/tag create <name> <content>` • Supports `{user}`, `{server.name}`, `{choose:a|b}`, `{random:1-100}`\n▸ `/tag get <name>`, `/tag alias`, `/tag info`, `/tag list`, `/tag raw`, `/tag delete`' },
          { name: '🤖 Auto-Responders & AFK System', value: '▸ `/autoresponder add <trigger> <reply>` • Keyword auto-reply (`contains` or `exact`)\n▸ `/autoresponder remove`, `/autoresponder list`\n▸ `/afk [reason]` • Away from keyboard status with auto-reply on mention' },
          { name: '⭐ Starboard Highlights', value: '▸ `/starboard set` • Channel, threshold, and custom emoji\n▸ `/starboard top` • Hall of fame leaderboard\n▸ `/starboard disable` • Toggle starboard' }
        )
        .setFooter({ text: 'Omni Engagement Suite • Dynamic Server Automation' });
    } else if (category === 'help_utility') {
      embed.setColor(0x3B82F6)
        .setAuthor({ name: 'Omni Utility • Community & Analytics', iconURL: botAvatar })
        .setTitle('🛠️ Server Utility & Information Tools')
        .setDescription('Community engagement tools, interactive button polls, suggestions, and server analytics.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📊 Engagement & Organization', value: '▸ `/poll` • Interactive button voting poll with live visual progress bars\n▸ `/suggest submit <idea>` • Community suggestion with approval meter & voting\n▸ `/suggest status <msg_id> <decision>` • Update suggestion decision (`ACCEPTED`, `REJECTED`)\n▸ `/remind` • Personal DM reminder timer\n▸ `/bump` (`set`, `status`, `test`, `disable`) • Automated Disboard & Bump Buddy reminder suite\n▸ `/serverstats` • Deploy auto-updating member & channel counters' },
          { name: '🔍 Inspection & Assets', value: '▸ `/userinfo`, `/serverinfo`, `/roleinfo`, `/channelinfo`, `/emojiinfo`\n▸ `/avatar`, `/banner`, `/embed` (Rich custom announcement builder)' }
        )
        .setFooter({ text: 'Omni Tools Suite • Analytics & Engagement' });
    } else if (category === 'help_extra') {
      embed.setColor(0xEC4899)
        .setAuthor({ name: 'Omni Media • Audio, Giveaways & Socials', iconURL: botAvatar })
        .setTitle('🎵 Music Streaming, Giveaways & Social Alerts')
        .setDescription('Voice channel audio streaming, giveaways, and automated social notifications.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '🎧 Voice Channel Music Streaming', value: '▸ `/play <query>` • Stream YouTube, SoundCloud, or Spotify audio\n▸ `/skip`, `/pause`, `/resume`, `/stop`, `/queue`' },
          { name: '🎉 Interactive Giveaways', value: '▸ `/giveaway start <duration> <winners> <prize>` • Host interactive giveaway\n▸ `/giveaway reroll`, `/giveaway end`' },
          { name: '🔔 Automated Social Alerts', value: '▸ `/alert youtube` • New video upload notifications\n▸ `/alert twitch` • Streamer live alerts\n▸ `/alert reddit` • Subreddit post notifications\n▸ `/alert rss` • RSS feed updates' }
        )
        .setFooter({ text: 'Omni Media Engine • Voice & Social Integration' });
    }

    return embed;
  }

  async handleCommand(interaction) {
    const { commandName, options, guild, channel, user } = interaction;

    if (commandName === 'help') {
      const botAvatar = this.client.user?.avatar ? this.client.user.displayAvatarURL() : undefined;
      const specificCmd = options.getString('command');
      if (specificCmd) {
        const cleanName = specificCmd.toLowerCase().replace('/', '');
        const embed = new EmbedBuilder().setColor(0x6366F1)
          .setAuthor({ name: 'Omni Command Lookup', iconURL: botAvatar })
          .setTitle(`📖 Command: /${cleanName}`)
          .setDescription(`Type \`/${cleanName}\` in Discord to invoke this command.\nReview required arguments and options in Discord's slash autocomplete picker.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
          .addFields(
            { name: 'Prefix', value: '`/` *(Discord Slash Command)*', inline: true },
            { name: 'Category Index', value: 'Run `/help` to open the full interactive category menu.', inline: true }
          )
          .setFooter({ text: 'Omni Enterprise Platform • Native Slash Command Engine' });

        return interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder().setColor(0x6366F1)
        .setAuthor({ name: 'Omni Enterprise System', iconURL: botAvatar })
        .setTitle('📚 Server Command & Help Directory')
        .setDescription('Welcome to the **Omni All-in-One Enterprise Platform**.\nSelect a module category from the interactive menu below to inspect commands, usage guides, and configuration options.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '📊 Command Count', value: '`76 Active Slash Commands`', inline: true },
          { name: '⚡ Prefix', value: '`Native / (Slash)`', inline: true },
          { name: '🌐 Scope', value: '`Global Instant Sync`', inline: true },
          { name: '📂 Feature Directory', value: '🛡️ **Moderation & AI** • 🎫 **Support Tickets** • 📨 **Invites & Welcomer**\n👥 **Roles & Verify** • 📈 **Leveling & XP** • 📌 **Tags & Sticky** • 🛠️ **Utility & Media**', inline: false }
        )
        .setFooter({ text: 'Select a category from the dropdown below to explore.' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], components: [this.getHelpMenuRow()] });
    }

    if (commandName === 'poll') {
      const question = options.getString('question');
      const opts = [
        options.getString('option1'),
        options.getString('option2'),
        options.getString('option3'),
        options.getString('option4')
      ].filter(Boolean);

      const pollId = `poll_${Date.now()}`;
      this.utilDb.set(pollId, {
        question,
        options: opts.map(opt => ({ text: opt, votes: [] }))
      });

      const makeBar = (pct, len = 10) => {
        const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
        return '▰'.repeat(filled) + '▱'.repeat(len - filled);
      };

      const embed = new EmbedBuilder().setColor(0x6366F1)
        .setAuthor({ name: `Poll created by ${user.username}`, iconURL: user.displayAvatarURL() })
        .setTitle(`📊 ${question}`)
        .setDescription(
          opts.map((opt, i) =>
            `**${i + 1}.** ${opt}\n\`${makeBar(0)}\` **0%** *(0 votes)*`
          ).join('\n\n') + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Click the numbered buttons below to cast or change your vote.*'
        )
        .setFooter({ text: 'Live Community Poll • Total Votes: 0' })
        .setTimestamp();

      const row = new ActionRowBuilder();
      opts.forEach((opt, i) => {
        row.addComponents(
          new ButtonBuilder().setCustomId(`${pollId}_opt_${i}`).setLabel(`Option ${i + 1}`).setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.reply({ embeds: [embed], components: [row] });
      return true;
    }

    if (commandName === 'suggest') {
      let sub = null;
      try { sub = options.getSubcommand(false); } catch (e) {}

      if (!sub || sub === 'submit') {
        const idea = options.getString('idea');
        const embed = new EmbedBuilder().setColor(0xF59E0B)
          .setAuthor({ name: `Suggestion by ${user.tag}`, iconURL: user.displayAvatarURL() })
          .setTitle('💡 Community Suggestion')
          .setDescription(`\`\`\`\n${idea}\n\`\`\`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
          .addFields(
            { name: 'Status', value: '⏳ **Pending Staff Review**', inline: true },
            { name: 'Sentiment', value: '`▰▰▰▰▱▱▱▱` **0%** *(0 votes)*', inline: true }
          )
          .setFooter({ text: 'Vote using the buttons below • 0 Upvotes | 0 Downvotes' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('suggest_up').setLabel('Upvote').setEmoji('👍').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('suggest_down').setLabel('Downvote').setEmoji('👎').setStyle(ButtonStyle.Danger)
        );

        const replyMsg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        this.utilDb.set(`sugg_${replyMsg.id}`, {
          authorId: user.id,
          upvoters: [],
          downvoters: []
        });

        return true;
      }

      if (sub === 'status') {
        const msgId = options.getString('message_id');
        const status = options.getString('status');
        const note = options.getString('note') || 'No note provided';

        const targetMsg = await channel.messages.fetch(msgId).catch(() => null);
        if (!targetMsg || targetMsg.embeds.length === 0) {
          return interaction.reply({ content: '❌ Suggestion message not found in this channel.', ephemeral: true });
        }

        const color = status === 'ACCEPTED' ? 0x57F287 : status === 'REJECTED' ? 0xED4245 : 0x5865F2;
        const statusEmoji = status === 'ACCEPTED' ? '✅ Accepted' : status === 'REJECTED' ? '❌ Rejected' : '🔍 Considered';

        const oldEmbed = targetMsg.embeds[0];
        const newEmbed = EmbedBuilder.from(oldEmbed)
          .setColor(color)
          .spliceFields(0, 1, { name: 'Status', value: `${statusEmoji} *(by ${user.username})*`, inline: true });

        if (note) {
          newEmbed.addFields({ name: 'Staff Response', value: note });
        }

        await targetMsg.edit({ embeds: [newEmbed] });
        return interaction.reply({ content: `✅ Updated suggestion to **${status}**.`, ephemeral: true });
      }
    }

    if (commandName === 'suggestion-status') {
      const msgId = options.getString('message_id');
      const status = options.getString('status');
      const note = options.getString('note') || 'No note provided';

      const targetMsg = await channel.messages.fetch(msgId).catch(() => null);
      if (!targetMsg || targetMsg.embeds.length === 0) {
        return interaction.reply({ content: '❌ Suggestion message not found in this channel.', ephemeral: true });
      }

      const color = status === 'ACCEPTED' ? 0x57F287 : status === 'REJECTED' ? 0xED4245 : 0x5865F2;
      const statusEmoji = status === 'ACCEPTED' ? '✅ Accepted' : status === 'REJECTED' ? '❌ Rejected' : '🔍 Considered';

      const oldEmbed = targetMsg.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(color)
        .spliceFields(0, 1, { name: 'Status', value: `${statusEmoji} *(by ${user.username})*`, inline: true });

      if (note) {
        newEmbed.addFields({ name: 'Staff Response', value: note });
      }

      await targetMsg.edit({ embeds: [newEmbed] });
      return interaction.reply({ content: `✅ Updated suggestion to **${status}**.`, ephemeral: true });
    }

    if (commandName === 'remind') {
      const minutes = options.getInteger('minutes');
      const text = options.getString('reminder');
      const triggerAt = Date.now() + minutes * 60000;

      const reminderId = `remind_${Date.now()}_${user.id}`;
      this.utilDb.set(reminderId, {
        userId: user.id,
        channelId: channel.id,
        guildId: guild?.id,
        text,
        triggerAt
      });

      return interaction.reply({ content: `⏰ Reminder scheduled for **${minutes} minute(s)** from now: *"${text}"*`, ephemeral: true });
    }

    if (commandName === 'serverstats') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const cat = await guild.channels.create({
          name: '📊 SERVER STATS',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
        });

        const totalChan = await guild.channels.create({
          name: `Members: ${guild.memberCount.toLocaleString()}`,
          type: ChannelType.GuildVoice,
          parent: cat.id,
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }]
        });

        this.utilDb.set(`stats_${guild.id}`, {
          categoryId: cat.id,
          channelId: totalChan.id
        });

        return interaction.editReply('✅ Server stats channel deployed.');
      } catch (err) {
        return interaction.editReply(`❌ Failed: ${err.message}`);
      }
    }

    // --- INVITE TRACKER SUITE ---
    if (commandName === 'invites' || commandName === 'add-invites' || commandName === 'remove-invites' || commandName === 'reset-invites' || commandName === 'invites-leaderboard' || commandName === 'invite-rewards') {
      let subGroup = null;
      let sub = null;
      try { subGroup = options.getSubcommandGroup(false); } catch (e) {}
      try { sub = options.getSubcommand(false); } catch (e) {}

      if (commandName === 'add-invites' || (commandName === 'invites' && sub === 'add')) {
        const target = options.getUser('target');
        const amount = options.getInteger('amount');
        const key = `${guild.id}_${target.id}`;
        const data = this.db.get(key) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
        data.bonus = (data.bonus || 0) + amount;
        this.db.set(key, data);

        const total = data.regular - data.leaves - data.fake + data.bonus;
        await this.checkInviteRewards(guild, target.id);

        return interaction.reply({ content: `✅ Added **+${amount} bonus invites** to <@${target.id}>. Total real invites: **${total}**.` });
      }

      if (commandName === 'remove-invites' || (commandName === 'invites' && sub === 'remove')) {
        const target = options.getUser('target');
        const amount = options.getInteger('amount');
        const key = `${guild.id}_${target.id}`;
        const data = this.db.get(key) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
        data.bonus = (data.bonus || 0) - amount;
        this.db.set(key, data);

        const total = data.regular - data.leaves - data.fake + data.bonus;
        return interaction.reply({ content: `✅ Deducted **-${amount} bonus invites** from <@${target.id}>. Total real invites: **${total}**.` });
      }

      if (commandName === 'reset-invites' || (commandName === 'invites' && sub === 'reset')) {
        const target = options.getUser('target');
        if (target) {
          this.db.delete(`${guild.id}_${target.id}`);
          return interaction.reply({ content: `✅ Reset invite statistics for <@${target.id}>.` });
        } else {
          const prefix = `${guild.id}_`;
          for (const k of this.db.keys()) {
            if (k.startsWith(prefix)) this.db.delete(k);
          }
          return interaction.reply({ content: '✅ Reset all invite statistics for this server.' });
        }
      }

      if (commandName === 'invites' && sub === 'sync') {
        await interaction.deferReply({ ephemeral: false });
        const res = await this.syncInvitesFromChannelsAndAuditLogs(guild);
        if (res.success) {
          return interaction.editReply({
            content: `✅ **Invite Portfolio Synchronized & Reconciled!**\n` +
              `• Channels Scanned: \`${res.totalChannelsScanned}\` (#invites-tracker, #modlogs, #welcome-hub)\n` +
              `• Inviters Synchronized: \`${res.syncedInviters}\`\n` +
              `• Backed up directly into \`#🤖・bot-memory\` vault.`
          });
        } else {
          return interaction.editReply({ content: `❌ Sync failed: ${res.error}` });
        }
      }

      if (commandName === 'invites-leaderboard' || (commandName === 'invites' && sub === 'leaderboard')) {

        const prefix = `${guild.id}_`;
        const entries = [];

        for (const [k, v] of this.db.entries()) {
          if (k.startsWith(prefix) && !k.startsWith('invitedBy_') && !k.startsWith('invite_rewards_')) {
            const userId = k.replace(prefix, '');
            const bonus = v.bonus || 0;
            const total = (v.regular || 0) - (v.leaves || 0) - (v.fake || 0) + bonus;
            if (total > 0 || (v.regular || 0) > 0) {
              entries.push({ userId, total, regular: v.regular || 0, leaves: v.leaves || 0, fake: v.fake || 0, bonus });
            }
          }
        }

        entries.sort((a, b) => b.total - a.total);
        const top10 = entries.slice(0, 10);

        const embed = new EmbedBuilder().setColor(0xF59E0B)
          .setAuthor({ name: 'Server Leaderboard', iconURL: guild.iconURL() })
          .setTitle(`🏆 Top Inviters • ${guild.name}`)
          .setDescription(top10.length > 0
            ? top10.map((e, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
                return `${medal} <@${e.userId}>\n　└ **${e.total} real** • *${e.regular} joins • ${e.leaves} leaves • ${e.bonus} bonus*`;
              }).join('\n\n') + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
            : 'No invites recorded yet.')
          .setFooter({ text: 'Formula: Real Invites = Regular - Leaves - Fake + Bonus' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      if (commandName === 'invite-rewards' || subGroup === 'reward') {
        const rewardSub = sub;
        const rewardsKey = `invite_rewards_${guild.id}`;
        const rewards = this.db.get(rewardsKey) || [];

        if (rewardSub === 'add') {
          const milestone = options.getInteger('invites');
          const role = options.getRole('role');

          const existingIdx = rewards.findIndex(r => r.invites === milestone);
          if (existingIdx !== -1) {
            rewards[existingIdx].roleId = role.id;
          } else {
            rewards.push({ invites: milestone, roleId: role.id });
          }
          rewards.sort((a, b) => a.invites - b.invites);
          this.db.set(rewardsKey, rewards);

          return interaction.reply({ content: `✅ Configured milestone reward: **${milestone} invites** gives <@&${role.id}>.` });
        }

        if (rewardSub === 'remove') {
          const milestone = options.getInteger('invites');
          const updated = rewards.filter(r => r.invites !== milestone);
          this.db.set(rewardsKey, updated);
          return interaction.reply({ content: `✅ Removed reward for milestone **${milestone} invites**.` });
        }

        if (rewardSub === 'list') {
          const embed = new EmbedBuilder().setColor(0x5865F2)
            .setTitle(`🎁 Invite Milestone Role Rewards`)
            .setDescription(rewards.length > 0
              ? rewards.map(r => `• **${r.invites} Invites:** <@&${r.roleId}>`).join('\n')
              : 'No invite rewards configured. Use `/invites reward add` to create one.')
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }
      }

      // Default invites check (sub === 'check' or direct /invites)
      const target = options.getUser('target') || user;
      const data = this.db.get(`${guild.id}_${target.id}`) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
      const bonus = data.bonus || 0;
      const total = data.regular - data.leaves - data.fake + bonus;

      const embed = new EmbedBuilder().setColor(0x10B981)
        .setAuthor({ name: `${target.tag} • Invite Portfolio`, iconURL: target.displayAvatarURL() })
        .setTitle('📨 Verified Invite Statistics')
        .setDescription(
          `**Total Real Invites:** \`${total} Invites\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `▸ 📥 **Regular Joined:** \`${data.regular}\`\n` +
          `▸ 🚪 **Members Left:** \`${data.leaves}\`\n` +
          `▸ ⚠️ **Fake / <24h Old:** \`${data.fake}\`\n` +
          `▸ 🎁 **Staff Bonus:** \`${bonus}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: `${guild.name} • (Regular - Leaves - Fake + Bonus)`, iconURL: guild.iconURL() })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'userinfo') {
      const target = options.getUser('target') || user;
      const member = await guild.members.fetch(target.id).catch(() => null);

      const roles = member ? member.roles.cache.filter(r => r.id !== guild.id).map(r => `<@&${r.id}>`).join(' ') : 'None';
      const createdTs = Math.floor(target.createdTimestamp / 1000);
      const joinedTs = member ? Math.floor(member.joinedTimestamp / 1000) : null;

      const embed = new EmbedBuilder().setColor(member?.displayColor || 0x6366F1)
        .setAuthor({ name: `Profile: ${target.tag}`, iconURL: target.displayAvatarURL() })
        .setThumbnail(target.displayAvatarURL({ size: 256 }))
        .setTitle(`👤 ${member?.nickname ? `${member.nickname} (${target.username})` : target.username}`)
        .setDescription('Detailed member account ledger & server permissions.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '🆔 User Identifier', value: `\`${target.id}\``, inline: true },
          { name: '🏷️ Member Nickname', value: member?.nickname ? `\`${member.nickname}\`` : '*No custom nick*', inline: true },
          { name: '🤖 Account Classification', value: target.bot ? '`🤖 Bot Automation`' : '`👤 Human Member`', inline: true },
          { name: '📅 Discord Registration', value: `<t:${createdTs}:F>\n└ <t:${createdTs}:R>`, inline: true },
          { name: '📥 Server Joined On', value: joinedTs ? `<t:${joinedTs}:F>\n└ <t:${joinedTs}:R>` : 'Unknown', inline: true },
          { name: '👑 Highest Role', value: member?.roles.highest ? `<@&${member.roles.highest.id}>` : '*None*', inline: true },
          { name: `🛡️ Assigned Roles [${member ? member.roles.cache.size - 1 : 0}]`, value: (roles && roles.length > 0 ? roles.slice(0, 1024) : '*No roles assigned*'), inline: false }
        )
        .setFooter({ text: `Requested by ${user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'serverinfo') {
      const owner = await guild.fetchOwner().catch(() => null);
      const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
      const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).size;
      const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
      const createdTs = Math.floor(guild.createdTimestamp / 1000);

      const embed = new EmbedBuilder().setColor(0x6366F1)
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
        .setThumbnail(guild.iconURL({ size: 256 }))
        .setTitle('📊 Comprehensive Server Overview')
        .setDescription('Server infrastructure, channel topology, and membership metrics.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
          { name: '👑 Server Ownership', value: owner ? `<@${owner.id}>\n└ \`${owner.user.tag}\`` : 'Unknown', inline: true },
          { name: '🆔 Server Identifier', value: `\`${guild.id}\``, inline: true },
          { name: '📅 Creation Date', value: `<t:${createdTs}:D>\n└ <t:${createdTs}:R>`, inline: true },
          { name: '👥 Member Population', value: `Total: **${guild.memberCount.toLocaleString()}** members`, inline: true },
          { name: '🚀 Boost Status', value: `Tier **${guild.premiumTier || 0}** • **${guild.premiumSubscriptionCount || 0}** Boosts`, inline: true },
          { name: '🛡️ Roles Count', value: `**${guild.roles.cache.size}** configured roles`, inline: true },
          { name: '💬 Channel Topology', value: `💬 **${textChannels}** Text Channels • 🎙️ **${voiceChannels}** Voice Channels • 📁 **${categories}** Categories`, inline: false }
        )
        .setFooter({ text: `Server Overview • Requested by ${user.username}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'roleinfo') {
      const role = options.getRole('role');
      const createdTs = Math.floor(role.createdTimestamp / 1000);

      const embed = new EmbedBuilder().setColor(role.color || 0x5865F2)
        .setTitle(`🛡️ Role Information: @${role.name}`)
        .addFields(
          { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          { name: 'Color Hex', value: `\`${role.hexColor}\``, inline: true },
          { name: 'Position', value: `${role.position} / ${guild.roles.cache.size}`, inline: true },
          { name: 'Members with Role', value: `${role.members.size}`, inline: true },
          { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
          { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
          { name: 'Created On', value: `<t:${createdTs}:F> (<t:${createdTs}:R>)`, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'avatar') {
      const target = options.getUser('target') || user;
      const avatarPng = target.displayAvatarURL({ extension: 'png', size: 4096 });
      const avatarWebp = target.displayAvatarURL({ extension: 'webp', size: 4096 });

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`🖼️ Avatar: ${target.tag}`)
        .setDescription(`[PNG](${avatarPng}) | [WEBP](${avatarWebp})`)
        .setImage(avatarPng);

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'banner') {
      const target = options.getUser('target') || user;
      const fetchedUser = await this.client.users.fetch(target.id, { force: true }).catch(() => null);
      const bannerUrl = fetchedUser?.bannerURL({ size: 4096 });

      if (!bannerUrl) {
        return interaction.reply({ content: `❌ **${target.username}** does not have a custom profile banner.`, ephemeral: true });
      }

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`🖼️ Banner: ${target.tag}`)
        .setDescription(`[Open Full Image](${bannerUrl})`)
        .setImage(bannerUrl);

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'embed') {
      const title = options.getString('title');
      const description = options.getString('description');
      const rawColor = options.getString('color');
      const image = options.getString('image');
      const thumbnail = options.getString('thumbnail');
      const footer = options.getString('footer');

      let color = 0x5865F2;
      if (rawColor) {
        if (rawColor.toUpperCase() === 'GREEN') color = 0x57F287;
        else if (rawColor.toUpperCase() === 'RED') color = 0xED4245;
        else if (rawColor.toUpperCase() === 'YELLOW') color = 0xFEE75C;
        else if (rawColor.toUpperCase() === 'BLUE') color = 0x5865F2;
        else {
          const parsed = parseInt(rawColor.replace('#', ''), 16);
          if (!isNaN(parsed)) color = parsed;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

      if (image) embed.setImage(image);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({ text: footer });

      await interaction.channel.send({ embeds: [embed] });
      return interaction.reply({ content: '✅ Custom embed announcement published!', ephemeral: true });
    }

    // --- WELCOMER SUITE ---
    if (commandName === 'welcomer') {
      const sub = options.getSubcommand();
      const wKey = `welcomer_${guild.id}`;
      const config = this.utilDb.get(wKey) || { theme: 'dark', cardEnabled: true };

      if (sub === 'set') {
        const welcomeChan = options.getChannel('channel');
        const message = options.getString('message');
        const theme = options.getString('theme');
        const bgUrl = options.getString('bg_url');
        const cardEnabled = options.getBoolean('card_enabled');
        const dmEnabled = options.getBoolean('dm_enabled');
        const dmMessage = options.getString('dm_message');

        if (welcomeChan) config.channelId = welcomeChan.id;
        if (message !== null) config.message = message;
        if (theme) config.theme = theme;
        if (bgUrl) config.bgUrl = bgUrl;
        if (cardEnabled !== null) config.cardEnabled = cardEnabled;
        if (dmEnabled !== null) config.dmEnabled = dmEnabled;
        if (dmMessage !== null) config.dmMessage = dmMessage;
        config.enabled = true;

        this.utilDb.set(wKey, config);
        return interaction.reply({
          content: `✅ Welcome settings updated!\n• Welcome Channel: ${config.channelId ? `<#${config.channelId}>` : 'Default'}\n• Theme: **${config.theme || 'server'}**\n• Custom Background: **${config.bgUrl ? 'Custom Image Bound' : 'Auto Server Banner'}**\n• Canvas Card: **${config.cardEnabled !== false ? 'Enabled' : 'Disabled'}**\n• DM on Join: **${config.dmEnabled ? 'Enabled' : 'Disabled'}**\n• Custom Message: ${config.message ? `"${config.message}"` : 'Default'}`,
          ephemeral: true
        });
      }

      if (sub === 'leave' || sub === 'leave-set') {
        const leaveChan = options.getChannel('channel');
        const message = options.getString('message');
        const cardEnabled = options.getBoolean('card_enabled');
        const dmEnabled = options.getBoolean('dm_enabled');
        const dmMessage = options.getString('dm_message');

        if (leaveChan) config.leaveChannelId = leaveChan.id;
        if (message !== null) config.leaveMessage = message;
        if (cardEnabled !== null) config.leaveCardEnabled = cardEnabled;
        if (dmEnabled !== null) config.leaveDmEnabled = dmEnabled;
        if (dmMessage !== null) config.leaveDmMessage = dmMessage;
        config.leaveEnabled = true;

        this.utilDb.set(wKey, config);
        return interaction.reply({
          content: `✅ Leave settings updated!\n• Leave Channel: ${config.leaveChannelId ? `<#${config.leaveChannelId}>` : 'Default'}\n• Canvas Leave Card: **${config.leaveCardEnabled !== false ? 'Enabled' : 'Disabled'}**\n• Leave DM: **${config.leaveDmEnabled ? 'Enabled' : 'Disabled'}**\n• Leave Message: ${config.leaveMessage ? `"${config.leaveMessage}"` : 'Default'}`,
          ephemeral: true
        });
      }

      if (sub === 'test') {
        const type = options.getString('type');
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member;

        try {
          if (config.cardEnabled !== false) {
            try {
              const cardBuffer = await this.generateCard(member, config.theme || 'dark', type);
              const fileName = type === 'join' ? 'welcome.png' : 'leave.png';
              const attachment = new AttachmentBuilder(cardBuffer, { name: fileName });
              const embed = this.buildWelcomerEmbed(member, config, type);

              await interaction.editReply({
                content: `<@${member.id}>`,
                embeds: [embed],
                files: [attachment]
              });
              return true;
            } catch (cardErr) {
              const embed = this.buildWelcomerEmbed(member, config, type);
              embed.setImage(null);
              await interaction.editReply({
                content: `<@${member.id}>`,
                embeds: [embed]
              });
              return true;
            }
          } else {
            const textMsg = this.buildWelcomerTextMessage(member, config, type);
            await interaction.editReply({
              content: textMsg
            });
            return true;
          }
        } catch (err) {
          return interaction.editReply(`❌ Simulation error: ${err.message}`);
        }
      }

      if (sub === 'disable') {
        config.enabled = false;
        config.dmEnabled = false;
        config.leaveEnabled = false;
        this.utilDb.set(wKey, config);
        return interaction.reply({ content: '✅ Custom welcomer and leave notifications disabled.', ephemeral: true });
      }
    }

    if (commandName === 'channelinfo') {
      const targetChan = options.getChannel('channel') || channel;
      const createdTs = Math.floor(targetChan.createdTimestamp / 1000);

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`📁 Channel Info: #${targetChan.name}`)
        .addFields(
          { name: 'Channel ID', value: `\`${targetChan.id}\``, inline: true },
          { name: 'Type', value: `${targetChan.type}`, inline: true },
          { name: 'Category', value: targetChan.parent ? targetChan.parent.name : 'None', inline: true },
          { name: 'Topic', value: targetChan.topic || 'No topic set', inline: false },
          { name: 'NSFW', value: targetChan.nsfw ? '🔞 Yes' : 'No', inline: true },
          { name: 'Slowmode', value: `${targetChan.rateLimitPerUser || 0}s`, inline: true },
          { name: 'Created On', value: `<t:${createdTs}:F> (<t:${createdTs}:R>)`, inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'emojiinfo') {
      const emojiInput = options.getString('emoji');
      const customEmojiMatch = emojiInput.match(/<?(a)?:?(\w{2,32}):(\d{17,20})>?/);

      if (!customEmojiMatch) {
        return interaction.reply({ content: 'ℹ️ That is a standard unicode emoji or invalid custom emoji format.', ephemeral: true });
      }

      const isAnimated = Boolean(customEmojiMatch[1]);
      const emojiName = customEmojiMatch[2];
      const emojiId = customEmojiMatch[3];
      const extension = isAnimated ? 'gif' : 'png';
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?quality=lossless`;

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`😀 Emoji Info: :${emojiName}:`)
        .setThumbnail(emojiUrl)
        .addFields(
          { name: 'Name', value: `\`${emojiName}\``, inline: true },
          { name: 'ID', value: `\`${emojiId}\``, inline: true },
          { name: 'Animated', value: isAnimated ? '✨ Yes' : 'No', inline: true },
          { name: 'Direct Link', value: `[Open Image](${emojiUrl})`, inline: false }
        )
        .setImage(emojiUrl);

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'bump' || commandName === 'bump-reminder') {
      const sub = options.getSubcommand();
      const cfgKey = `bump_cfg_${guild.id}`;
      const timerKey = `bump_timer_${guild.id}`;

      if (sub === 'disable') {
        this.utilDb.delete(cfgKey);
        this.utilDb.delete(timerKey);
        return interaction.reply({ content: '✅ Bump reminders have been disabled for this server.', ephemeral: true });
      }

      if (sub === 'set') {
        const targetChannel = options.getChannel('channel') || channel;
        const role = options.getRole('role');

        const cfg = {
          channelId: targetChannel.id,
          roleId: role ? role.id : null,
          updatedAt: Date.now()
        };
        this.utilDb.set(cfgKey, cfg);

        return interaction.reply({
          content: `✅ Bump reminders configured for <#${targetChannel.id}>!${role ? ` Target ping role: <@&${role.id}>.` : ' (Will ping @everyone)'}\nWhen someone runs \`/bump\` with Disboard or Bump Buddy, I will automatically start a 2-hour countdown and alert the channel when it is time to bump again.`,
          ephemeral: true
        });
      }

      if (sub === 'status') {
        const cfg = this.utilDb.get(cfgKey) || {};
        const activeTimer = this.utilDb.get(timerKey);

        const chMention = cfg.channelId ? `<#${cfg.channelId}>` : `Default (Channel where bump occurs)`;
        const roleMention = cfg.roleId ? `<@&${cfg.roleId}>` : `@everyone`;

        let timerText = '💤 No active countdown. Run `/bump` to start tracking!';
        if (activeTimer && activeTimer.triggerAt) {
          const ts = Math.floor(activeTimer.triggerAt / 1000);
          if (Date.now() >= activeTimer.triggerAt) {
            timerText = '⏰ **Ready right now!** Type `/bump`!';
          } else {
            timerText = `⏳ **Next bump ready:** <t:${ts}:T> (<t:${ts}:R>)`;
          }
        }

        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setTitle('🚀 Automated Bump Reminder Status')
          .addFields(
            { name: '📍 Target Channel', value: chMention, inline: true },
            { name: '🔔 Ping Role', value: roleMention, inline: true },
            { name: '⏱️ Cooldown Status', value: timerText, inline: false }
          )
          .setFooter({ text: 'Supports Disboard, Bump Buddy, and Partner Bump Bots' })
          .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'test') {
        const cfg = this.utilDb.get(cfgKey) || {};
        const targetChannel = cfg.channelId ? (await this.client.channels.fetch(cfg.channelId).catch(() => channel)) : channel;
        const roleMention = cfg.roleId ? `<@&${cfg.roleId}>` : `@everyone`;

        const testEmbed = new EmbedBuilder().setColor(0x2ECC71)
          .setTitle('⏰ [TEST] TIME TO BUMP THE SERVER!')
          .setDescription(`This is a test of the automated bump reminder system.\n\n👉 Type **\`/bump\`** right now to boost our server ranking and get new members!`)
          .setFooter({ text: 'Automated Bump Reminder' })
          .setTimestamp();

        await targetChannel.send({ content: `🔔 ${roleMention} **Bump Reminder Alert!**`, embeds: [testEmbed] }).catch(() => {});
        return interaction.reply({ content: `✅ Test bump alert dispatched to <#${targetChannel.id}>.`, ephemeral: true });
      }
    }

    return false;
  }

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
      const category = interaction.values[0];
      const embed = this.getCategoryEmbed(category);
      await interaction.update({ embeds: [embed], components: [this.getHelpMenuRow()] });
      return true;
    }

    if (!interaction.isButton()) return false;

    // Suggestion Votes
    if (interaction.customId === 'suggest_up' || interaction.customId === 'suggest_down') {
      const msgId = interaction.message.id;
      const data = this.utilDb.get(`sugg_${msgId}`);
      if (!data) return interaction.reply({ content: '❌ Suggestion data expired.', ephemeral: true });

      const uid = interaction.user.id;
      if (interaction.customId === 'suggest_up') {
        data.downvoters = data.downvoters.filter(id => id !== uid);
        if (data.upvoters.includes(uid)) {
          data.upvoters = data.upvoters.filter(id => id !== uid);
        } else {
          data.upvoters.push(uid);
        }
      } else {
        data.upvoters = data.upvoters.filter(id => id !== uid);
        if (data.downvoters.includes(uid)) {
          data.downvoters = data.downvoters.filter(id => id !== uid);
        } else {
          data.downvoters.push(uid);
        }
      }

      this.utilDb.set(`sugg_${msgId}`, data);

      const up = data.upvoters.length;
      const down = data.downvoters.length;
      const total = up + down;
      const approvalPct = total > 0 ? Math.round((up / total) * 100) : 0;
      const makeBar = (pct, len = 10) => {
        const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
        return '▰'.repeat(filled) + '▱'.repeat(len - filled);
      };
      const sentimentStr = total > 0
        ? `\`${makeBar(approvalPct)}\` **${approvalPct}%** *(${total} votes)*`
        : '`▰▰▰▰▱▱▱▱` **0%** *(0 votes)*';

      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(1, 1, { name: 'Sentiment', value: sentimentStr, inline: true })
        .setFooter({ text: `Vote using buttons below • 👍 ${up} Upvotes | 👎 ${down} Downvotes` });

      await interaction.update({ embeds: [newEmbed] });
      return true;
    }

    // Poll Votes
    if (interaction.customId.startsWith('poll_')) {
      const parts = interaction.customId.split('_opt_');
      const pollId = parts[0];
      const optIdx = parseInt(parts[1], 10);
      const poll = this.utilDb.get(pollId);
      if (!poll) return interaction.reply({ content: '❌ Poll expired.', ephemeral: true });

      const uid = interaction.user.id;
      poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(id => id !== uid);
      });
      poll.options[optIdx].votes.push(uid);
      this.utilDb.set(pollId, poll);

      const makeBar = (pct, len = 10) => {
        const filled = Math.max(0, Math.min(len, Math.round((pct / 100) * len)));
        return '▰'.repeat(filled) + '▱'.repeat(len - filled);
      };

      const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
      const desc = poll.options.map((opt, i) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
        return `**${i + 1}.** ${opt.text}\n\`${makeBar(pct)}\` **${pct}%** *(${opt.votes.length} votes)*`;
      }).join('\n\n') + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n*Click the numbered buttons below to cast or change your vote.*';

      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .setDescription(desc)
        .setFooter({ text: `Live Community Poll • Total Votes: ${totalVotes}` });
      await interaction.update({ embeds: [newEmbed] });
      return true;
    }

    return false;
  }

  async checkReminders() {
    const now = Date.now();
    for (const [key, rem] of this.utilDb.entries()) {
      if (key.startsWith('remind_') && rem.triggerAt && rem.triggerAt <= now) {
        try {
          const user = await this.client.users.fetch(rem.userId).catch(() => null);
          if (user) {
            await user.send(`🔔 **REMINDER:** ${rem.text}`).catch(async () => {
              const channel = await this.client.channels.fetch(rem.channelId).catch(() => null);
              if (channel) channel.send(`🔔 <@${rem.userId}> **REMINDER:** ${rem.text}`).catch(() => {});
            });
          }
        } catch (e) {}
        this.utilDb.delete(key);
      } else if (key.startsWith('bump_timer_') && rem.triggerAt && rem.triggerAt <= now) {
        try {
          const cfg = this.utilDb.get(`bump_cfg_${rem.guildId || ''}`) || {};
          const targetChanId = cfg.channelId || rem.channelId;
          const channel = await this.client.channels.fetch(targetChanId).catch(() => null);
          if (channel) {
            const roleMention = cfg.roleId ? `<@&${cfg.roleId}>` : `@everyone`;
            const alertEmbed = new EmbedBuilder().setColor(0x5865F2)
              .setTitle('⏰ IT IS TIME TO BUMP!')
              .setDescription(`It has been **2 hours** since the last bump!\n\n👉 Type **\`/bump\`** right now to boost our server ranking and get new members!`)
              .setFooter({ text: 'Automated Bump Reminder' })
              .setTimestamp();

            await channel.send({ content: `🔔 ${roleMention} **Bump Reminder!**`, embeds: [alertEmbed] }).catch(() => {});
          }
        } catch (e) {}
        this.utilDb.delete(key);
      }
    }
  }

  async updateServerStats() {
    for (const guild of this.client.guilds.cache.values()) {
      const stats = this.utilDb.get(`stats_${guild.id}`);
      if (stats && stats.channelId) {
        const chan = guild.channels.cache.get(stats.channelId);
        if (chan) {
          chan.setName(`Members: ${guild.memberCount.toLocaleString()}`).catch(() => {});
        }
      }
    }
  }

  async checkInviteRewards(guild, userId) {
    try {
      const key = `${guild.id}_${userId}`;
      const data = this.db.get(key);
      if (!data) return;

      const bonus = data.bonus || 0;
      const total = (data.regular || 0) - (data.leaves || 0) - (data.fake || 0) + bonus;

      const rewardsKey = `invite_rewards_${guild.id}`;
      const rewards = this.db.get(rewardsKey) || [];

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return;

      for (const r of rewards) {
        if (total >= r.invites) {
          if (!member.roles.cache.has(r.roleId)) {
            await member.roles.add(r.roleId).catch(() => {});
          }
        }
      }
    } catch (e) {}
  }

  getOrdinal(n) {
    const num = parseInt(n, 10) || 1;
    const s = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  async generateCard(member, theme = 'dark', type = 'join') {
    const width = 760;
    const height = 210;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const isJoin = type === 'join';
    const serverName = member.guild?.name || 'EDITX | The Creative Network';
    const memberNum = member.guild?.memberCount || 1;
    const ordinal = this.getOrdinal(memberNum);

    // 1. Check for custom background image (bg_url or server banner / splash)
    let bgImage = null;
    const config = (member.guild?.id && this.utilDb.get(`welcomer_${member.guild.id}`)) || {};
    const customBgUrl = config.bgUrl;
    const guildBannerUrl = (member.guild?.bannerURL && typeof member.guild.bannerURL === 'function')
      ? member.guild.bannerURL({ extension: 'png', size: 1024 })
      : null;
    const guildSplashUrl = (member.guild?.splashURL && typeof member.guild.splashURL === 'function')
      ? member.guild.splashURL({ extension: 'png', size: 1024 })
      : null;

    const targetBgUrl = customBgUrl || (theme === 'server' ? (guildBannerUrl || guildSplashUrl) : null);

    if (targetBgUrl) {
      try {
        bgImage = await loadImage(targetBgUrl).catch(() => null);
      } catch (e) {}
    }

    if (bgImage) {
      // Draw background image clipped to card with frosted dark tint
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 16);
      ctx.clip();

      const hRatio = width / bgImage.width;
      const vRatio = height / bgImage.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (width - bgImage.width * ratio) / 2;
      const centerShiftY = (height - bgImage.height * ratio) / 2;
      ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height, centerShiftX, centerShiftY, bgImage.width * ratio, bgImage.height * ratio);

      const glassTint = ctx.createLinearGradient(0, 0, width, height);
      glassTint.addColorStop(0, 'rgba(14, 16, 22, 0.82)');
      glassTint.addColorStop(1, 'rgba(18, 22, 30, 0.88)');
      ctx.fillStyle = glassTint;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    } else {
      // Clean, elegant obsidian luxury card background
      const darkGrad = ctx.createLinearGradient(0, 0, width, height);
      darkGrad.addColorStop(0, '#0F1117');
      darkGrad.addColorStop(0.5, '#141721');
      darkGrad.addColorStop(1, '#1A1D2B');
      ctx.fillStyle = darkGrad;
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 16);
      ctx.fill();

      // Subtle ambient avatar glow
      const avatarGlow = ctx.createRadialGradient(100, 105, 10, 100, 105, 160);
      avatarGlow.addColorStop(0, isJoin ? 'rgba(99, 102, 241, 0.28)' : 'rgba(239, 68, 68, 0.25)');
      avatarGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = avatarGlow;
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 16);
      ctx.fill();
    }

    // Outer crisp border
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, 16);
    ctx.stroke();

    // Left Side: Avatar
    const avX = 95;
    const avY = 105;
    const avRadius = 52;

    const avatarUrl = member.user
      ? (typeof member.user.displayAvatarURL === 'function' ? member.user.displayAvatarURL({ extension: 'png', size: 256 }) : null)
      : (member.displayAvatarURL ? member.displayAvatarURL({ extension: 'png', size: 256 }) : null);

    if (avatarUrl) {
      try {
        const avatar = await loadImage(avatarUrl).catch(() => null);
        if (avatar) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avX, avY, avRadius, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(avatar, avX - avRadius, avY - avRadius, avRadius * 2, avRadius * 2);
          ctx.restore();
        }
      } catch (e) {}
    }

    // Crisp glowing avatar ring
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = isJoin ? '#6366F1' : '#EF4444';
    ctx.beginPath();
    ctx.arc(avX, avY, avRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Right Side: Clean Typography & Modern Pill Badge
    const textX = 185;
    let name = member.user?.username || member.displayName || 'Member';
    if (name.length > 20) name = name.substring(0, 20) + '...';

    // Top Pill Badge
    if (isJoin) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.beginPath();
      ctx.roundRect(textX, 42, 125, 24, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#818CF8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`MEMBER #${memberNum}`, textX + 18, 58);
    }

    // Line 1: Welcome [Username]
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, textX, isJoin ? 104 : 94);

    // Line 2: to [Server] you are the [144th] member!
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#94A3B8';
    const subText = isJoin ? `Welcome to ${serverName}` : `Departed from ${serverName}`;
    ctx.fillText(subText, textX, isJoin ? 138 : 134);

    return canvas.toBuffer();
  }

  buildWelcomerEmbed(member, config = {}, type = 'join') {
    const isJoin = type === 'join';
    const guild = member.guild;
    const memberNum = guild?.memberCount || 1;
    const ordinal = this.getOrdinal(memberNum);
    const serverName = guild?.name || 'EDITX | The Creative Network';
    const serverIcon = (guild?.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : null;
    const username = member.user?.username || member.displayName || 'Member';

    // Discover server navigation channels dynamically
    const chanList = guild?.channels?.cache ? Array.from(guild.channels.cache.values()).filter(Boolean) : [];
    const rolesChan = chanList.find(c => c.name && (c.name.includes('get-roles') || c.name.includes('role') || c.name.includes('verify'))) || null;
    const rulesChan = chanList.find(c => c.name && (c.name.includes('rule') || c.name.includes('guideline'))) || null;
    const chatChan = chanList.find(c => c.name && (c.name.includes('general') || c.name.includes('chat') || c.name.includes('lounge') || c.name.includes('discussion'))) || null;

    const navLines = [];
    if (rolesChan) navLines.push(`▸ 🎭 **Select Roles** ➔ <#${rolesChan.id}>`);
    if (rulesChan) navLines.push(`▸ 📜 **Server Rules** ➔ <#${rulesChan.id}>`);
    if (chatChan) navLines.push(`▸ 💬 **Community Lounge** ➔ <#${chatChan.id}>`);

    const navSection = navLines.length > 0 ? `\n\n### ⚡ Quick Navigation\n${navLines.join('\n')}` : '';

    const createdTs = member.user?.createdTimestamp ? Math.floor(member.user.createdTimestamp / 1000) : null;
    const accountAgeText = createdTs ? `<t:${createdTs}:R>` : 'Recent';

    let desc = '';
    if (isJoin) {
      if (config.message && config.message.trim()) {
        desc = config.message
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\{server\}/gi, serverName)
          .replace(/#\{membercount\}/gi, `#${memberNum}`)
          .replace(/\{membercount\}/gi, `${ordinal}`);
      } else {
        desc = `Welcome to **${serverName}** — the premier community for video editors, VFX artists, and creative minds.${navSection}\n\n` +
          `> 👤 **Member Position:** \`#${memberNum}\`　•　📅 **Account Created:** ${accountAgeText}`;
      }
    } else {
      if (config.leaveMessage && config.leaveMessage.trim()) {
        desc = config.leaveMessage
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\{server\}/gi, serverName)
          .replace(/#\{membercount\}/gi, `#${memberNum}`)
          .replace(/\{membercount\}/gi, `${ordinal}`);
      } else {
        desc = `**${username}** has departed from **${serverName}**.\n\n` +
          `> 👥 **Remaining Members:** \`#${memberNum}\``;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(isJoin ? 0x5865F2 : 0xED4245)
      .setAuthor({
        name: `${serverName} • ${isJoin ? 'Welcome Desk' : 'Departure'}`,
        iconURL: serverIcon || undefined
      })
      .setTitle(isJoin ? `✦ Welcome to ${serverName}, ${username}!` : `Goodbye ${username}!`)
      .setDescription(desc)
      .setImage(`attachment://${isJoin ? 'welcome' : 'leave'}.png`)
      .setFooter({
        text: `${serverName} • Member #${memberNum}`,
        iconURL: serverIcon || undefined
      })
      .setTimestamp();

    return embed;
  }

  buildWelcomerTextMessage(member, config = {}, type = 'join') {
    const isJoin = type === 'join';
    const guild = member.guild;
    const memberNum = guild?.memberCount || 1;
    const ordinal = this.getOrdinal(memberNum);
    const serverName = guild?.name || 'EDITX | The Creative Network';
    const username = member.user?.username || member.displayName || 'Member';

    // Discover server navigation channels dynamically
    const chanList = guild?.channels?.cache ? Array.from(guild.channels.cache.values()).filter(Boolean) : [];
    const rolesChan = chanList.find(c => c.name && (c.name.includes('get-roles') || c.name.includes('role') || c.name.includes('verify'))) || null;
    const rulesChan = chanList.find(c => c.name && (c.name.includes('rule') || c.name.includes('guideline'))) || null;
    const chatChan = chanList.find(c => c.name && (c.name.includes('general') || c.name.includes('chat') || c.name.includes('lounge') || c.name.includes('discussion'))) || null;

    const navParts = [];
    if (rolesChan) navParts.push(`🎭 **Roles:** <#${rolesChan.id}>`);
    if (rulesChan) navParts.push(`📜 **Rules:** <#${rulesChan.id}>`);
    if (chatChan) navParts.push(`💬 **Chat:** <#${chatChan.id}>`);

    const navLine = navParts.length > 0 ? `\n> ⚡ **Quick Start:** ${navParts.join('  •  ')}` : '';

    const createdTs = member.user?.createdTimestamp ? Math.floor(member.user.createdTimestamp / 1000) : null;
    const accountAgeText = createdTs ? `<t:${createdTs}:R>` : 'Recent';

    if (isJoin) {
      if (config.message && config.message.trim()) {
        return config.message
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\{server\}/gi, serverName)
          .replace(/#\{membercount\}/gi, `#${memberNum}`)
          .replace(/\{membercount\}/gi, `${ordinal}`);
      }
      return `🎬 **Welcome <@${member.id}> to ${serverName}!**\n` +
        `> 👤 **Member:** \`#${memberNum}\`　•　📅 **Account Created:** ${accountAgeText}${navLine}`;
    } else {
      if (config.leaveMessage && config.leaveMessage.trim()) {
        return config.leaveMessage
          .replace(/\{user\}/gi, `<@${member.id}>`)
          .replace(/\{server\}/gi, serverName)
          .replace(/#\{membercount\}/gi, `#${memberNum}`)
          .replace(/\{membercount\}/gi, `${ordinal}`);
      }
      return `👋 **${username}** has left **${serverName}**. (Remaining: \`#${memberNum}\`)`;
    }
  }

  async autoDetectWelcomeChannel(guild) {
    if (!guild) return null;
    const wKey = `welcomer_${guild.id}`;
    let config = this.utilDb.get(wKey) || { theme: 'dark', cardEnabled: true, enabled: true };
    if (!config.channelId) {
      let chanList = guild.channels?.cache ? Array.from(guild.channels.cache.values()) : [];
      if (!chanList.length && guild.channels?.fetch) {
        const fetched = await guild.channels.fetch().catch(() => null);
        if (fetched) chanList = Array.from(fetched.values());
      }
      chanList = chanList.filter(Boolean);

      const found = chanList.find(c =>
        c && c.type === ChannelType.GuildText && (
          /welcome[-_]?hub/i.test(c.name) ||
          /welcome/i.test(c.name) ||
          /arrival/i.test(c.name) ||
          /joins/i.test(c.name)
        )
      ) || guild.systemChannel;

      if (found) {
        config.channelId = found.id;
        config.enabled = true;
        this.utilDb.set(wKey, config);
        console.log(`[WELCOMER] Auto-configured welcome channel #${found.name} (${found.id}) for guild: ${guild.name}`);
        return found;
      }
    }
    return null;
  }

  async handleJoin(member) {
    let inviterId = null;
    let isFake = false;

    // Account age check (<24h = fake invite)
    const accountAgeMs = Date.now() - (member.user.createdTimestamp || Date.now());
    if (accountAgeMs < 24 * 60 * 60 * 1000) {
      isFake = true;
    }

    try {
      const me = member.guild.members.me || (member.guild.members.fetchMe ? await member.guild.members.fetchMe().catch(() => null) : null);
      if (me && me.permissions.has(PermissionFlagsBits.ManageGuild)) {
        const cachedCodes = this.client.inviteCache?.get(member.guild.id) || new Map();
        const updatedInvites = await member.guild.invites.fetch().catch(() => null);
        if (updatedInvites) {
          for (const [code, inv] of updatedInvites) {
            const prevUses = cachedCodes.get(code) || 0;
            if (inv.uses > prevUses) {
              inviterId = inv.inviter?.id;
              break;
            }
          }
          const refreshedMap = new Map();
          updatedInvites.forEach(inv => refreshedMap.set(inv.code, inv.uses));
          this.client.inviteCache.set(member.guild.id, refreshedMap);
        }
      }
    } catch (e) {}

    let inviterUser = null;
    let cleanTotalInvites = 0;

    if (inviterId) {
      const key = `${member.guild.id}_${inviterId}`;
      const data = this.db.get(key) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
      if (isFake || inviterId === member.id) {
        data.fake = (data.fake || 0) + 1;
      } else {
        data.regular = (data.regular || 0) + 1;
      }
      this.db.set(key, data);
      this.db.set(`invitedBy_${member.guild.id}_${member.id}`, inviterId);

      const total = (data.regular || 0) + (data.bonus || 0) - (data.leaves || 0) - (data.fake || 0);
      cleanTotalInvites = Math.max(0, total);

      try {
        inviterUser = await this.client.users.fetch(inviterId).catch(() => null);
      } catch (uErr) {}

      // Trigger reward check
      await this.checkInviteRewards(member.guild, inviterId);
    }

    // --- 1. DEDICATED INVITES TRACKER CHANNEL NOTIFICATION ---
    try {
      const inviteLogChan = Array.from(member.guild.channels.cache.values()).find(c =>
        c.type === ChannelType.GuildText && (
          c.name.includes('invites-tracker') ||
          c.name.includes('invite-tracker') ||
          c.name.includes('invites') ||
          c.name.includes('invite-log')
        )
      );

      if (inviteLogChan) {
        let inviteReport = '';
        if (inviterId) {
          const inviterDisplayName = inviterUser ? (inviterUser.globalName || inviterUser.username) : `<@${inviterId}>`;
          inviteReport = `<@${member.id}> has been invited by **${inviterDisplayName}** and has now **${cleanTotalInvites}** invites.`;
        } else {
          inviteReport = `<@${member.id}> joined using a direct, vanity, or system invite link.`;
        }
        await inviteLogChan.send(inviteReport).catch(() => {});
      }
    } catch (invErr) {
      console.error('[INVITES TRACKER LOG ERROR]', invErr);
    }

    // --- 2. WELCOMER CUSTOM DM DISPATCH ---
    let welcomerConfig = this.utilDb.get(`welcomer_${member.guild.id}`) || {};
    if (welcomerConfig.dmEnabled) {
      const defaultDm = `Welcome to **${member.guild.name}**, <@${member.id}>! We're glad to have you here.`;
      const dmText = (welcomerConfig.dmMessage || defaultDm)
        .replace(/\{user\}/gi, `<@${member.id}>`)
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/#\{membercount\}/gi, `#${member.guild.memberCount || 1}`)
        .replace(/\{membercount\}/gi, `${member.guild.memberCount || 1}`);

      member.send(dmText).catch(() => {});
    }

    // --- 3. CLEAN & PROFESSIONAL WELCOMER ANNOUNCEMENT IN WELCOME HUB ---
    let targetChannelId = welcomerConfig.channelId;
    let channel = null;

    if (targetChannelId && member.guild.channels) {
      channel = member.guild.channels.cache?.get(targetChannelId) ||
        (await member.guild.channels.fetch(targetChannelId).catch(() => null));
    }

    if (!channel && member.guild.channels) {
      // Auto-discover welcome channel dynamically
      let chanList = member.guild.channels.cache ? Array.from(member.guild.channels.cache.values()) : [];
      if (!chanList.length && member.guild.channels.fetch) {
        const fetched = await member.guild.channels.fetch().catch(() => null);
        if (fetched) chanList = Array.from(fetched.values());
      }
      chanList = chanList.filter(Boolean);

      channel = chanList.find(c =>
        c && c.type === ChannelType.GuildText && (
          /welcome[-_]?hub/i.test(c.name) ||
          /welcome/i.test(c.name) ||
          /arrival/i.test(c.name) ||
          /joins/i.test(c.name)
        )
      ) || member.guild.systemChannel;

      if (channel) {
        welcomerConfig.channelId = channel.id;
        welcomerConfig.enabled = true;
        this.utilDb.set(`welcomer_${member.guild.id}`, welcomerConfig);
        console.log(`[WELCOMER] Auto-discovered welcome channel: #${channel.name} (${channel.id})`);
      }
    }

    if (channel && welcomerConfig.enabled !== false) {
      let sent = false;

      // 1. Try Canvas Graphic Card + Luxury Embed
      if (welcomerConfig.cardEnabled !== false) {
        try {
          const cardBuffer = await this.generateCard(member, welcomerConfig.theme || 'dark', 'join');
          const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome.png' });
          const embed = this.buildWelcomerEmbed(member, welcomerConfig, 'join');
          await channel.send({ content: `<@${member.id}>`, embeds: [embed], files: [attachment] });
          sent = true;
        } catch (cardErr) {
          console.warn('[WELCOMER] Canvas card failed, using luxury embed fallback:', cardErr.message);
        }
      }

      // 2. Fallback to Luxury Embed without attachment
      if (!sent) {
        try {
          const embed = this.buildWelcomerEmbed(member, welcomerConfig, 'join');
          embed.setImage(null);
          await channel.send({ content: `<@${member.id}>`, embeds: [embed] });
          sent = true;
        } catch (embedErr) {
          console.warn('[WELCOMER] Embed send failed, falling back to text message:', embedErr.message);
        }
      }

      // 3. Final Fallback to Clean Text Message
      if (!sent) {
        try {
          const textMsg = this.buildWelcomerTextMessage(member, welcomerConfig, 'join');
          await channel.send({ content: textMsg });
          sent = true;
        } catch (textErr) {
          console.error(`[WELCOMER ERROR] Failed to send welcome message in #${channel.name}:`, textErr.message);
        }
      }
    }
  }

  async handleLeave(member) {
    const inviterId = this.db.get(`invitedBy_${member.guild.id}_${member.id}`);
    let inviterUser = null;
    let cleanTotalInvites = 0;

    if (inviterId) {
      const key = `${member.guild.id}_${inviterId}`;
      const data = this.db.get(key) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
      data.leaves = (data.leaves || 0) + 1;
      this.db.set(key, data);
      this.db.delete(`invitedBy_${member.guild.id}_${member.id}`);

      const total = (data.regular || 0) + (data.bonus || 0) - (data.leaves || 0) - (data.fake || 0);
      cleanTotalInvites = Math.max(0, total);

      try {
        inviterUser = await this.client.users.fetch(inviterId).catch(() => null);
      } catch (uErr) {}

      // Re-evaluate rewards on leave
      await this.checkInviteRewards(member.guild, inviterId);
    }

    // Leave notification in #invites-tracker
    try {
      const inviteLogChan = Array.from(member.guild.channels.cache.values()).find(c =>
        c.type === ChannelType.GuildText && (
          c.name.includes('invites-tracker') ||
          c.name.includes('invite-tracker') ||
          c.name.includes('invites') ||
          c.name.includes('invite-log')
        )
      );

      if (inviteLogChan && inviterId) {
        const inviterDisplayName = inviterUser ? (inviterUser.globalName || inviterUser.username) : `<@${inviterId}>`;
        await inviteLogChan.send(`**${member.user.username || member.user.tag}** left the server. Invited by **${inviterDisplayName}** (now ${cleanTotalInvites} invites).`).catch(() => {});
      }
    } catch (e) {}

    // Welcomer leave notification
    const welcomerConfig = this.utilDb.get(`welcomer_${member.guild.id}`) || {};
    if (welcomerConfig.leaveEnabled) {
      const leaveChanId = welcomerConfig.leaveChannelId || welcomerConfig.channelId;
      const leaveChannel = leaveChanId ? member.guild.channels.cache.get(leaveChanId) : member.guild.systemChannel;

      if (leaveChannel) {
        const embed = this.buildWelcomerEmbed(member, welcomerConfig, 'leave');
        if (welcomerConfig.leaveCardEnabled !== false) {
          try {
            const cardBuffer = await this.generateCard(member, welcomerConfig.theme || 'dark', 'leave');
            const attachment = new AttachmentBuilder(cardBuffer, { name: 'leave.png' });
            await leaveChannel.send({ embeds: [embed], files: [attachment] }).catch(() => {});
          } catch (err) {
            leaveChannel.send({ embeds: [embed] }).catch(() => {});
          }
        } else {
          leaveChannel.send({ embeds: [embed] }).catch(() => {});
        }
      }
    }
  }

  checkBump(message) {
    if (!message.guild) return;

    // Disboard Bot ID: 302050872383242240
    // Bump Buddy Bot ID: 1103524419730591784
    const isDisboard = message.author.id === '302050872383242240';
    const isBumpBuddy = message.author.id === '1103524419730591784';

    let isBumpSuccess = false;
    if (isDisboard && message.embeds.length > 0) {
      const desc = (message.embeds[0].description || '') + (message.embeds[0].title || '');
      if (desc.includes('Bump done') || desc.includes('bump done') || desc.includes('DISBOARD')) {
        isBumpSuccess = true;
      }
    } else if (isBumpBuddy && message.embeds.length > 0) {
      const desc = (message.embeds[0].description || '') + (message.embeds[0].title || '');
      if (desc.includes('bumped') || desc.includes('Cooldown')) {
        isBumpSuccess = true;
      }
    } else if (message.embeds.length > 0) {
      const desc = (message.embeds[0].description || '') + (message.embeds[0].title || '');
      if (desc.toLowerCase().includes('bump done') || desc.toLowerCase().includes('bumped successfully')) {
        isBumpSuccess = true;
      }
    }

    if (isBumpSuccess) {
      const cfg = this.utilDb.get(`bump_cfg_${message.guild.id}`) || {};
      const channelId = cfg.channelId || message.channel.id;
      const roleId = cfg.roleId || null;
      const twoHours = 2 * 60 * 60 * 1000;
      const triggerAt = Date.now() + twoHours;

      this.utilDb.set(`bump_timer_${message.guild.id}`, {
        guildId: message.guild.id,
        channelId: channelId,
        roleId: roleId,
        triggerAt: triggerAt,
        bumpedAt: Date.now()
      });

      const nextTs = Math.floor(triggerAt / 1000);
      const embed = new EmbedBuilder().setColor(0x2ECC71)
        .setTitle('🚀 Bump Recorded!')
        .setDescription(`Bump confirmed! I will automatically remind this server to \`/bump\` in **2 hours** (<t:${nextTs}:R>).\n\n⏰ **Next Bump Time:** <t:${nextTs}:T>\n📍 **Alert Channel:** <#${channelId}>${roleId ? `\n🔔 **Ping Role:** <@&${roleId}>` : ''}`)
        .setFooter({ text: 'Auto-Bump Reminder System' });

      message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async checkMessage(message) {
    if (!message.guild || message.author.bot) return false;
    const content = (message.content || '').trim().toLowerCase();

    // Plain text / prefix command fallbacks
    if (content === '!invites sync' || content === '!sync-invites' || content === '!sync invites' || content === '/invites sync' || content === '!invites-sync') {
      const isStaff = message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                      message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                      message.author.id === message.guild.ownerId;
      if (!isStaff) {
        await message.reply('⚠️ Only staff / administrators can trigger invite portfolio reconciliation.').catch(() => {});
        return true;
      }

      const statusMsg = await message.reply('🔄 **Scanning server logs & invites... Reconciling invite portfolio...**').catch(() => null);
      const res = await this.syncInvitesFromChannelsAndAuditLogs(message.guild);
      if (res.success) {
        const replyText = `✅ **Invite Portfolio Synchronized & Reconciled!**\n` +
          `• Channels Scanned: \`${res.totalChannelsScanned}\` (#invites-tracker, #modlogs, #welcome-hub)\n` +
          `• Inviters Synchronized: \`${res.syncedInviters}\`\n` +
          `• Backed up directly into \`#🤖・bot-memory\` vault.`;
        if (statusMsg) {
          await statusMsg.edit(replyText).catch(() => {});
        } else {
          await message.channel.send(replyText).catch(() => {});
        }
      } else {
        const failText = `❌ Sync failed: ${res.error}`;
        if (statusMsg) await statusMsg.edit(failText).catch(() => {});
        else await message.channel.send(failText).catch(() => {});
      }
      return true;
    }

    if (content === '!invites' || content === '!invites check' || content === '/invites check' || content === '!invites-check') {
      const target = message.mentions.users?.first() || message.author;
      const data = this.db.get(`${message.guild.id}_${target.id}`) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
      const bonus = data.bonus || 0;
      const total = data.regular - data.leaves - data.fake + bonus;

      const embed = new EmbedBuilder().setColor(0x10B981)
        .setAuthor({ name: `${target.tag} • Invite Portfolio`, iconURL: target.displayAvatarURL() })
        .setTitle('📨 Verified Invite Statistics')
        .setDescription(
          `**Total Real Invites:** \`${total} Invites\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `▸ 📥 **Regular Joined:** \`${data.regular}\`\n` +
          `▸ 🚪 **Members Left:** \`${data.leaves}\`\n` +
          `▸ ⚠️ **Fake / <24h Old:** \`${data.fake}\`\n` +
          `▸ 🎁 **Staff Bonus:** \`${bonus}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: `${message.guild.name} • (Regular - Leaves - Fake + Bonus)`, iconURL: message.guild.iconURL() })
        .setTimestamp();

      await message.reply({ embeds: [embed] }).catch(() => {});
      return true;
    }

    return false;
  }

  handleInviteCreate(invite) {
    if (!invite.guild) return;
    const codeMap = this.client.inviteCache.get(invite.guild.id) || new Map();
    codeMap.set(invite.code, invite.uses);
    this.client.inviteCache.set(invite.guild.id, codeMap);
  }

  handleInviteDelete(invite) {
    if (!invite.guild) return;
    const codeMap = this.client.inviteCache.get(invite.guild.id);
    if (codeMap) codeMap.delete(invite.code);
  }

  async handleGuildCreate(guild) {
    try {
      const me = guild.members.me;
      if (me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        const invites = await guild.invites.fetch().catch(() => null);
        if (invites) {
          const codeMap = new Map();
          invites.forEach(inv => codeMap.set(inv.code, inv.uses));
          this.client.inviteCache.set(guild.id, codeMap);
        }
      }
    } catch (e) {}
  }

  handleGuildDelete(guild) {
    this.client.inviteCache.delete(guild.id);
  }

  /**
   * Scans #invites-tracker, #modlogs, and live guild invites to reconstruct and synchronize all invite statistics.
   */
  async syncInvitesFromChannelsAndAuditLogs(guild) {
    if (!guild) return { success: false, error: 'Guild required' };

    let syncedCount = 0;
    const inviterMap = new Map(); // userId -> { regular, leaves, fake, bonus }

    // 1. Fetch live guild invites from Discord API
    try {
      const invites = await guild.invites?.fetch().catch(() => null);
      if (invites && invites.size > 0) {
        for (const [code, inv] of invites) {
          if (inv.inviter?.id) {
            const uId = inv.inviter.id;
            const current = inviterMap.get(uId) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
            current.regular += (inv.uses || 0);
            inviterMap.set(uId, current);
          }
        }
      }
    } catch (e) {
      console.warn('[INVITES SYNC] Could not fetch live guild invites:', e.message);
    }

    // 2. Scan channel history from #invites-tracker, #modlogs, #joins, #welcome-hub
    const targetChannels = Array.from(guild.channels.cache.values()).filter(c =>
      c.type === ChannelType.GuildText && (
        c.name.includes('invites-tracker') ||
        c.name.includes('invite-tracker') ||
        c.name.includes('invites') ||
        c.name.includes('modlogs') ||
        c.name.includes('mod-log') ||
        c.name.includes('welcome')
      )
    );

    const parsedJoinedUsers = new Set();

    for (const chan of targetChannels) {
      try {
        let lastId = null;
        for (let batch = 0; batch < 5; batch++) {
          const options = { limit: 100 };
          if (lastId) options.before = lastId;

          const messages = await chan.messages.fetch(options).catch(() => null);
          if (!messages || messages.size === 0) break;

          for (const msg of messages.values()) {
            lastId = msg.id;
            const content = msg.content || '';

            // Pattern 1: "<@joinedId> has been invited by **Name** (<@inviterId>) and has now X invites"
            const inviteMatch = content.match(/<@!?(\d{17,20})>\s+has been invited by\s+(?:\*\*(.*?)\*\*\s+)?(?:\(?<@!?(\d{17,20})>\)?)?/i);
            if (inviteMatch) {
              const joinedId = inviteMatch[1];
              const inviterId = inviteMatch[3];
              if (joinedId && !parsedJoinedUsers.has(joinedId)) {
                parsedJoinedUsers.add(joinedId);
                if (inviterId) {
                  this.db.set(`invitedBy_${guild.id}_${joinedId}`, inviterId);
                  const cur = inviterMap.get(inviterId) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
                  cur.regular = Math.max(cur.regular, 1);
                  inviterMap.set(inviterId, cur);
                }
              }
            }

            // Pattern 2: Member left message ("<@userId> has left" or "departed")
            const leaveMatch = content.match(/<@!?(\d{17,20})>\s+(?:has left|departed|left the server)/i);
            if (leaveMatch) {
              const leftUserId = leaveMatch[1];
              const inviterOfLeft = this.db.get(`invitedBy_${guild.id}_${leftUserId}`);
              if (inviterOfLeft) {
                const cur = inviterMap.get(inviterOfLeft) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
                cur.leaves = (cur.leaves || 0) + 1;
                inviterMap.set(inviterOfLeft, cur);
              }
            }

            // Pattern 3: Embed logs (e.g. from Wick, ProBot, Carl, or EditX)
            if (msg.embeds && msg.embeds.length > 0) {
              for (const emb of msg.embeds) {
                const embText = `${emb.title || ''} ${emb.description || ''} ${(emb.fields || []).map(f => `${f.name} ${f.value}`).join(' ')}`;
                const embInvMatch = embText.match(/(?:Invited by|Inviter)[:\s]+(?:<@!?)?(\d{17,20})>?/i);
                const embUserMatch = embText.match(/(?:User|Member|Joined)[:\s]+(?:<@!?)?(\d{17,20})>?/i);

                if (embInvMatch && embInvMatch[1]) {
                  const inviterId = embInvMatch[1];
                  const cur = inviterMap.get(inviterId) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
                  cur.regular += 1;
                  inviterMap.set(inviterId, cur);
                  if (embUserMatch && embUserMatch[1]) {
                    this.db.set(`invitedBy_${guild.id}_${embUserMatch[1]}`, inviterId);
                  }
                }
              }
            }
          }
        }
      } catch (cErr) {
        console.warn(`[INVITES SYNC] Could not scan messages from #${chan.name}:`, cErr.message);
      }
    }

    // 3. Merge with existing database bonus/stats without dropping manual bonuses
    for (const [userId, stats] of inviterMap.entries()) {
      const key = `${guild.id}_${userId}`;
      const existing = this.db.get(key) || { regular: 0, leaves: 0, fake: 0, bonus: 0 };
      existing.regular = Math.max(existing.regular || 0, stats.regular || 0);
      existing.leaves = Math.max(existing.leaves || 0, stats.leaves || 0);
      existing.fake = existing.fake || stats.fake || 0;
      existing.bonus = existing.bonus || 0;

      this.db.set(key, existing);
      syncedCount++;
    }

    // 4. Force immediate state backup into #bot-memory
    if (this.client.botMemory && typeof this.client.botMemory.backupState === 'function') {
      await this.client.botMemory.backupState(guild).catch(() => {});
    }

    return {
      success: true,
      syncedInviters: syncedCount,
      totalChannelsScanned: targetChannels.length
    };
  }
}

module.exports = UtilityModule;


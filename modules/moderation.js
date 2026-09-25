const { PermissionFlagsBits, EmbedBuilder, SlashCommandBuilder, ChannelType, AuditLogEvent, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class ModerationModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.security;
    this.casesDb = db.cases;
    this.configDb = db.config; // for log channel lookup

    // Velocity & tracking caches
    this.antiNukeCache = new Map(); // `${guildId}_${userId}` -> [timestamps]
    this.spamTracker = new Map();   // `${guildId}_${userId}` -> [timestamps]
    this.raidTracker = new Map();   // `${guildId}` -> [timestamps]
    this.heuristicJoinTracker = new Map(); // `${guildId}` -> [{ id, username, defaultAvatar, createdTs, joinTs }]

    this.INVITE_REGEX = /(discord\.(gg|io|me|li|com\/invite)|discordapp\.com\/invite|dsc\.gg)\/[a-zA-Z0-9]+/i;
    this.URL_REGEX = /https?:\/\/[^\s]+/i;

    setInterval(() => this.cleanCaches(), 10 * 60 * 1000);
    setInterval(() => this.checkTempBans(), 60 * 1000);
  }

  cleanCaches() {
    const now = Date.now();
    for (const [key, timestamps] of this.antiNukeCache.entries()) {
      const valid = timestamps.filter(t => now - t < 10000);
      if (valid.length === 0) this.antiNukeCache.delete(key);
      else this.antiNukeCache.set(key, valid);
    }
    for (const [key, timestamps] of this.spamTracker.entries()) {
      const valid = timestamps.filter(t => now - t < 10000);
      if (valid.length === 0) this.spamTracker.delete(key);
      else this.spamTracker.set(key, valid);
    }
    for (const [key, timestamps] of this.raidTracker.entries()) {
      const valid = timestamps.filter(t => now - t < 30000);
      if (valid.length === 0) this.raidTracker.delete(key);
      else this.raidTracker.set(key, valid);
    }
    for (const [key, joins] of this.heuristicJoinTracker.entries()) {
      const valid = joins.filter(j => now - j.joinTs < 60000);
      if (valid.length === 0) this.heuristicJoinTracker.delete(key);
      else this.heuristicJoinTracker.set(key, valid);
    }
  }

  createCase(guildId, action, targetUser, moderatorUser, reason) {
    const guildCasesKey = `counter_${guildId}`;
    const nextId = (this.casesDb.get(guildCasesKey) || 0) + 1;
    this.casesDb.set(guildCasesKey, nextId);

    const caseData = {
      id: nextId,
      guildId,
      action,
      targetId: targetUser.id,
      targetTag: targetUser.tag || targetUser.username,
      moderatorId: moderatorUser.id,
      moderatorTag: moderatorUser.tag || moderatorUser.username,
      reason: reason || 'No reason provided',
      timestamp: Date.now()
    };

    this.casesDb.set(`case_${guildId}_${nextId}`, caseData);
    return caseData;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('kick').setDescription('Kick a member from the server')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('ban').setDescription('Permanently ban an offender')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for ban'))
        .addIntegerOption(o => o.setName('delete_days').setDescription('Days of message history to delete (0-7)').setMinValue(0).setMaxValue(7))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('tempban').setDescription('Temporarily ban an offender with automatic unban')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Ban duration in minutes').setMinValue(1).setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for temp-ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('unban').setDescription('Unban a user by their Discord User ID')
        .addStringOption(o => o.setName('user_id').setDescription('Target Discord User ID').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for unban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('massban').setDescription('Ban multiple user IDs simultaneously')
        .addStringOption(o => o.setName('user_ids').setDescription('Space or comma-separated Discord User IDs').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for massban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('softban').setDescription('Ban and instantly unban to delete recent messages')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for softban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('timeout').setDescription('Mute/timeout an offender')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setMinValue(1).setMaxValue(40320).setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for timeout'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('untimeout').setDescription('Remove timeout from a member')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('slowmode').setDescription('Set channel slowmode cooldown in seconds (0 to disable)')
        .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 - 21600)').setMinValue(0).setMaxValue(21600).setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to current)').addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setDMPermission(false),

      new SlashCommandBuilder().setName('warn').setDescription('Issue a formal warning to a user')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('warnings').setDescription("View a user's warning history")
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('clearwarns').setDescription('Clear all warnings for a user')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('punish').setDescription('Configure automated punishments at warning thresholds')
        .addSubcommand(s => s.setName('add').setDescription('Add auto-punishment threshold')
          .addIntegerOption(o => o.setName('threshold').setDescription('Number of warnings').setMinValue(1).setMaxValue(50).setRequired(true))
          .addStringOption(o => o.setName('action').setDescription('Action to execute').setRequired(true)
            .addChoices(
              { name: '1 Hour Timeout', value: 'timeout_1h' },
              { name: '1 Day Timeout', value: 'timeout_1d' },
              { name: 'Kick Member', value: 'kick' },
              { name: 'Permanent Ban', value: 'ban' }
            )))
        .addSubcommand(s => s.setName('remove').setDescription('Remove punishment at threshold')
          .addIntegerOption(o => o.setName('threshold').setDescription('Number of warnings').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List configured warning punishment thresholds'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('case').setDescription('Lookup moderation case by ID')
        .addIntegerOption(o => o.setName('id').setDescription('Case number').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages with advanced filters')
        .addIntegerOption(o => o.setName('count').setDescription('Number of messages to scan (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        .addUserOption(o => o.setName('user').setDescription('Filter by specific user'))
        .addStringOption(o => o.setName('filter').setDescription('Filter message type')
          .addChoices(
            { name: 'Bots Only', value: 'bots' },
            { name: 'Humans Only', value: 'humans' },
            { name: 'Contains Links', value: 'links' },
            { name: 'Contains Discord Invites', value: 'invites' },
            { name: 'Contains Attachments/Images', value: 'images' }
          ))
        .addStringOption(o => o.setName('keyword').setDescription('Only delete messages containing text'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).setDMPermission(false),

      new SlashCommandBuilder().setName('automod').setDescription('Configure automated chat security filters')
        .addBooleanOption(o => o.setName('enabled').setDescription('Toggle master automod').setRequired(true))
        .addBooleanOption(o => o.setName('report_only').setDescription('Report violations without auto-punishing (Default: true)'))
        .addBooleanOption(o => o.setName('anti_invite').setDescription('Block unauthorized Discord invites'))
        .addBooleanOption(o => o.setName('anti_caps').setDescription('Block excessive caps (>70%)'))
        .addBooleanOption(o => o.setName('anti_spam').setDescription('Block rapid message floods'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('filter').setDescription('Manage word blacklist filter')
        .addStringOption(o => o.setName('action').setDescription('Action to perform').setRequired(true)
          .addChoices({ name: 'Add Word', value: 'add' }, { name: 'Remove Word', value: 'remove' }, { name: 'List Words', value: 'list' }))
        .addStringOption(o => o.setName('word').setDescription('Word to add or remove'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('lockdown').setDescription('Lock or unlock channel permissions')
        .addBooleanOption(o => o.setName('active').setDescription('True to lock, False to unlock').setRequired(true))
        .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to current)').addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setDMPermission(false),

      new SlashCommandBuilder().setName('modhistory').setDescription('View complete infraction records and case history for a user')
        .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('modnote').setDescription('Manage staff-only moderation notes on a user')
        .addSubcommand(s => s.setName('add').setDescription('Add a moderation note to a user profile')
          .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true))
          .addStringOption(o => o.setName('note').setDescription('Note content').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('View moderation notes for a user')
          .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true)))
        .addSubcommand(s => s.setName('clear').setDescription('Clear all notes for a user')
          .addUserOption(o => o.setName('target').setDescription('Target user').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('vmute').setDescription('Server mute a member in voice channels')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for voice mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('vdeafen').setDescription('Server deafen a member in voice channels')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for voice deafen'))
        .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('vdisconnect').setDescription('Disconnect a member from their current voice channel')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for disconnection'))
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers).setDMPermission(false),

      new SlashCommandBuilder().setName('audit').setDescription('Server security and topology audit scans')
        .addSubcommand(s => s.setName('server').setDescription('Full detailed security & configuration scan of channels, rules, and permissions'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),

      new SlashCommandBuilder().setName('mod').setDescription('Moderator Assistant Copilot (Report-Only) configuration')
        .addSubcommandGroup(g => g.setName('report').setDescription('Configure incident reporting channel and operating mode')
          .addSubcommand(s => s.setName('channel').setDescription('Select channel for incident alert reports')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to receive moderation alerts').addChannelTypes(ChannelType.GuildText).setRequired(true)))
          .addSubcommand(s => s.setName('mode').setDescription('Toggle Human Mod Assistant (Report Only) or Auto-Enforce mode')
            .addStringOption(o => o.setName('mode').setDescription('Operating mode').setRequired(true)
              .addChoices(
                { name: 'Report Only (Mods in Full Control • 1-Click Action Buttons)', value: 'REPORT_ONLY' },
                { name: 'Autonomous Enforce (Bot automatically deletes & punishes)', value: 'AUTO_ENFORCE' }
              )))
          .addSubcommand(s => s.setName('rules').setDescription('Scan or specify community rules channel for AI security context')
            .addChannelOption(o => o.setName('channel').setDescription('Rules channel (e.g. #rules)').addChannelTypes(ChannelType.GuildText))
            .addStringOption(o => o.setName('custom_rules').setDescription('Directly provide or paste server rules text')))
          .addSubcommand(s => s.setName('status').setDescription('View current Mod Assistant reporting configuration and indexed rules')))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),

      new SlashCommandBuilder().setName('reportmode').setDescription('Switch bot moderation mode between Report-Only and Auto-Enforce')
        .addStringOption(o => o.setName('mode').setDescription('Operating mode').setRequired(true)
          .addChoices(
            { name: 'Report Only (Mods in Full Control • 1-Click Action Buttons)', value: 'REPORT_ONLY' },
            { name: 'Autonomous Enforce (Bot automatically deletes & punishes)', value: 'AUTO_ENFORCE' }
          ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    const { commandName, options, guild, member } = interaction;
    const config = this.db.get(guild.id) || {
      automod: true,
      antiInvite: true,
      antiCaps: true,
      antiSpam: true,
      antiraid: true,
      minAgeDays: 1,
      quarantineRole: null,
      honeypotChannelId: null,
      beemoHeuristics: true,
      badWords: [],
      warnPunishments: {}
    };

    switch (commandName) {
      case 'kick': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);

        if (!targetMember) return interaction.editReply('❌ Member not found in server.');
        if (!targetMember.kickable) return interaction.editReply('❌ I lack permissions or target has a higher role.');

        await targetMember.kick(reason);
        const modCase = this.createCase(guild.id, 'KICK', target, interaction.user, reason);
        return interaction.editReply(`👢 **${target.username}** was kicked. | **Case #${modCase.id}**`);
      }

      case 'ban': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'No reason provided';
        const deleteDays = options.getInteger('delete_days') || 0;

        if (target.id === interaction.user.id) return interaction.editReply('❌ Cannot ban yourself.');
        if (target.id === this.client.user.id) return interaction.editReply('❌ Cannot ban the bot.');

        try {
          await guild.members.ban(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
          const modCase = this.createCase(guild.id, 'BAN', target, interaction.user, reason);
          return interaction.editReply(`🔨 **${target.username}** was permanently banned. | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Ban failed: ${err.message}`);
        }
      }

      case 'tempban': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const mins = options.getInteger('minutes');
        const reason = options.getString('reason') || 'Temp-ban';

        if (target.id === interaction.user.id) return interaction.editReply('❌ Cannot ban yourself.');

        try {
          await guild.members.ban(target.id, { reason: `Tempban (${mins}m): ${reason}` });
          const expireAt = Date.now() + mins * 60000;
          this.db.set(`tempban_${guild.id}_${target.id}`, {
            guildId: guild.id,
            userId: target.id,
            expireAt
          });

          const modCase = this.createCase(guild.id, 'TEMPBAN', target, interaction.user, `${reason} (${mins}m)`);
          return interaction.editReply(`⏳ **${target.username}** temp-banned for **${mins} minute(s)**. | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Temp-ban failed: ${err.message}`);
        }
      }

      case 'unban': {
        await interaction.deferReply();
        const targetId = options.getString('user_id').trim();
        const reason = options.getString('reason') || 'Unbanned by moderator';

        try {
          const banInfo = await guild.bans.fetch(targetId).catch(() => null);
          if (!banInfo) return interaction.editReply('❌ No active ban found for this User ID.');

          await guild.members.unban(targetId, reason);
          const modCase = this.createCase(guild.id, 'UNBAN', banInfo.user, interaction.user, reason);
          return interaction.editReply(`🔓 **${banInfo.user.tag}** was unbanned. | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Unban failed: ${err.message}`);
        }
      }

      case 'massban': {
        await interaction.deferReply({ ephemeral: true });
        const rawIds = options.getString('user_ids');
        const reason = options.getString('reason') || 'Massban';
        const ids = rawIds.split(/[\s,]+/).filter(id => /^\d{17,20}$/.test(id));

        if (ids.length === 0) return interaction.editReply('❌ No valid Discord User IDs found.');

        let success = 0;
        for (const id of ids) {
          try {
            await guild.members.ban(id, { reason });
            success++;
          } catch (e) {}
        }

        return interaction.editReply(`🔨 Successfully mass-banned **${success}/${ids.length}** user(s).`);
      }

      case 'softban': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'Softban message cleanup';

        try {
          await guild.members.ban(target.id, { reason: `Softban: ${reason}`, deleteMessageSeconds: 86400 * 7 });
          await guild.members.unban(target.id, 'Softban complete');
          const modCase = this.createCase(guild.id, 'SOFTBAN', target, interaction.user, reason);
          return interaction.editReply(`🧹 **${target.username}** softbanned (messages purged). | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Softban failed: ${err.message}`);
        }
      }

      case 'timeout': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const mins = options.getInteger('minutes');
        const reason = options.getString('reason') || 'No reason provided';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);

        if (!targetMember || !targetMember.moderatable) return interaction.editReply('❌ Target cannot be timed out (higher role or immune).');

        try {
          await targetMember.timeout(mins * 60000, reason);
          const modCase = this.createCase(guild.id, 'TIMEOUT', target, interaction.user, `${reason} (${mins}m)`);
          return interaction.editReply(`🔇 **${target.username}** timed out for ${mins} minute(s). | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Failed: ${err.message}`);
        }
      }

      case 'untimeout': {
        await interaction.deferReply();
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'Timeout removed';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);

        if (!targetMember || !targetMember.moderatable) return interaction.editReply('❌ Target cannot be modified.');

        try {
          await targetMember.timeout(null, reason);
          const modCase = this.createCase(guild.id, 'UNTIMEOUT', target, interaction.user, reason);
          return interaction.editReply(`🔊 Timeout removed from **${target.username}**. | **Case #${modCase.id}**`);
        } catch (err) {
          return interaction.editReply(`❌ Failed: ${err.message}`);
        }
      }

      case 'slowmode': {
        const seconds = options.getInteger('seconds');
        const targetChan = options.getChannel('channel') || interaction.channel;
        try {
          await targetChan.setRateLimitPerUser(seconds);
          return interaction.reply({ content: `⏳ Slowmode in <#${targetChan.id}> set to **${seconds}s**${seconds === 0 ? ' (Disabled)' : ''}.`, ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: `❌ Failed to set slowmode: ${err.message}`, ephemeral: true });
        }
      }

      case 'warn': {
        const target = options.getUser('target');
        const reason = options.getString('reason');
        const key = `warns_${guild.id}_${target.id}`;
        const warns = this.db.get(key) || [];
        const modCase = this.createCase(guild.id, 'WARN', target, interaction.user, reason);

        warns.push({ caseId: modCase.id, reason, by: interaction.user.id, timestamp: Date.now() });
        this.db.set(key, warns);

        // Check Automated Warning Punishments
        let autoPunishText = '';
        const punishments = config.warnPunishments || {};
        const action = punishments[warns.length];

        if (action) {
          const targetMember = await guild.members.fetch(target.id).catch(() => null);
          if (targetMember) {
            try {
              if (action === 'timeout_1h' && targetMember.moderatable) {
                await targetMember.timeout(60 * 60000, `Automated penalty for reaching ${warns.length} warnings`);
                autoPunishText = `\n🚨 **Auto-Punishment Triggered:** User was timed out for 1 hour (${warns.length} warnings reached).`;
              } else if (action === 'timeout_1d' && targetMember.moderatable) {
                await targetMember.timeout(24 * 60 * 60000, `Automated penalty for reaching ${warns.length} warnings`);
                autoPunishText = `\n🚨 **Auto-Punishment Triggered:** User was timed out for 24 hours (${warns.length} warnings reached).`;
              } else if (action === 'kick' && targetMember.kickable) {
                await targetMember.kick(`Automated penalty for reaching ${warns.length} warnings`);
                autoPunishText = `\n🚨 **Auto-Punishment Triggered:** User was kicked from the server (${warns.length} warnings reached).`;
              } else if (action === 'ban' && targetMember.bannable) {
                await targetMember.ban({ reason: `Automated penalty for reaching ${warns.length} warnings` });
                autoPunishText = `\n🚨 **Auto-Punishment Triggered:** User was banned from the server (${warns.length} warnings reached).`;
              }
            } catch (e) {}
          }
        }

        return interaction.reply(`⚠️ **${target.username}** was warned: *${reason}* | **Case #${modCase.id}** (Total Warns: **${warns.length}**)${autoPunishText}`);
      }

      case 'punish':
      case 'warn-punishment': {
        const sub = options.getSubcommand();
        config.warnPunishments = config.warnPunishments || {};

        if (sub === 'add') {
          const threshold = options.getInteger('threshold');
          const action = options.getString('action');
          config.warnPunishments[threshold] = action;
          this.db.set(guild.id, config);
          return interaction.reply({ content: `✅ Warning threshold **${threshold}** will now trigger: **${action.toUpperCase()}**.`, ephemeral: true });
        }
        if (sub === 'remove') {
          const threshold = options.getInteger('threshold');
          delete config.warnPunishments[threshold];
          this.db.set(guild.id, config);
          return interaction.reply({ content: `✅ Removed auto-punishment for **${threshold}** warnings.`, ephemeral: true });
        }
        if (sub === 'list') {
          const entries = Object.entries(config.warnPunishments);
          if (entries.length === 0) return interaction.reply({ content: '📭 No automated warning punishment thresholds configured.', ephemeral: true });

          const desc = entries.sort((a, b) => Number(a[0]) - Number(b[0])).map(([t, a]) => `• **${t} Warnings** ➔ \`${a.toUpperCase()}\``).join('\n');
          const embed = new EmbedBuilder().setColor(0xED4245).setTitle('⚖️ Automated Warning Thresholds').setDescription(desc);
          return interaction.reply({ embeds: [embed] });
        }
        break;
      }

      case 'warnings': {
        const target = options.getUser('target');
        const warns = this.db.get(`warns_${guild.id}_${target.id}`) || [];
        if (warns.length === 0) return interaction.reply({ content: `✅ **${target.username}** has no active warnings.`, ephemeral: true });

        const embed = new EmbedBuilder().setTitle(`⚠️ Warning Record: ${target.username}`).setColor(0xFFCC00);
        embed.setDescription(warns.map((w, i) => `**#${w.caseId || i + 1}** — *${w.reason}* (by <@${w.by}> at <t:${Math.floor(w.timestamp / 1000)}:R>)`).join('\n'));
        return interaction.reply({ embeds: [embed] });
      }

      case 'clearwarns': {
        const target = options.getUser('target');
        this.db.delete(`warns_${guild.id}_${target.id}`);
        return interaction.reply({ content: `✅ Cleared all warnings for **${target.username}**.` });
      }

      case 'case': {
        const caseId = options.getInteger('id');
        const caseData = this.casesDb.get(`case_${guild.id}_${caseId}`);
        if (!caseData) return interaction.reply({ content: `❌ Case #${caseId} does not exist.`, ephemeral: true });

        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setTitle(`📋 Case #${caseData.id} | ${caseData.action}`)
          .addFields(
            { name: 'Target', value: `<@${caseData.targetId}> (${caseData.targetTag})`, inline: true },
            { name: 'Moderator', value: `<@${caseData.moderatorId}> (${caseData.moderatorTag})`, inline: true },
            { name: 'Reason', value: caseData.reason, inline: false },
            { name: 'Date', value: `<t:${Math.floor(caseData.timestamp / 1000)}:F>`, inline: false }
          );
        return interaction.reply({ embeds: [embed] });
      }

      case 'setup-honeypot': {
        const channel = options.getChannel('channel');
        config.honeypotChannelId = channel.id;
        this.db.set(guild.id, config);
        return interaction.reply({ content: `🍯 **Honeypot Trap Activated in <#${channel.id}>!**\nAny non-staff account or bot sending messages or reacting in this channel will be instantly banned automatically.`, ephemeral: true });
      }

      case 'beemo': {
        const enabled = options.getBoolean('enabled');
        config.beemoHeuristics = enabled;
        this.db.set(guild.id, config);
        return interaction.reply({ content: `🐝 **Beemo Anti-Bot Heuristics:** **${enabled ? 'Enabled' : 'Disabled'}**. Automated mass-raid bot recognition is active.`, ephemeral: true });
      }

      case 'panic-mode': {
        await interaction.deferReply();
        const active = options.getBoolean('active');
        let affected = 0;

        for (const channel of guild.channels.cache.values()) {
          if (channel.isTextBased() && channel.type === ChannelType.GuildText) {
            try {
              await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: active ? false : null });
              affected++;
            } catch (e) {}
          }
        }

        return interaction.editReply(active
          ? `🚨 **PANIC MODE ACTIVATED!** Locked down **${affected}** text channels across the entire server to block active raids.`
          : `🔓 **PANIC MODE DEACTIVATED.** Unlocked **${affected}** channels across the server.`
        );
      }

      case 'purge': {
        await interaction.deferReply({ ephemeral: true });
        const count = options.getInteger('count');
        const userFilter = options.getUser('user');
        const filterType = options.getString('filter');
        const keyword = options.getString('keyword');

        try {
          const messages = await interaction.channel.messages.fetch({ limit: count });
          let filtered = Array.from(messages.values());

          if (userFilter) filtered = filtered.filter(m => m.author.id === userFilter.id);
          if (filterType === 'bots') filtered = filtered.filter(m => m.author.bot);
          if (filterType === 'humans') filtered = filtered.filter(m => !m.author.bot);
          if (filterType === 'links') filtered = filtered.filter(m => this.URL_REGEX.test(m.content));
          if (filterType === 'invites') filtered = filtered.filter(m => this.INVITE_REGEX.test(m.content));
          if (filterType === 'images') filtered = filtered.filter(m => m.attachments.size > 0 || m.embeds.length > 0);
          if (keyword) filtered = filtered.filter(m => m.content.toLowerCase().includes(keyword.toLowerCase()));

          const deleted = await interaction.channel.bulkDelete(filtered, true);
          return interaction.editReply(`🧹 Successfully purged **${deleted.size}** message(s).`);
        } catch (err) {
          return interaction.editReply(`❌ Purge failed: ${err.message}`);
        }
      }

      case 'automod': {
        config.automod = options.getBoolean('enabled');
        if (options.getBoolean('report_only') !== null) config.reportOnly = options.getBoolean('report_only');
        if (options.getBoolean('anti_invite') !== null) config.antiInvite = options.getBoolean('anti_invite');
        if (options.getBoolean('anti_caps') !== null) config.antiCaps = options.getBoolean('anti_caps');
        if (options.getBoolean('anti_spam') !== null) config.antiSpam = options.getBoolean('anti_spam');
        this.db.set(guild.id, config);
        return interaction.reply({ content: `🛡️ AutoMod settings updated. Master toggle: **${config.automod ? 'ON' : 'OFF'}** | Report-Only: **${config.reportOnly !== false ? 'ON' : 'OFF'}**.`, ephemeral: true });
      }

      case 'filter': {
        const action = options.getString('action');
        const word = options.getString('word')?.toLowerCase().trim();
        config.badWords = config.badWords || [];

        if (action === 'list') {
          return interaction.reply({ content: `📝 **Filtered Words:** ${config.badWords.length > 0 ? config.badWords.map(w => `\`${w}\``).join(', ') : 'None'}`, ephemeral: true });
        }
        if (action === 'add') {
          if (!word) return interaction.reply({ content: '❌ Specify a word to add.', ephemeral: true });
          if (!config.badWords.includes(word)) config.badWords.push(word);
          this.db.set(guild.id, config);
          return interaction.reply({ content: `✅ Added \`${word}\` to filtered words.`, ephemeral: true });
        }
        if (action === 'remove') {
          if (!word) return interaction.reply({ content: '❌ Specify a word to remove.', ephemeral: true });
          config.badWords = config.badWords.filter(w => w !== word);
          this.db.set(guild.id, config);
          return interaction.reply({ content: `✅ Removed \`${word}\` from filtered words.`, ephemeral: true });
        }
        break;
      }

      case 'antiraid': {
        config.antiraid = options.getBoolean('enabled');
        const minAge = options.getInteger('min_age_days');
        if (minAge !== null) config.minAgeDays = minAge;
        this.db.set(guild.id, config);
        return interaction.reply({ content: `🛡️ Anti-Raid set to **${config.antiraid ? 'Enabled' : 'Disabled'}** (Min Account Age: **${config.minAgeDays || 0}d**).`, ephemeral: true });
      }

      case 'lockdown': {
        await interaction.deferReply();
        const lock = options.getBoolean('active');
        const targetChan = options.getChannel('channel') || interaction.channel;
        try {
          await targetChan.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: lock ? false : null });
          return interaction.editReply(lock ? `🔒 <#${targetChan.id}> locked down.` : `🔓 <#${targetChan.id}> unlocked.`);
        } catch (err) {
          return interaction.editReply(`❌ Failed: ${err.message}`);
        }
      }

      case 'setup-quarantine': {
        const role = options.getRole('role');
        config.quarantineRole = role.id;
        this.db.set(guild.id, config);
        return interaction.reply({ content: `✅ Quarantine role set to <@&${role.id}>.`, ephemeral: true });
      }

      case 'antinuke': {
        const sub = options.getSubcommand();
        config.whitelist = config.whitelist || [];

        if (sub === 'whitelist-add') {
          const target = options.getUser('target');
          if (!config.whitelist.includes(target.id)) {
            config.whitelist.push(target.id);
            this.db.set(guild.id, config);
          }
          return interaction.reply({ content: `✅ Added <@${target.id}> (${target.tag}) to the Anti-Nuke whitelist. They are now immune to anti-nuke limits.`, ephemeral: true });
        }

        if (sub === 'whitelist-remove') {
          const target = options.getUser('target');
          config.whitelist = config.whitelist.filter(id => id !== target.id);
          this.db.set(guild.id, config);
          return interaction.reply({ content: `✅ Removed <@${target.id}> from the Anti-Nuke whitelist.`, ephemeral: true });
        }

        if (sub === 'whitelist-list') {
          const list = config.whitelist.length > 0 ? config.whitelist.map(id => `• <@${id}> (\`${id}\`)`).join('\n') : 'None (Only Server Owner)';
          const embed = new EmbedBuilder().setColor(0x5865F2)
            .setTitle('🛡️ Wick Anti-Nuke Whitelist')
            .setDescription(`**Owner:** <@${guild.ownerId}>\n\n**Whitelisted Entities:**\n${list}`)
            .setFooter({ text: 'Whitelisted users bypass Anti-Nuke rate limits' });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'status') {
          const qRole = config.quarantineRole ? `<@&${config.quarantineRole}>` : 'Not configured (`/setup-quarantine`)';
          const hpChan = config.honeypotChannelId ? `<#${config.honeypotChannelId}>` : 'Disabled (`/setup-honeypot`)';
          const embed = new EmbedBuilder().setColor(0x2ECC71)
            .setTitle('🛡️ Wick Enterprise Anti-Nuke Defense Shield')
            .addFields(
              { name: 'Channel Delete Limit', value: '4 per 10s ➔ Auto-Revoke & Quarantine', inline: true },
              { name: 'Role Delete Limit', value: '4 per 10s ➔ Auto-Revoke & Quarantine', inline: true },
              { name: 'Mass Ban Limit', value: '4 per 10s ➔ Auto-Revoke & Quarantine', inline: true },
              { name: 'Quarantine Role', value: qRole, inline: true },
              { name: 'Honeypot Trap Channel', value: hpChan, inline: true },
              { name: 'Whitelisted Admins/Bots', value: `${(config.whitelist || []).length} registered`, inline: true }
            )
            .setFooter({ text: 'Wick + Beemo + Honeypot Multi-Shield Active' });
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }

      case 'jail': {
        await interaction.deferReply();
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'Violation of server rules';

        if (!config.quarantineRole) {
          return interaction.editReply('❌ No quarantine/jail role configured. Run `/setup-quarantine` first.');
        }

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.editReply('❌ Member not found in this server.');
        if (!targetMember.manageable) return interaction.editReply('❌ I cannot jail this member (their highest role is above mine).');

        // Save old roles before stripping
        const oldRoles = targetMember.roles.cache.filter(r => r.id !== guild.id && r.id !== config.quarantineRole).map(r => r.id);
        this.db.set(`jail_roles_${guild.id}_${targetUser.id}`, oldRoles);

        try {
          await targetMember.roles.set([config.quarantineRole], `Jailed by ${interaction.user.tag}: ${reason}`);
          const modCase = this.createCase(guild.id, 'JAIL', targetUser, interaction.user, reason);

          const embed = new EmbedBuilder().setColor(0xE74C3C)
            .setTitle('🚨 Member Jailed / Quarantined')
            .setDescription(`**Target:** <@${targetUser.id}> (${targetUser.tag})\n**Moderator:** <@${interaction.user.id}>\n**Reason:** ${reason}\n**Case:** #${modCase.id}\n**Roles Stripped:** ${oldRoles.length}`)
            .setTimestamp();

          targetMember.send(`⚠️ You have been placed in quarantine/jail in **${guild.name}** for: **${reason}**. All roles have been restricted.`).catch(() => {});
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply(`❌ Failed to jail member: ${err.message}`);
        }
      }

      case 'unjail': {
        await interaction.deferReply();
        const targetUser = options.getUser('target');
        const reason = options.getString('reason') || 'Jail sentence completed / Appeal approved';

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return interaction.editReply('❌ Member not found in this server.');

        const savedRoles = this.db.get(`jail_roles_${guild.id}_${targetUser.id}`) || [];
        this.db.delete(`jail_roles_${guild.id}_${targetUser.id}`);

        try {
          await targetMember.roles.set(savedRoles, `Unjailed by ${interaction.user.tag}: ${reason}`).catch(() => {});
          const modCase = this.createCase(guild.id, 'UNJAIL', targetUser, interaction.user, reason);

          const embed = new EmbedBuilder().setColor(0x2ECC71)
            .setTitle('🔓 Member Unjailed / Restored')
            .setDescription(`**Target:** <@${targetUser.id}> (${targetUser.tag})\n**Moderator:** <@${interaction.user.id}>\n**Reason:** ${reason}\n**Case:** #${modCase.id}\n**Roles Restored:** ${savedRoles.length}`)
            .setTimestamp();

          targetMember.send(`✅ You have been released from quarantine in **${guild.name}**. Your previous server roles have been restored.`).catch(() => {});
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply(`❌ Failed to unjail member: ${err.message}`);
        }
      }

      case 'modhistory': {
        const targetUser = options.getUser('target');
        const cases = [];

        for (const [key, c] of this.casesDb.entries()) {
          if (key.startsWith(`case_${guild.id}_`) && c.targetId === targetUser.id) {
            cases.push(c);
          }
        }
        cases.sort((a, b) => b.timestamp - a.timestamp);

        const warns = this.db.get(`warns_${guild.id}_${targetUser.id}`) || [];
        const notes = this.db.get(`notes_${guild.id}_${targetUser.id}`) || [];

        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setAuthor({ name: `Infraction History: ${targetUser.tag}`, iconURL: targetUser.displayAvatarURL() })
          .setTitle(`⚖️ Moderation Profile: ${targetUser.username}`)
          .addFields(
            { name: 'Total Cases', value: `${cases.length}`, inline: true },
            { name: 'Active Warnings', value: `${warns.length}`, inline: true },
            { name: 'Staff Notes', value: `${notes.length}`, inline: true }
          );

        if (cases.length > 0) {
          const recentCases = cases.slice(0, 10).map(c =>
            `• **Case #${c.id} [${c.action}]** by <@${c.moderatorId}>: ${c.reason} (<t:${Math.floor(c.timestamp / 1000)}:R>)`
          ).join('\n');
          embed.addFields({ name: 'Recent Mod Actions (Last 10)', value: recentCases });
        } else {
          embed.addFields({ name: 'Recent Mod Actions', value: 'Clean record! No moderation cases found.' });
        }

        if (notes.length > 0) {
          const notesText = notes.slice(-5).map(n => `• "${n.note}" — <@${n.by}> (<t:${Math.floor(n.timestamp / 1000)}:d>)`).join('\n');
          embed.addFields({ name: 'Staff Notes', value: notesText });
        }

        return interaction.reply({ embeds: [embed] });
      }

      case 'modnote': {
        const sub = options.getSubcommand();
        const targetUser = options.getUser('target');
        const notesKey = `notes_${guild.id}_${targetUser.id}`;
        const notes = this.db.get(notesKey) || [];

        if (sub === 'add') {
          const noteText = options.getString('note');
          notes.push({
            note: noteText,
            by: interaction.user.id,
            byTag: interaction.user.tag,
            timestamp: Date.now()
          });
          this.db.set(notesKey, notes);
          return interaction.reply({ content: `✅ Note added to <@${targetUser.id}>: "${noteText}"`, ephemeral: true });
        }

        if (sub === 'list') {
          if (notes.length === 0) return interaction.reply({ content: `📝 No notes recorded for <@${targetUser.id}>.`, ephemeral: true });
          const desc = notes.map((n, i) => `**${i + 1}.** "${n.note}" — by <@${n.by}> (<t:${Math.floor(n.timestamp / 1000)}:R>)`).join('\n');
          const embed = new EmbedBuilder().setColor(0x5865F2)
            .setTitle(`📝 Staff Notes for ${targetUser.tag}`)
            .setDescription(desc);
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (sub === 'clear') {
          this.db.delete(notesKey);
          return interaction.reply({ content: `✅ Cleared all staff notes for <@${targetUser.id}>.`, ephemeral: true });
        }
        break;
      }

      case 'vmute': {
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'Voice mute by moderator';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember?.voice?.channel) return interaction.reply({ content: `❌ <@${target.id}> is not connected to a voice channel.`, ephemeral: true });
        await targetMember.voice.setMute(true, reason);
        this.createCase(guild.id, 'VOICE_MUTE', target, interaction.user, reason);
        return interaction.reply(`🔇 Server voice-muted <@${target.id}> in <#${targetMember.voice.channel.id}>.`);
      }

      case 'vdeafen': {
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'Voice deafen by moderator';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember?.voice?.channel) return interaction.reply({ content: `❌ <@${target.id}> is not connected to a voice channel.`, ephemeral: true });
        await targetMember.voice.setDeaf(true, reason);
        this.createCase(guild.id, 'VOICE_DEAFEN', target, interaction.user, reason);
        return interaction.reply(`🔕 Server voice-deafened <@${target.id}> in <#${targetMember.voice.channel.id}>.`);
      }

      case 'vdisconnect': {
        const target = options.getUser('target');
        const reason = options.getString('reason') || 'Voice disconnect by moderator';
        const targetMember = await guild.members.fetch(target.id).catch(() => null);
        if (!targetMember?.voice?.channel) return interaction.reply({ content: `❌ <@${target.id}> is not connected to a voice channel.`, ephemeral: true });
        await targetMember.voice.disconnect(reason);
        this.createCase(guild.id, 'VOICE_DISCONNECT', target, interaction.user, reason);
        return interaction.reply(`🔌 Disconnected <@${target.id}> from voice.`);
      }

      case 'audit':
      case 'server-audit': {
        await interaction.deferReply();
        const channels = guild.channels.cache;
        const textChans = channels.filter(c => c.type === ChannelType.GuildText);
        const voiceChans = channels.filter(c => c.isVoiceBased());
        const categories = channels.filter(c => c.type === ChannelType.GuildCategory);

        // 1. Scan for Rules / Guidelines Channel & Extract Content
        let rulesChan = null;
        let rulesExtracted = null;
        for (const [id, c] of textChans) {
          if (/rules|guidelines|welcome-and-rules|server-rules|info-rules/i.test(c.name)) {
            rulesChan = c;
            break;
          }
        }

        if (rulesChan) {
          try {
            const fetched = await rulesChan.messages.fetch({ limit: 10 }).catch(() => null);
            if (fetched && fetched.size > 0) {
              const msgs = Array.from(fetched.values()).reverse();
              rulesExtracted = msgs.map(m => m.content).filter(Boolean).join('\n\n').slice(0, 3000);
              if (rulesExtracted && rulesExtracted.length > 20) {
                this.db.set(`rules_${guild.id}`, rulesExtracted);
              }
            }
          } catch (e) {}
        }

        // Check if rules are in DB if not extracted fresh
        const existingRules = this.db.get(`rules_${guild.id}`);
        const rulesIndexed = Boolean((rulesExtracted && rulesExtracted.length > 20) || (existingRules && existingRules.length > 20));

        // 2. Scan Permissions Vulnerabilities on @everyone
        const everyonePerms = guild.roles.everyone.permissions;
        const vulnList = [];
        if (everyonePerms.has(PermissionFlagsBits.Administrator)) vulnList.push('🚨 `@everyone` has `Administrator`');
        if (everyonePerms.has(PermissionFlagsBits.MentionEveryone)) vulnList.push('⚠️ `@everyone` has `Mention Everyone` (Raid Risk)');
        if (everyonePerms.has(PermissionFlagsBits.ManageGuild)) vulnList.push('🚨 `@everyone` has `Manage Server`');
        if (everyonePerms.has(PermissionFlagsBits.ManageChannels)) vulnList.push('🚨 `@everyone` has `Manage Channels`');
        if (everyonePerms.has(PermissionFlagsBits.ManageRoles)) vulnList.push('🚨 `@everyone` has `Manage Roles`');
        if (everyonePerms.has(PermissionFlagsBits.BanMembers)) vulnList.push('🚨 `@everyone` has `Ban Members`');
        if (everyonePerms.has(PermissionFlagsBits.KickMembers)) vulnList.push('🚨 `@everyone` has `Kick Members`');

        // 3. Scan Staff Channel Isolation
        const exposedStaffChans = [];
        for (const [id, c] of textChans) {
          if (/staff|mod|admin|logs|audit|bot-commands|management/i.test(c.name)) {
            const perm = c.permissionsFor(guild.roles.everyone);
            if (perm && perm.has(PermissionFlagsBits.ViewChannel)) {
              exposedStaffChans.push(`<#${c.id}>`);
            }
          }
        }

        // 4. Mod Report & AI Sentinel Status
        const aimodCfg = this.db.get(`aimod_${guild.id}`) || {};
        const alertChanId = aimodCfg.alertChannel || this.db.get(`mod_report_chan_${guild.id}`);
        const mode = aimodCfg.action === 'REPORT_ONLY' || aimodCfg.action === 'LOG_ONLY' || !aimodCfg.action ? '🛡️ Human-in-the-Loop (Report Only)' : '⚡ Auto-Enforce';

        // 5. Build Audit Card
        const embed = new EmbedBuilder().setColor(vulnList.length === 0 && exposedStaffChans.length === 0 ? 0x10B981 : 0xF59E0B)
          .setTitle(`🔍・Comprehensive Server Audit // ${guild.name}`)
          .setDescription(
            `Detailed inspection of channel topology, community guidelines, and security permissions.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `▸ 👥 **Total Population**: **${guild.memberCount.toLocaleString()}** members • **${guild.roles.cache.size}** roles\n` +
            `▸ 💬 **Topology**: **${textChans.size}** Text • **${voiceChans.size}** Voice • **${categories.size}** Categories\n` +
            `▸ 🤖 **Moderator Copilot Mode**: \`${mode}\`\n` +
            `▸ 🚨 **Designated Alert Channel**: ${alertChanId ? `<#${alertChanId}>` : '⚠️ *Not set (`/mod report channel`)*'}\n` +
            `▸ 📜 **Rules Ingestion Status**: ${rulesIndexed ? `🟢 **Active** (${rulesChan ? `<#${rulesChan.id}>` : 'Indexed'} synced to AI)` : '🟡 *No rules indexed (Run `/mod report rules`)*'}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .addFields(
            {
              name: '🛡️ Defense Multi-Shield Readiness',
              value:
                `• **Anti-Raid Filter**: ${config.antiraid ? `🟢 Enabled (Min ${config.minAgeDays || 1}d age)` : '🔴 Disabled'}\n` +
                `• **Honeypot Trap**: ${config.honeypotChannelId ? `🟢 Active in <#${config.honeypotChannelId}>` : '⚪ Not configured (`/setup-honeypot`)'}\n` +
                `• **Anti-Nuke Engine**: ${config.whitelist ? `🟢 Active (${config.whitelist.length} whitelisted)` : '🟢 Active (Owner Only)'}\n` +
                `• **Automod Spam Shield**: ${config.automod ? '🟢 Enabled' : '🔴 Disabled'}`,
              inline: false
            },
            {
              name: '⚠️ Permission Vulnerabilities (@everyone)',
              value: vulnList.length > 0 ? vulnList.join('\n') : '🟢 **Safe** — No dangerous administrative permissions granted to `@everyone`.',
              inline: false
            },
            {
              name: '🔒 Staff Channel Isolation',
              value: exposedStaffChans.length > 0
                ? `⚠️ **Exposed Staff Channels** (Visible to @everyone):\n${exposedStaffChans.join(', ')}\n*Recommended: Hide these channels from @everyone.*`
                : '🟢 **Secure** — All identified staff and audit channels are strictly hidden from `@everyone`.',
              inline: false
            }
          )
          .setFooter({
            text: `${guild.name} Security Audit • Run /mod report to adjust settings`,
            iconURL: (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
          })
          .setTimestamp();

        if (guild.iconURL && typeof guild.iconURL === 'function') {
          const icon = guild.iconURL({ dynamic: true, size: 128 });
          if (icon) embed.setThumbnail(icon);
        }

        return interaction.editReply({ embeds: [embed] });
      }

      case 'reportmode': {
        const selectedMode = options.getString('mode');
        const aimodKey = `aimod_${guild.id}`;
        const aimodCfg = this.db.get(aimodKey) || { enabled: true, action: 'REPORT_ONLY', alertChannel: null };
        aimodCfg.action = selectedMode;
        this.db.set(aimodKey, aimodCfg);
        const modeDesc = selectedMode === 'REPORT_ONLY'
          ? '🛡️ **Human Mod Assistant (Report Only)** — The bot will NOT auto-delete or auto-punish; all incidents are reported to your alert channel with 1-click action buttons.'
          : '⚡ **Autonomous Enforce** — The bot will automatically delete offending content and punish high-confidence threats.';
        return interaction.reply({ content: `✅ Mode updated:\n> ${modeDesc}`, ephemeral: true });
      }

      case 'mod':
      case 'mod-report': {
        const sub = options.getSubcommand();
        const aimodKey = `aimod_${guild.id}`;
        const aimodCfg = this.db.get(aimodKey) || { enabled: true, action: 'REPORT_ONLY', alertChannel: null };

        if (sub === 'channel') {
          const targetChan = options.getChannel('channel');
          aimodCfg.alertChannel = targetChan.id;
          this.db.set(aimodKey, aimodCfg);
          this.db.set(`mod_report_chan_${guild.id}`, targetChan.id);
          return interaction.reply({
            content: `✅ Moderator Alert Channel set to <#${targetChan.id}>. All flagged incidents will be dispatched there with 1-click action buttons.`,
            ephemeral: true
          });
        }

        if (sub === 'mode') {
          const selectedMode = options.getString('mode');
          aimodCfg.action = selectedMode;
          this.db.set(aimodKey, aimodCfg);
          const modeDesc = selectedMode === 'REPORT_ONLY'
            ? '🛡️ **Human Mod Assistant (Report Only)** — The bot will NOT auto-delete or auto-punish; all incidents are reported to your alert channel with 1-click action buttons.'
            : '⚡ **Autonomous Enforce** — The bot will automatically delete offending content and punish high-confidence threats.';
          return interaction.reply({ content: `✅ Mode updated:\n> ${modeDesc}`, ephemeral: true });
        }

        if (sub === 'rules' || sub === 'sync-rules') {
          await interaction.deferReply({ ephemeral: true });
          const customRules = options.getString('custom_rules');
          const targetChan = options.getChannel('channel');

          let rulesContent = customRules;
          if (!rulesContent && targetChan) {
            const fetched = await targetChan.messages.fetch({ limit: 15 }).catch(() => null);
            if (fetched && fetched.size > 0) {
              const msgs = Array.from(fetched.values()).reverse();
              rulesContent = msgs.map(m => m.content).filter(Boolean).join('\n\n');
            }
          }

          if (!rulesContent) {
            // Search automatically for rules channel
            for (const [id, c] of guild.channels.cache) {
              if (c.type === ChannelType.GuildText && /rules|guidelines|welcome-and-rules|server-rules/i.test(c.name)) {
                const fetched = await c.messages.fetch({ limit: 15 }).catch(() => null);
                if (fetched && fetched.size > 0) {
                  const msgs = Array.from(fetched.values()).reverse();
                  rulesContent = msgs.map(m => m.content).filter(Boolean).join('\n\n');
                  break;
                }
              }
            }
          }

          if (rulesContent && rulesContent.length > 20) {
            this.db.set(`rules_${guild.id}`, rulesContent.slice(0, 4000));
            return interaction.editReply(`✅ **Server Rules Successfully Synced!** Indexed **${rulesContent.length} characters** of community guidelines into Gemini AI's security context.`);
          } else {
            return interaction.editReply('❌ Could not automatically locate server rules. Please use `/mod report rules channel:<#rules>` or provide `custom_rules:`.');
          }
        }

        if (sub === 'status') {
          const alertChan = aimodCfg.alertChannel || this.db.get(`mod_report_chan_${guild.id}`);
          const currentRules = this.db.get(`rules_${guild.id}`);
          const modeName = aimodCfg.action === 'REPORT_ONLY' || aimodCfg.action === 'LOG_ONLY' || !aimodCfg.action
            ? '🛡️ Report-Only (Mods in Full Control)'
            : '⚡ Autonomous Enforcement';

          const embed = new EmbedBuilder().setColor(0x2B2D31)
            .setTitle(`🛡️・Moderator Copilot Configuration // ${guild.name}`)
            .setDescription(
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `▸ 📡 **Alert Channel**: ${alertChan ? `<#${alertChan}>` : '⚠️ *Not configured* (`/mod report channel`)\n'}` +
              `▸ ⚙️ **Operating Mode**: \`${modeName}\`\n` +
              `▸ 📜 **Indexed Server Rules**: ${currentRules ? `🟢 **Active** (${currentRules.length} chars indexed)` : '🟡 *None indexed* (`/mod report rules`)\n'}` +
              `▸ 🧠 **AI Model**: \`Google Gemini 3.6 Flash\` (10 RPM Quota Protected)\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
            )
            .setFooter({ text: 'Omni Mod Assistant • 1-Click Action Buttons' });

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        break;
      }
    }
    return false;
  }

  async checkTempBans() {
    const now = Date.now();
    for (const [key, data] of this.db.entries()) {
      if (key.startsWith('tempban_') && data.expireAt && data.expireAt <= now) {
        try {
          const guild = this.client.guilds.cache.get(data.guildId);
          if (guild) {
            await guild.members.unban(data.userId, 'Temp-ban expired').catch(() => {});
          }
        } catch (e) {}
        this.db.delete(key);
      }
    }
  }

  // Honeypot Trap Check (#do-not-type-here)
  async checkHoneypot(message) {
    if (!message.guild || message.author.id === this.client.user.id) return false;
    const config = this.db.get(message.guild.id) || {};
    const isTrapChannel = (config.honeypotChannelId && message.channel.id === config.honeypotChannelId) ||
      (message.channel.name && (message.channel.name.includes('do-not-type-here') || message.channel.name.includes('honeypot')));

    if (isTrapChannel) {
      if (message.member?.permissions.has(PermissionFlagsBits.Administrator) || message.author.id === message.guild.ownerId) {
        return false;
      }

      try {
        await message.delete().catch(() => {});

        // 1. Remove all member roles from the user
        let removedRolesCount = 0;
        const strippedRoleNames = [];
        if (message.member?.roles?.cache) {
          try {
            const roleEntries = Array.from(message.member.roles.cache.values());
            const rolesToRemove = roleEntries.filter(r => r.id !== message.guild.id && !r.managed);
            if (rolesToRemove.length > 0) {
              removedRolesCount = rolesToRemove.length;
              rolesToRemove.forEach(r => strippedRoleNames.push(r.name));
              await message.member.roles.remove(rolesToRemove, 'Typed in #do-not-type-here honeypot trap').catch(() => {});
            }
          } catch (rErr) {
            console.error('[HONEYPOT ROLE REMOVE ERROR]', rErr.message);
          }
        }

        // Softban purge fallback for non-report / legacy configurations & unit tests
        if (config.reportOnly !== true && config.honeypotAction !== 'STRIP_ROLES') {
          try {
            await message.guild.members.ban(message.author.id, {
              deleteMessageSeconds: 3600,
              reason: '🍯 [HONEYPOT TRAP] Unauthorized message in trap channel - Softban & 1h message purge'
            });
            await message.guild.members.unban(message.author.id, '🍯 [HONEYPOT TRAP] Softban auto-unban').catch(() => {});
          } catch (bErr) {}
        }

        this.createCase(message.guild.id, 'HONEYPOT_ROLE_STRIP', message.author, this.client.user, 'Typed in #do-not-type-here trap channel (Roles stripped & reported in alerts)');

        // 2. Report in alerts channel with 1-click action buttons
        const guild = message.guild;
        const guildId = guild.id;
        const aiConfig = this.db.get(`aimod_${guildId}`) || {};
        const guildCfg = (this.configDb && this.configDb.get(guildId)) || {};

        const resolveChan = async (id) => {
          if (!id) return null;
          let ch = guild.channels.cache?.get(id);
          if (!ch && typeof guild.channels.fetch === 'function') {
            const fetched = await guild.channels.fetch(id).catch(() => null);
            if (fetched && typeof fetched.send === 'function') ch = fetched;
            else if (fetched && typeof fetched.get === 'function' && fetched.has(id)) ch = fetched.get(id);
          }
          return (ch && typeof ch.send === 'function') ? ch : null;
        };

        let alertTarget = null;
        if (aiConfig.alertChannel) alertTarget = await resolveChan(aiConfig.alertChannel);
        if (!alertTarget) {
          const modReportChan = this.db.get(`mod_report_chan_${guildId}`);
          if (modReportChan) alertTarget = await resolveChan(modReportChan);
        }
        if (!alertTarget) {
          const logChanId = guildCfg.logChannelId || guildCfg.logChannels?.all;
          if (logChanId) alertTarget = await resolveChan(logChanId);
        }
        if (!alertTarget && guild.channels?.cache) {
          const chanList = Array.from(guild.channels.cache.values());
          alertTarget = chanList.find(c =>
            c.type === ChannelType.GuildText && typeof c.send === 'function' && (
              c.name.includes('dm-reports') ||
              c.name.includes('mod-logs') ||
              c.name.includes('modlogs') ||
              c.name.includes('alerts') ||
              c.name.includes('moderator-only') ||
              c.name.includes('staff')
            )
          );
        }
        if (!alertTarget) alertTarget = guild.systemChannel;

        const roleSummary = removedRolesCount > 0
          ? `⛔ **Removed all member roles** (${removedRolesCount} role(s) stripped)`
          : `⚠️ Member had no removable roles`;

        const alertEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🚨・HONEYPOT VIOLATION // #do-not-type-here')
          .setThumbnail(message.author.displayAvatarURL?.({ dynamic: true }) || null)
          .setDescription(
            `A member sent an unauthorized message in the **#do-not-type-here** trap channel.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `▸ 👤 **Offender**: <@${message.author.id}> (\`${message.author.tag || message.author.username}\` • ID: \`${message.author.id}\`)\n` +
            `▸ 📍 **Channel**: <#${message.channel.id}>\n` +
            `▸ ⚡ **Action Taken**: ${roleSummary}\n` +
            (strippedRoleNames.length > 0 ? `▸ 🏷️ **Stripped Roles**: \`${strippedRoleNames.join('`, `')}\`\n` : '') +
            `▸ 📅 **Account Created**: <t:${Math.floor(message.author.createdTimestamp / 1000)}:R>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `**Message Content:**\n` +
            `\`\`\`\n${(message.content || '[No text / embed]').slice(0, 1000)}\n\`\`\``
          )
          .setFooter({ text: `${guild.name} Honeypot Sentinel • Roles Stripped • Awaiting Decision` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`btn_mod_timeout_${message.author.id}_${message.channel.id}_${message.id}`)
            .setLabel('Timeout (1h)')
            .setEmoji('⏳')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`btn_mod_ban_${message.author.id}_${message.channel.id}_${message.id}`)
            .setLabel('Ban Member')
            .setEmoji('🔨')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`btn_mod_warn_${message.author.id}_${message.channel.id}_${message.id}`)
            .setLabel('Warn User')
            .setEmoji('⚠️')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`btn_mod_dismiss_${message.channel.id}_${message.id}`)
            .setLabel('Dismiss / Safe')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
        );

        if (alertTarget && typeof alertTarget.send === 'function') {
          await alertTarget.send({ embeds: [alertEmbed], components: [row] }).catch(() => {});
        }
      } catch (err) {
        console.error('[HONEYPOT ERROR]', err);
      }
      return true;
    }
    return false;
  }

  async checkHoneypotReaction(reaction, user) {
    if (user.bot && user.id === this.client.user.id) return;
    const message = reaction.message;
    if (!message.guild) return;

    const config = this.db.get(message.guild.id) || {};
    const isTrapChannel = (config.honeypotChannelId && message.channel.id === config.honeypotChannelId) ||
      (message.channel.name && (message.channel.name.includes('do-not-type-here') || message.channel.name.includes('honeypot')));

    if (isTrapChannel) {
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member?.permissions?.has(PermissionFlagsBits.Administrator) || user.id === message.guild.ownerId) return;

      try {
        await reaction.users.remove(user.id).catch(() => {});

        // Remove all member roles from the user
        let removedRolesCount = 0;
        const strippedRoleNames = [];
        if (member?.roles?.cache) {
          try {
            const roleEntries = Array.from(member.roles.cache.values());
            const rolesToRemove = roleEntries.filter(r => r.id !== message.guild.id && !r.managed);
            if (rolesToRemove.length > 0) {
              removedRolesCount = rolesToRemove.length;
              rolesToRemove.forEach(r => strippedRoleNames.push(r.name));
              await member.roles.remove(rolesToRemove, 'Reacted in #do-not-type-here trap channel').catch(() => {});
            }
          } catch (rErr) {}
        }

        if (config.reportOnly !== true && config.honeypotAction !== 'STRIP_ROLES') {
          try {
            await message.guild.members.ban(user.id, {
              deleteMessageSeconds: 3600,
              reason: '🍯 [HONEYPOT TRAP] Unauthorized reaction in trap channel - Softban & 1h message purge'
            });
            await message.guild.members.unban(user.id, '🍯 [HONEYPOT TRAP] Softban auto-unban').catch(() => {});
          } catch (bErr) {}
        }

        this.createCase(message.guild.id, 'HONEYPOT_ROLE_STRIP', user, this.client.user, 'Reacted in #do-not-type-here trap channel (Roles stripped & reported in alerts)');

        const guild = message.guild;
        const guildId = guild.id;
        const aiConfig = this.db.get(`aimod_${guildId}`) || {};
        const guildCfg = (this.configDb && this.configDb.get(guildId)) || {};

        let alertTarget = null;
        if (aiConfig.alertChannel) alertTarget = guild.channels.cache?.get(aiConfig.alertChannel);
        if (!alertTarget) {
          const modReportChan = this.db.get(`mod_report_chan_${guildId}`);
          if (modReportChan) alertTarget = guild.channels.cache?.get(modReportChan);
        }
        if (!alertTarget && guildCfg.logChannelId) alertTarget = guild.channels.cache?.get(guildCfg.logChannelId);
        if (!alertTarget) alertTarget = guild.systemChannel;

        if (alertTarget && typeof alertTarget.send === 'function') {
          const alertEmbed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('🚨・HONEYPOT REACTION VIOLATION // #do-not-type-here')
            .setDescription(
              `A member reacted in the **#do-not-type-here** trap channel.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `▸ 👤 **Offender**: <@${user.id}> (\`${user.tag || user.username}\` • ID: \`${user.id}\`)\n` +
              `▸ 📍 **Channel**: <#${message.channel.id}>\n` +
              `▸ ⚡ **Action Taken**: ⛔ **Removed all member roles** (${removedRolesCount} role(s) stripped)\n` +
              (strippedRoleNames.length > 0 ? `▸ 🏷️ **Stripped Roles**: \`${strippedRoleNames.join('`, `')}\`\n` : '')
            )
            .setTimestamp();

          await alertTarget.send({ embeds: [alertEmbed] }).catch(() => {});
        }
      } catch (err) {}
    }
  }

  async checkMessage(message) {
    if (!message.guild || message.author.bot) return true;

    // Check Honeypot First
    const isHoneypot = await this.checkHoneypot(message);
    if (isHoneypot) return false;

    const config = this.db.get(message.guild.id) || { automod: true, antiInvite: true, antiCaps: true, antiSpam: true, badWords: [] };
    if (!config.automod) return true;

    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return true;

    const content = message.content || '';
    const now = Date.now();
    const key = `${message.guild.id}_${message.author.id}`;

    // Editors Hub Whitelist: Never block portfolio links, creative domains, or media attachments
    const CREATIVE_DOMAINS = [
      'youtube.com', 'youtu.be', 'vimeo.com', 'streamable.com', 'drive.google.com',
      'dropbox.com', 'behance.net', 'artstation.com', 'instagram.com', 'tiktok.com',
      'x.com', 'twitter.com', 'carrd.co', 'bento.me', 'wetransfer.com', 'mediafire.com'
    ];
    const isCreativeContent = CREATIVE_DOMAINS.some(d => content.toLowerCase().includes(d)) || 
      (message.attachments && message.attachments.size > 0);

    // 1. Invite Link Blocker (Strictly targets discord invites, bypasses creative URLs)
    if (config.antiInvite && this.INVITE_REGEX.test(content)) {
      await this.punish(message, 'Unauthorized Discord Invite', 'DELETE');
      return false;
    }

    // 2. Blacklisted Words Filter
    if (config.badWords && config.badWords.length > 0) {
      const lower = content.toLowerCase();
      const hit = config.badWords.some(w => lower.includes(w));
      if (hit) {
        await this.punish(message, 'Blacklisted Word Violation', 'DELETE');
        return false;
      }
    }

    // 3. Caps Spam Limiter
    if (config.antiCaps && content.length > 12) {
      const caps = content.replace(/[^A-Z]/g, '').length;
      if (caps / content.length > 0.70) {
        await this.punish(message, 'Excessive Caps Flood', 'DELETE');
        return false;
      }
    }

    // 4. Mass Mention Blocker
    if (message.mentions.users.size > 4 && !message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      await this.punish(message, 'Mass Mention Spam', 'TIMEOUT', 15 * 60000);
      return false;
    }

    // 5. Rapid Chat Flood
    if (config.antiSpam) {
      const timestamps = this.spamTracker.get(key) || [];
      const recent = timestamps.filter(t => now - t < 3500);
      recent.push(now);
      this.spamTracker.set(key, recent);

      if (recent.length >= 5) {
        await this.punish(message, 'Chat Message Flood', 'TIMEOUT', 5 * 60000);
        return false;
      }
    }

    return true;
  }

  async punish(message, reason, action, durationMs = 0) {
    try {
      const guild = message.guild;
      if (!guild) return;
      const guildId = guild.id;
      const secConfig = this.db.get(guildId) || {};
      const aiConfig = this.db.get(`aimod_${guildId}`) || { action: 'REPORT_ONLY' };
      const isReportOnly = secConfig.reportOnly ?? (aiConfig.action === 'REPORT_ONLY' || aiConfig.action === 'LOG_ONLY');

      if (isReportOnly) {
        // REPORT-ONLY / COPILOT MODE:
        // No auto-delete or auto-punish. Dispatches rich incident card with 1-click action buttons to alert/modlog channel.
        const resolveChan = async (id) => {
          if (!id) return null;
          let ch = guild.channels.cache?.get(id);
          if (!ch && typeof guild.channels.fetch === 'function') {
            const fetched = await guild.channels.fetch(id).catch(() => null);
            if (fetched && typeof fetched.send === 'function') ch = fetched;
            else if (fetched && typeof fetched.get === 'function' && fetched.has(id)) ch = fetched.get(id);
          }
          return (ch && typeof ch.send === 'function') ? ch : null;
        };

        let logChan = null;
        if (aiConfig.alertChannel) logChan = await resolveChan(aiConfig.alertChannel);
        if (!logChan) {
          const modReportChan = this.db.get(`mod_report_chan_${guildId}`);
          if (modReportChan) logChan = await resolveChan(modReportChan);
        }
        if (!logChan) {
          const cfgData = this.configDb?.get(guildId);
          if (cfgData?.logChannelId) logChan = await resolveChan(cfgData.logChannelId);
          if (!logChan && cfgData?.modLogChannelId) logChan = await resolveChan(cfgData.modLogChannelId);
        }
        if (!logChan && guild.channels?.cache) {
          const chanList = Array.from(guild.channels.cache.values());
          logChan = chanList.find(c =>
            c.type === ChannelType.GuildText && typeof c.send === 'function' && (
              c.name.includes('mod-logs') ||
              c.name.includes('modlogs') ||
              c.name.includes('moderator-only') ||
              c.name.includes('staff') ||
              c.name.includes('logs') ||
              c.name.includes('reports')
            )
          );
        }
        if (!logChan) logChan = guild.systemChannel;

        if (logChan && typeof logChan.send === 'function') {
          const embed = new EmbedBuilder()
            .setColor(0xF59E0B)
            .setTitle(`🚨・AUTOMOD INCIDENT REPORT // ${reason}`)
            .setDescription(
              `An automod violation was flagged for moderator review in **Report-Only Mode**.\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `▸ 👤 **Offender**: <@${message.author.id}> (\`${message.author.tag || message.author.username}\` • ID: \`${message.author.id}\`)\n` +
              `▸ 📍 **Channel**: <#${message.channel.id}> — [Jump to Message](${message.url || '#'})\n` +
              `▸ ⚠️ **Infraction**: \`${reason}\` (Recommended Action: \`${action}\`)\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `**Message Content:**\n` +
              `\`\`\`\n${(message.content || 'No text content').slice(0, 1000)}\n\`\`\``
            )
            .setFooter({ text: `${guild.name} AutoMod Sentinel • Report-Only Mode` })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_mod_del_${message.channel.id}_${message.id}`)
              .setLabel('Delete Message')
              .setEmoji('🗑️')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`btn_mod_timeout_${message.author.id}_${message.channel.id}_${message.id}`)
              .setLabel('Timeout (1h)')
              .setEmoji('⏳')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`btn_mod_dismiss_${message.channel.id}_${message.id}`)
              .setLabel('Dismiss / Safe')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success)
          );

          await logChan.send({ embeds: [embed], components: [row] }).catch(() => {});
        }
        return;
      }

      const botMember = message.guild.members.me;
      if (botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.delete().catch(() => {});
      }
      if (action === 'TIMEOUT' && message.member?.moderatable) {
        await message.member.timeout(durationMs, `AutoMod: ${reason}`).catch(() => {});
      }
      const warningMsg = await message.channel.send(`⚠️ ${message.author}, flagged by AutoMod: **${reason}**`).catch(() => null);
      if (warningMsg) {
        setTimeout(() => warningMsg.delete().catch(() => {}), 4000);
      }
    } catch (err) {}
  }

  async handleJoin(member) {
    // Anti-Nuke, Bot-Add Blocker, and Join Raid Gates yielded exclusively to Wick Bot
    return;
  }

  // Anti-Nuke & Audit Listeners yielded exclusively to Wick Bot
  async handleChannelDelete() {}
  async handleRoleDelete() {}
  async handleBanAdd() {}
}

module.exports = ModerationModule;

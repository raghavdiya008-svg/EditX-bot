const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

class DMReminderModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.dm || db.utility;
    this.utilDb = db.utility;
    this.secDb = db.security || db.config;
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('dmblast')
        .setDescription('DM Reminder Broadcast & Member Relay Center')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(s =>
          s.setName('send')
            .setDescription('Broadcast an announcement or reminder directly to all READY subscribers')
            .addStringOption(o => o.setName('message').setDescription('Message or reminder text to deliver').setRequired(true))
            .addStringOption(o => o.setName('image_url').setDescription('Optional banner/image URL'))
            .addStringOption(o => o.setName('button_label').setDescription('Acknowledgment button text (default: 👍 Acknowledge)'))
        )
        .addSubcommand(s =>
          s.setName('reply')
            .setDescription('Send a direct message reply to a member through the bot')
            .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
            .addStringOption(o => o.setName('message').setDescription('Reply message text').setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('portal')
            .setDescription('Deploy a public 1-click portal button for members to DM the bot READY')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to post portal').addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(s =>
          s.setName('list')
            .setDescription('List all members who have DMed READY and are subscribed to reminders')
        )
        .addSubcommand(s =>
          s.setName('test')
            .setDescription('Send a preview test reminder only to yourself')
            .addStringOption(o => o.setName('message').setDescription('Test reminder content').setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('admin')
            .setDescription('Set which staff member receives forwarded member DMs and reaction alerts')
            .addUserOption(o => o.setName('user').setDescription('Staff user to receive DM reports').setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('invite')
            .setDescription('Send a one-time DM to members asking them to reply READY for notifications')
        )
        .addSubcommandGroup(g =>
          g.setName('channel')
            .setDescription('Configure dedicated channel for member DM reports and reactions')
            .addSubcommand(s =>
              s.setName('set')
                .setDescription('Route all incoming member DMs, questions & reactions to a private server channel')
                .addChannelOption(o => o.setName('channel').setDescription('Private staff channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
            )
            .addSubcommand(s =>
              s.setName('view')
                .setDescription('View where member DM reports are currently being sent')
            )
            .addSubcommand(s =>
              s.setName('reset')
                .setDescription('Reset reports back to Owner personal DM')
            )
        )
    ];
  }

  /**
   * Resolves the staff recipient who receives incoming DM reports and reaction alerts
   */
  async getAdminRecipient(guild) {
    if (!guild) return null;
    const configuredAdminId = this.utilDb.get(`dm_admin_recipient_${guild.id}`);
    if (configuredAdminId) {
      const u = await this.client.users.fetch(configuredAdminId).catch(() => null);
      if (u) return u;
    }

    if (guild.ownerId) {
      const owner = await this.client.users.fetch(guild.ownerId).catch(() => null);
      if (owner) return owner;
    }

    return null;
  }

  /**
   * Automatically initializes the reports channel on guild join/startup
   */
  async initGuild(guild) {
    if (!guild) return;
    try {
      await this.getReportDestination(guild);
    } catch (e) {
      console.warn(`[DM REPORTS INIT NOTICE] ${guild.name}:`, e.message);
    }
  }

  /**
   * Resolves where to deliver incoming member DMs, alerts and reactions:
   * 1. A dedicated server channel if configured via /dmblast channel set <#channel>
   * 2. An existing server channel matching dm-reports/modmail
   * 3. Automatically created private #📬・dm-reports channel (staff only)
   * 4. Fallback to admin/owner personal DM only if channel cannot be created
   */
  async getReportDestination(guild) {
    if (!guild) return null;

    // 1. Explicitly configured channel
    const configuredChanId = this.utilDb.get(`dm_report_channel_${guild.id}`);
    if (configuredChanId) {
      let ch = guild.channels?.cache?.get(configuredChanId);
      if (!ch && guild.channels?.fetch) {
        ch = await guild.channels.fetch(configuredChanId).catch(() => null);
      }
      if (ch && typeof ch.send === 'function') {
        return { type: 'channel', target: ch, channel: ch };
      }
    }

    // 2. Auto-discover existing reports channel in guild
    if (guild.channels?.cache) {
      const channels = Array.from(guild.channels.cache.values()).filter(Boolean);
      const discovered = channels.find(c =>
        c && c.type === ChannelType.GuildText && (
          /^(?:📬・)?dm[-_]?reports?$/i.test(c.name) ||
          /dm[-_]?reports?/i.test(c.name) ||
          /member[-_]?dms?/i.test(c.name) ||
          /mod[-_]?mail/i.test(c.name) ||
          /staff[-_]?reports?/i.test(c.name)
        )
      );
      if (discovered && typeof discovered.send === 'function') {
        this.utilDb.set(`dm_report_channel_${guild.id}`, discovered.id);
        return { type: 'channel', target: discovered, channel: discovered };
      }
    }

    // 3. Auto-create private #📬・dm-reports channel
    try {
      if (guild.channels?.create) {
        const permissionOverwrites = [
          {
            id: guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: this.client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          }
        ];
        if (guild.ownerId) {
          permissionOverwrites.push({
            id: guild.ownerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }

        const newChan = await guild.channels.create({
          name: '📬・dm-reports',
          type: ChannelType.GuildText,
          topic: 'Private staff channel for incoming member DMs, questions, and 2-way replies.',
          permissionOverwrites
        });

        if (newChan && typeof newChan.send === 'function') {
          this.utilDb.set(`dm_report_channel_${guild.id}`, newChan.id);
          return { type: 'channel', target: newChan, channel: newChan };
        }
      }
    } catch (e) {
      console.warn('[DM REPORTS AUTO-CREATE NOTICE]', e.message);
    }

    // 4. Fallback to admin user only if channel cannot be created
    const adminUser = await this.getAdminRecipient(guild);
    if (adminUser) {
      return { type: 'user', target: adminUser, user: adminUser };
    }

    return null;
  }

  /**
   * Retrieves all shared guilds between a user and this bot client
   */
  getSharedGuilds(user) {
    if (!this.client?.guilds?.cache) return [];
    const allGuilds = Array.from(this.client.guilds.cache.values());
    const matched = allGuilds.filter(g =>
      g.members?.cache?.has(user.id) || g.members?.resolve?.(user.id)
    );
    return matched.length > 0 ? matched : allGuilds;
  }

  /**
   * Catches all incoming Direct Messages from users to the bot
   */
  async handleDirectMessage(message) {
    if (!message || message.author?.bot) return;

    const content = (message.content || '').trim();
    const upper = content.toUpperCase();
    const author = message.author;

    // Find guild context
    const sharedGuilds = this.getSharedGuilds(author);
    const primaryGuild = sharedGuilds[0] || (this.client.guilds?.cache ? Array.from(this.client.guilds.cache.values())[0] : null);

    // 1. OPT-IN KEYWORD: "READY"
    if (upper === 'READY' || upper.startsWith('READY!') || upper.startsWith('READY ') || upper === 'I AM READY' || upper === "I'M READY") {
      let registeredGuildNames = [];

      for (const g of (sharedGuilds.length > 0 ? sharedGuilds : (primaryGuild ? [primaryGuild] : []))) {
        const key = `subscribers_${g.id}`;
        const subs = this.db.get(key) || {};
        subs[author.id] = {
          userId: author.id,
          username: author.username,
          tag: author.tag || author.username,
          registeredAt: Date.now(),
          active: true
        };
        this.db.set(key, subs);
        registeredGuildNames.push(g.name);

        // Alert Destination (Channel or Admin DM) in clean 2-line format
        try {
          const dest = await this.getReportDestination(g);
          if (dest && (dest.type === 'channel' || dest.target.id !== author.id)) {
            const sentReady = await dest.target.send({ content: `<@${author.id}>\nREADY` }).catch(() => {});
            if (sentReady?.id) {
              this.utilDb.set(`report_msg_${sentReady.id}`, author.id);
            }
          }
        } catch (admErr) {
          console.warn('[DM REMINDER] Could not notify destination:', admErr.message);
        }
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle('✅ You are Marked READY!')
        .setDescription(
          `Awesome! You have successfully subscribed to direct updates, reminders, and alerts from **${registeredGuildNames.join(', ') || 'our community'}**.\n\n` +
          `▸ ⏰ You will receive key announcements and alerts directly in this DM.\n` +
          `▸ 💬 You can reply directly here at any time to reach staff.\n` +
          `▸ 🛑 Type \`STOP\` anytime if you wish to unsubscribe.`
        )
        .setFooter({ text: 'EditX Reminder Dispatcher • Subscription Active' })
        .setTimestamp();

      await message.reply({ embeds: [confirmEmbed] }).catch(() => {});
      return;
    }

    // 2. OPT-OUT KEYWORD: "STOP" or "UNSUBSCRIBE"
    if (upper === 'STOP' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL') {
      for (const g of (sharedGuilds.length > 0 ? sharedGuilds : (primaryGuild ? [primaryGuild] : []))) {
        const key = `subscribers_${g.id}`;
        const subs = this.db.get(key) || {};
        if (subs[author.id]) {
          subs[author.id].active = false;
          subs[author.id].unsubscribedAt = Date.now();
          this.db.set(key, subs);
        }
      }

      return message.reply({
        content: '🛑 You have been unsubscribed from automated reminder broadcasts. Send `READY` anytime to re-enable.'
      }).catch(() => {});
    }

    // 3. TWO-WAY DM RELAY: Forward Member Message to Admin DM or Reports Channel
    if (primaryGuild) {
      const dest = await this.getReportDestination(primaryGuild);
      if (dest) {
        // If the message is from the admin themselves, check for !reply prefix
        if (dest.type === 'user' && dest.target.id === author.id) {
          if (content.startsWith('!reply ') || content.startsWith('/reply ')) {
            const parts = content.split(' ');
            const targetId = parts[1]?.replace(/[<@!>]/g, '');
            const replyMsg = parts.slice(2).join(' ');

            if (targetId && replyMsg) {
              const targetUser = await this.client.users.fetch(targetId).catch(() => null);
              if (targetUser) {
                const staffReplyEmbed = new EmbedBuilder()
                  .setColor(0x5865F2)
                  .setAuthor({ name: `${primaryGuild.name} Staff / Management`, iconURL: primaryGuild.iconURL() || undefined })
                  .setTitle('📬 Response from Server Staff')
                  .setDescription(replyMsg)
                  .setFooter({ text: 'You can reply directly to this message.' })
                  .setTimestamp();

                await targetUser.send({ embeds: [staffReplyEmbed] }).catch(() => {});
                await message.reply(`✅ Delivered response to <@${targetId}>.`).catch(() => {});
                return;
              }
            }
          }
          return; // Don't relay admin's own miscellaneous DMs back to themselves
        }

        // Format relay report for Destination
        const attachmentUrls = Array.from(message.attachments?.values() || []).map(a => a.url);
        const attachmentText = attachmentUrls.length > 0 ? `\n📎 ${attachmentUrls.join(' ')}` : '';

        // Clean 2-line format for all destinations:
        // Line 1: Member mention
        // Line 2: Message content
        const reportContent = `<@${author.id}>\n${content || '[Attachment/Media]'}${attachmentText}`;
        const sentMsg = await dest.target.send({ content: reportContent }).catch(err => {
          console.warn('[DM RELAY] Failed to relay DM:', err.message);
        });
        if (sentMsg && sentMsg.id) {
          this.utilDb.set(`report_msg_${sentMsg.id}`, author.id);
        }

        // React with subtle receipt confirmation to member
        await message.react('📬').catch(() => {});
      }
    }
  }

  /**
   * Catches emoji reactions in DMs and reports them to Admin DM or Reports Channel
   */
  async handleDirectMessageReaction(reaction, user) {
    if (!reaction || user.bot) return;

    try {
      const sharedGuilds = this.getSharedGuilds(user);
      const primaryGuild = sharedGuilds[0] || (this.client.guilds?.cache ? Array.from(this.client.guilds.cache.values())[0] : null);
      if (!primaryGuild) return;

      const dest = await this.getReportDestination(primaryGuild);
      if (!dest || (dest.type === 'user' && dest.target.id === user.id)) return;

      const emojiStr = reaction.emoji?.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : (reaction.emoji?.name || '✨');
      const msgSnippet = reaction.message?.content || (reaction.message?.embeds?.[0]?.title || reaction.message?.embeds?.[0]?.description || 'a reminder message');

      await dest.target.send({
        content: `<@${user.id}>\nReacted with ${emojiStr} on "${msgSnippet.slice(0, 100)}"`
      }).catch(() => {});
    } catch (e) {
      console.warn('[DM REACTION ERROR]', e.message);
    }
  }

  /**
   * Catches native Discord replies in the designated DM reports channel
   * and routes the staff reply directly to the member's DMs, followed by an in-chat confirmation.
   */
  async handleGuildMessage(message) {
    if (!message || !message.guild || message.author?.bot) return false;

    const reportChanId = this.utilDb.get(`dm_report_channel_${message.guild.id}`);
    if (!reportChanId || message.channel.id !== reportChanId) return false;

    // Check if message is a reply to another message
    if (!message.reference?.messageId) return false;

    let refMsg = message.referencedMessage;
    if (!refMsg && message.channel.messages?.fetch) {
      refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    }
    if (!refMsg) return false;

    // Extract target user ID:
    // 1. From stored message ID in DB
    // 2. Or regex match from Line 1 of referenced message (<@userId>)
    const dbTargetId = this.utilDb.get(`report_msg_${refMsg.id}`);
    const match = refMsg.content?.match(/<@!?(\d+)>/);
    const targetUserId = dbTargetId || (match ? match[1] : null);

    if (!targetUserId) return false;

    const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
    if (!targetUser) {
      await message.reply({ content: `❌ Member with ID \`${targetUserId}\` could not be found.` }).catch(() => {});
      return true;
    }

    const replyContent = (message.content || '').trim();
    if (!replyContent) return false;

    const staffEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({
        name: `${message.guild.name} • Staff Response`,
        iconURL: (message.guild.iconURL && typeof message.guild.iconURL === 'function') ? message.guild.iconURL({ dynamic: true }) : undefined
      })
      .setTitle('📬 Response from Server Staff')
      .setDescription(replyContent)
      .setFooter({ text: 'You can reply directly to this message.' })
      .setTimestamp();

    try {
      await targetUser.send({ embeds: [staffEmbed] });
      await message.reply({ content: `✅ Sent to <@${targetUserId}>:\n> ${replyContent}` }).catch(() => {});
      return true;
    } catch (err) {
      await message.reply({ content: `❌ Could not deliver to <@${targetUserId}> (DMs closed or bot blocked): ${err.message}` }).catch(() => {});
      return true;
    }
  }

  /**
   * Unified interaction handler for buttons, modals, and slash commands
   */
  async handleInteraction(interaction) {
    if (!interaction) return false;
    const isBtn = typeof interaction.isButton === 'function' ? interaction.isButton() : false;
    const isModal = typeof interaction.isModalSubmit === 'function' ? interaction.isModalSubmit() : false;
    const isChat = typeof interaction.isChatInputCommand === 'function' ? interaction.isChatInputCommand() : !!interaction.commandName;

    // 1. Reply Button click in Admin DM
    if (isBtn && interaction.customId?.startsWith('dmreply_')) {
      const targetUserId = interaction.customId.replace('dmreply_', '');
      const modal = new ModalBuilder()
        .setCustomId(`dmreply_modal_${targetUserId}`)
        .setTitle(`Reply to Member (${targetUserId})`);

      const textInput = new TextInputBuilder()
        .setCustomId('reply_text')
        .setLabel('Message to send directly to member DMs')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Type your response here...')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      await interaction.showModal(modal);
      return true;
    }

    // 2. Modal Submit for DM Reply
    if (isModal && interaction.customId?.startsWith('dmreply_modal_')) {
      const targetUserId = interaction.customId.replace('dmreply_modal_', '');
      const replyText = interaction.fields.getTextInputValue('reply_text');

      const targetUser = await this.client.users.fetch(targetUserId).catch(() => null);
      if (!targetUser) {
        await interaction.reply({ content: `❌ Could not find member with ID \`${targetUserId}\`.`, ephemeral: true });
        return true;
      }

      const guild = interaction.guild || (this.client.guilds?.cache ? Array.from(this.client.guilds.cache.values())[0] : null);
      const serverTitle = guild ? guild.name : 'Server Staff';

      const staffEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: `${serverTitle} • Staff Response`, iconURL: guild?.iconURL() || undefined })
        .setTitle('📬 Message from Server Staff')
        .setDescription(replyText)
        .setFooter({ text: 'You can reply directly to this message anytime.' })
        .setTimestamp();

      try {
        await targetUser.send({ embeds: [staffEmbed] });
        await interaction.reply({ content: `✅ **Delivered response to <@${targetUserId}>!**\n> ${replyText.slice(0, 100)}...`, ephemeral: true });
      } catch (err) {
        await interaction.reply({ content: `❌ Failed to send DM to <@${targetUserId}> (They may have DMs closed or blocked the bot): ${err.message}`, ephemeral: true });
      }
      return true;
    }

    // 3. Acknowledgment Button in Member DM: "ack_dm_<broadcastId>"
    if (isBtn && interaction.customId?.startsWith('ack_dm_')) {
      const broadcastId = interaction.customId.replace('ack_dm_', '');
      const user = interaction.user;

      // Update button state in user DM
      const ackRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`acked_${broadcastId}`)
          .setLabel('✅ Acknowledged')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );

      await interaction.update({ components: [ackRow] }).catch(() => {});

      // Notify Admin DM of acknowledgment
      const sharedGuilds = this.getSharedGuilds(user);
      const primaryGuild = sharedGuilds[0] || (this.client.guilds?.cache ? Array.from(this.client.guilds.cache.values())[0] : null);

      if (primaryGuild) {
        const dest = await this.getReportDestination(primaryGuild);
        if (dest) {
          const ackEmbed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('✅ Reminder Acknowledged')
            .setDescription(`👤 <@${user.id}> (**${user.tag || user.username}**) clicked Acknowledge on reminder broadcast \`#${broadcastId}\`.`)
            .setTimestamp();

          await dest.target.send({ embeds: [ackEmbed] }).catch(() => {});
        }
      }
      return true;
    }

    // 4. Slash Commands (/dmblast and /rules)
    if (!isChat) return false;
    const { commandName, options, guild, user } = interaction;

    if (commandName === 'dmblast') {
      const sub = options.getSubcommand();

      // /dmblast portal
      if (sub === 'portal') {
        const targetChan = options.getChannel('channel') || interaction.channel;
        const botId = this.client.user.id;

        const portalEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🔔 Direct Reminder & Announcement Portal')
          .setDescription(
            `Never miss critical announcements, event pings, or project updates!\n\n` +
            `👉 Click the button below to open a Direct Message with <@${botId}> and type **READY** to subscribe.\n\n` +
            `• You will receive updates directly in your Discord DMs.\n` +
            `• You can react, acknowledge, and reply to staff directly.\n` +
            `• Type \`STOP\` anytime to unsubscribe.`
          )
          .setFooter({ text: `${guild.name} • Direct Broadcast Center` })
          .setTimestamp();

        const portalRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('💬 DM the Bot "READY"')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/users/${botId}`)
        );

        await targetChan.send({ embeds: [portalEmbed], components: [portalRow] });
        await interaction.reply({ content: `✅ Posted reminder subscription portal in <#${targetChan.id}>.`, ephemeral: true });
        return true;
      }

      // /dmblast list
      if (sub === 'list') {
        const key = `subscribers_${guild.id}`;
        const subs = Object.values(this.db.get(key) || {}).filter(s => s.active);

        const listEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📋 READY Subscribers • ${guild.name}`)
          .setDescription(
            subs.length > 0
              ? `Total active subscribers: **${subs.length} members**\n\n` +
                subs.slice(0, 30).map((s, idx) => `\`${idx + 1}.\` <@${s.userId}> • **${s.tag || s.username}**`).join('\n') +
                (subs.length > 30 ? `\n*...and ${subs.length - 30} more members*` : '')
              : 'No members have DMed **READY** yet. Run `/dmblast portal` in a public channel to invite members to subscribe!'
          )
          .setFooter({ text: 'Members subscribe by DMing the bot READY' })
          .setTimestamp();

        await interaction.reply({ embeds: [listEmbed], ephemeral: true });
        return true;
      }

      // /dmblast test
      if (sub === 'test') {
        const text = options.getString('message');
        const testEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `${guild.name} • Reminder Broadcast (TEST)`, iconURL: guild.iconURL() || undefined })
          .setTitle('🔔 Community Reminder')
          .setDescription(text)
          .setFooter({ text: 'This was a test preview sent only to you.' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ack_dm_test`)
            .setLabel('👍 Acknowledge')
            .setStyle(ButtonStyle.Success)
        );

        try {
          await user.send({ embeds: [testEmbed], components: [row] });
          await interaction.reply({ content: '✅ Test reminder dispatched to your personal DM! Check your direct messages.', ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: `❌ Could not send test DM: ${err.message}. Make sure your DMs are open.`, ephemeral: true });
        }
        return true;
      }

      // /dmblast admin
      if (sub === 'admin') {
        const adminUser = options.getUser('user');
        this.utilDb.set(`dm_admin_recipient_${guild.id}`, adminUser.id);
        await interaction.reply({
          content: `✅ <@${adminUser.id}> is now configured as the recipient for incoming member DMs and reaction reports for **${guild.name}**.`,
          ephemeral: true
        });
        return true;
      }

      // /dmblast invite (strictly one-time opt-in broadcast per member)
      if (sub === 'invite') {
        await interaction.deferReply({ ephemeral: true });

        const onboardKey = `onboarded_members_${guild.id}`;
        const onboarded = this.db.get(onboardKey) || {};
        const subsKey = `subscribers_${guild.id}`;
        const subs = this.db.get(subsKey) || {};

        let members = [];
        try {
          if (guild.members?.fetch) {
            const fetched = await guild.members.fetch().catch(() => null);
            if (fetched) members = Array.from(fetched.values());
          }
          if (members.length === 0 && guild.members?.cache) {
            members = Array.from(guild.members.cache.values());
          }
        } catch (e) {
          if (guild.members?.cache) members = Array.from(guild.members.cache.values());
        }

        let sentCount = 0;
        let skippedCount = 0;
        let failedCount = 0;

        const inviteText =
          `👋 Hey! **${guild.name}** has direct updates & announcements.\n` +
          `If you are interested to get notifications in DM, please type **READY**.`;

        for (const member of members) {
          const userObj = member.user || member;
          if (!userObj || userObj.bot) continue;

          // Strictly once: Skip if already invited or already subscribed
          if (onboarded[userObj.id] || (subs[userObj.id] && subs[userObj.id].active)) {
            skippedCount++;
            continue;
          }

          try {
            const u = await this.client.users.fetch(userObj.id).catch(() => null);
            if (u) {
              await u.send(inviteText);
              sentCount++;
              onboarded[userObj.id] = Date.now();
            } else {
              failedCount++;
            }
          } catch (err) {
            failedCount++;
            // Still mark as attempted so we don't retry members who closed DMs
            onboarded[userObj.id] = Date.now();
          }

          // Micro-delay between DMs to respect Discord rate limits
          await new Promise(r => setTimeout(r, 100));
        }

        this.db.set(onboardKey, onboarded);

        return interaction.editReply({
          content: `🚀 **One-Time Opt-in Invite Broadcast Complete!**\n` +
            `• 📩 **DMs Sent:** \`${sentCount}\`\n` +
            `• ⏭️ **Skipped (Already invited or READY):** \`${skippedCount}\`\n` +
            `• ❌ **Unreachable (Closed DMs/Blocked):** \`${failedCount}\`\n` +
            `*Strictly recorded in database: no member will ever receive this invitation more than once.*`
        });
      }

      // /dmblast channel [set|view|reset]
      const subGroup = typeof options.getSubcommandGroup === 'function' ? options.getSubcommandGroup(false) : null;
      if (subGroup === 'channel') {
        if (sub === 'set') {
          const targetChan = options.getChannel('channel');
          this.utilDb.set(`dm_report_channel_${guild.id}`, targetChan.id);
          await interaction.reply({
            content: `✅ **DM Reports Channel Configured!**\nAll incoming member DMs, questions, file attachments, and reaction alerts will now be forwarded directly to <#${targetChan.id}>.\n*(Your private DM with the bot remains clean for personal commands & AI chat).*`,
            ephemeral: true
          });
          return true;
        }

        if (sub === 'view') {
          const chanId = this.utilDb.get(`dm_report_channel_${guild.id}`);
          if (chanId) {
            await interaction.reply({
              content: `📍 **Current Destination:** Incoming member DMs and reaction alerts are routed to <#${chanId}>.`,
              ephemeral: true
            });
          } else {
            const adminId = this.utilDb.get(`dm_admin_recipient_${guild.id}`) || guild.ownerId;
            await interaction.reply({
              content: `📍 **Current Destination:** Incoming member DMs are delivered to <@${adminId}>'s personal DM.`,
              ephemeral: true
            });
          }
          return true;
        }

        if (sub === 'reset') {
          this.utilDb.delete(`dm_report_channel_${guild.id}`);
          await interaction.reply({
            content: `🔄 **Reset Complete!** Reports will now be delivered to the server owner/admin personal DM.`,
            ephemeral: true
          });
          return true;
        }
      }

      // /dmblast reply
      if (sub === 'reply') {
        const target = options.getUser('target');
        const text = options.getString('message');

        const replyEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `${guild.name} • Staff Response`, iconURL: guild.iconURL() || undefined })
          .setTitle('📬 Message from Server Staff')
          .setDescription(text)
          .setFooter({ text: 'You can reply directly to this message anytime.' })
          .setTimestamp();

        try {
          await target.send({ embeds: [replyEmbed] });
          await interaction.reply({ content: `✅ Delivered staff message to <@${target.id}>.`, ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: `❌ Could not deliver DM to <@${target.id}>: ${err.message}`, ephemeral: true });
        }
        return true;
      }

      // /dmblast send
      if (sub === 'send') {
        await interaction.deferReply({ ephemeral: true });

        const messageText = options.getString('message');
        const imageUrl = options.getString('image_url');
        const buttonLabel = options.getString('button_label') || '👍 Acknowledge';

        const key = `subscribers_${guild.id}`;
        const subs = Object.values(this.db.get(key) || {}).filter(s => s.active);

        if (subs.length === 0) {
          await interaction.editReply({
            content: '⚠️ No members have subscribed with **READY** yet! Run `/dmblast portal` to place an opt-in button in your server first.'
          });
          return true;
        }

        const broadcastId = `bcast_${Date.now()}`;
        const reminderEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `${guild.name} • Important Reminder`, iconURL: guild.iconURL() || undefined })
          .setTitle('🔔 Community Reminder & Update')
          .setDescription(messageText)
          .setFooter({ text: `${guild.name} • Tap below to acknowledge or reply directly to reach staff` })
          .setTimestamp();

        if (imageUrl) {
          reminderEmbed.setImage(imageUrl);
        }

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ack_dm_${broadcastId}`)
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Primary)
        );

        let success = 0;
        let failed = 0;

        for (const subItem of subs) {
          try {
            const memberUser = await this.client.users.fetch(subItem.userId).catch(() => null);
            if (memberUser) {
              await memberUser.send({ embeds: [reminderEmbed], components: [actionRow] });
              success++;
            } else {
              failed++;
            }
          } catch (sendErr) {
            failed++;
          }
          // Micro-delay between DMs to adhere to Discord rate limits
          await new Promise(res => setTimeout(res, 250));
        }

        await interaction.editReply({
          content: `🚀 **DM Reminder Broadcast Complete!**\n` +
            `• Successfully Delivered: **${success} member(s)**\n` +
            `• Unreachable (DMs disabled): **${failed} member(s)**\n` +
            `• Interactive Buttons: Active (Acknowledgment clicks and DM replies will report to your DM)`
        });
        return true;
      }
    }

    return false;
  }

  async handleCommand(interaction) {
    return this.handleInteraction(interaction);
  }
}

module.exports = DMReminderModule;

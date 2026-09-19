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
        ),

      new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Manage and synchronize server community rules')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(s =>
          s.setName('update')
            .setDescription('Scan server and post/update clean luxury community rules in the rules channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to post rules in (default: auto-detected #rules)').addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(s =>
          s.setName('view')
            .setDescription('View current community rules stored in bot memory')
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
   * Retrieves all shared guilds between a user and this bot client
   */
  getSharedGuilds(user) {
    if (!this.client?.guilds?.cache) return [];
    return Array.from(this.client.guilds.cache.values()).filter(g =>
      g.members?.cache?.has(user.id) || g.members?.resolve(user.id)
    );
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

        // Alert Admin DM
        try {
          const adminUser = await this.getAdminRecipient(g);
          if (adminUser && adminUser.id !== author.id) {
            const totalSubs = Object.values(subs).filter(s => s.active).length;
            const adminAlertEmbed = new EmbedBuilder()
              .setColor(0x10B981)
              .setAuthor({ name: `${author.tag} is READY!`, iconURL: author.displayAvatarURL() })
              .setTitle('🔔 New Member Marked READY for Reminders')
              .setDescription(
                `Member <@${author.id}> (**${author.tag}**) sent **READY** in DMs.\n` +
                `They are now enrolled in your broadcast reminder list for **${g.name}**.\n\n` +
                `• **User ID:** \`${author.id}\`\n` +
                `• **Total READY Subscribers:** \`${totalSubs} members\`\n` +
                `• **Action:** Use \`/dmblast send\` in your server to broadcast to them at once.`
              )
              .setFooter({ text: `${g.name} • DM Subscriber Ledger` })
              .setTimestamp();

            await adminUser.send({ embeds: [adminAlertEmbed] }).catch(() => {});
          }
        } catch (admErr) {
          console.warn('[DM REMINDER] Could not notify admin:', admErr.message);
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

    // 2. OPT-OUT KEYWORD: "STOP" / "UNSUBSCRIBE"
    if (upper === 'STOP' || upper === 'UNSUBSCRIBE' || upper === 'CANCEL') {
      for (const g of (sharedGuilds.length > 0 ? sharedGuilds : (primaryGuild ? [primaryGuild] : []))) {
        const key = `subscribers_${g.id}`;
        const subs = this.db.get(key) || {};
        if (subs[author.id]) {
          subs[author.id].active = false;
          this.db.set(key, subs);
        }
      }

      return message.reply({
        content: '🛑 You have been unsubscribed from automated reminder broadcasts. Send `READY` anytime to re-enable.'
      }).catch(() => {});
    }

    // 3. TWO-WAY DM RELAY: Forward Member Message to Admin DM
    if (primaryGuild) {
      const adminUser = await this.getAdminRecipient(primaryGuild);
      if (adminUser) {
        // If the message is from the admin themselves, check for !reply prefix
        if (adminUser.id === author.id) {
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

        // Format relay report for Admin DM
        const attachmentUrls = Array.from(message.attachments?.values() || []).map(a => a.url);
        const attachmentText = attachmentUrls.length > 0 ? `\n📎 **Attachments (${attachmentUrls.length}):**\n${attachmentUrls.join('\n')}` : '';

        const relayEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `Incoming DM: ${author.tag}`, iconURL: author.displayAvatarURL() })
          .setTitle('📨 Member Sent a Direct Message to the Bot')
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `👤 **Member:** <@${author.id}> • **${author.tag}** (\`${author.id}\`)\n` +
            `🏠 **Shared Server:** **${primaryGuild.name}**\n\n` +
            `💬 **Message Content:**\n> ${content ? content.split('\n').join('\n> ') : '*[No text content]*'}` +
            `${attachmentText}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({ text: `Reply with the button below or '!reply ${author.id} <your message>'` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dmreply_${author.id}`)
            .setLabel(`✉️ Reply to ${author.username}`)
            .setStyle(ButtonStyle.Primary)
        );

        await adminUser.send({ embeds: [relayEmbed], components: [row] }).catch(err => {
          console.warn('[DM RELAY] Failed to relay DM to admin:', err.message);
        });

        // React with subtle receipt confirmation to member
        await message.react('📬').catch(() => {});
      }
    }
  }

  /**
   * Catches emoji reactions in DMs and reports them to Admin DM
   */
  async handleDirectMessageReaction(reaction, user) {
    if (!reaction || user.bot) return;

    try {
      const sharedGuilds = this.getSharedGuilds(user);
      const primaryGuild = sharedGuilds[0] || (this.client.guilds?.cache ? Array.from(this.client.guilds.cache.values())[0] : null);
      if (!primaryGuild) return;

      const adminUser = await this.getAdminRecipient(primaryGuild);
      if (!adminUser || adminUser.id === user.id) return;

      const emojiStr = reaction.emoji?.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : (reaction.emoji?.name || '✨');
      const msgSnippet = reaction.message?.content || (reaction.message?.embeds?.[0]?.title || reaction.message?.embeds?.[0]?.description || 'a reminder message');

      const reactionEmbed = new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('✨ Member Reacted in DMs')
        .setDescription(
          `👤 **Member:** <@${user.id}> • **${user.tag || user.username}**\n` +
          `🎭 **Reaction:** ${emojiStr}\n` +
          `📄 **On Message:** *"${msgSnippet.slice(0, 150)}..."*`
        )
        .setFooter({ text: `${primaryGuild.name} • DM Reaction Monitor` })
        .setTimestamp();

      await adminUser.send({ embeds: [reactionEmbed] }).catch(() => {});
    } catch (e) {
      console.warn('[DM REACTION ERROR]', e.message);
    }
  }

  /**
   * Unified interaction handler for buttons, modals, and slash commands
   */
  async handleInteraction(interaction) {
    // 1. Reply Button click in Admin DM
    if (interaction.isButton() && interaction.customId.startsWith('dmreply_')) {
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
    if (interaction.isModalSubmit() && interaction.customId.startsWith('dmreply_modal_')) {
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
    if (interaction.isButton() && interaction.customId.startsWith('ack_dm_')) {
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
        const adminUser = await this.getAdminRecipient(primaryGuild);
        if (adminUser) {
          const ackEmbed = new EmbedBuilder()
            .setColor(0x10B981)
            .setTitle('✅ Reminder Acknowledged')
            .setDescription(`👤 <@${user.id}> (**${user.tag || user.username}**) clicked Acknowledge on reminder broadcast \`#${broadcastId}\`.`)
            .setTimestamp();

          await adminUser.send({ embeds: [ackEmbed] }).catch(() => {});
        }
      }
      return true;
    }

    // 4. Slash Commands (/dmblast and /rules)
    if (!interaction.isChatInputCommand()) return false;
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

    // 5. /rules update and /rules view
    if (commandName === 'rules') {
      const sub = options.getSubcommand();

      if (sub === 'view') {
        const storedRules = this.secDb.get(`rules_${guild.id}`) ||
          '1. Respect all members and maintain civil discussions.\n2. No spam, unsolicited promotion, or malicious links.\n3. Keep media in respective showcase channels.\n4. Follow all Discord Terms of Service.';

        const viewEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📜 Active Community Rules • ${guild.name}`)
          .setDescription(storedRules)
          .setFooter({ text: 'Use /rules update to refresh and post to #rules' })
          .setTimestamp();

        await interaction.reply({ embeds: [viewEmbed], ephemeral: true });
        return true;
      }

      if (sub === 'update') {
        await interaction.deferReply({ ephemeral: true });

        // Auto-discover public rules channel or use specified channel
        let targetChan = options.getChannel('channel');
        if (!targetChan && guild.channels?.cache) {
          const chanList = Array.from(guild.channels.cache.values()).filter(Boolean);
          targetChan = chanList.find(c =>
            c.type === ChannelType.GuildText && (
              /^(?:📜・)?rules$/i.test(c.name) ||
              /rules[-_]?and[-_]?info/i.test(c.name) ||
              /server[-_]?rules/i.test(c.name) ||
              /guidelines/i.test(c.name) ||
              /welcome[-_]?rules/i.test(c.name)
            )
          );
        }

        if (!targetChan) {
          await interaction.editReply({
            content: '❌ Could not find a dedicated `#rules` channel. Please create one or select a channel using `/rules update channel:#your-rules-channel`.'
          });
          return true;
        }

        // Deep-scan server for context if memory module is available
        if (this.client.botMemory && typeof this.client.botMemory.scanServer === 'function') {
          await this.client.botMemory.scanServer(guild, user).catch(() => {});
        }

        const serverName = guild.name;
        const icon = (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined;

        // Build comprehensive luxury rules embed
        const rulesEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `${serverName} • Official Guidelines`, iconURL: icon })
          .setTitle(`📜 Community Rules & Code of Conduct`)
          .setDescription(
            `Welcome to **${serverName}**! By participating in this server, all members agree to adhere to our community guidelines.\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .addFields(
            {
              name: '1️⃣ Respect & Professional Conduct',
              value: 'Treat every creator, editor, and client with respect. Harassment, hate speech, discrimination, toxicity, and personal attacks will result in an immediate ban.'
            },
            {
              name: '2️⃣ Zero Tolerance for Phishing & Malicious Content',
              value: 'Never post unverified executable files (`.exe`, `.scr`, `.bat`), fake Nitro links, or phishing domains. Suspicious links are instantly trapped by Autonomous Sentinel.'
            },
            {
              name: '3️⃣ Media & Showcase Guidelines',
              value: 'Keep video edits, VFX reels, and graphics in dedicated showcase channels. Do not spam links or media in general discussions without context.'
            },
            {
              name: '4️⃣ Hiring & Freelance Transparency',
              value: 'All commission offers and hiring posts must state a verifiable budget, turnaround time, and payment terms. Free work requests are strictly prohibited in paid channels.'
            },
            {
              name: '5️⃣ No Unsolicited Advertising or DM Promotion',
              value: 'Do not mass-DM server members with unsolicited invites, services, or self-promotion. Unsolicited advertisement DMs will be reported and banned.'
            },
            {
              name: '6️⃣ Staff Direction & Discord ToS',
              value: 'Follow instructions from server staff and moderators. All activities must comply with [Discord Community Guidelines](https://discord.com/guidelines) and [Terms of Service](https://discord.com/terms).'
            }
          )
          .setFooter({ text: `${serverName} • Rules are enforced 24/7 by EditX Autonomous Sentinel` })
          .setTimestamp();

        // Update database rules
        const rulesText =
          '1. Respect & Professional Conduct\n' +
          '2. Zero Tolerance for Phishing & Malicious Content\n' +
          '3. Media & Showcase Guidelines in dedicated channels\n' +
          '4. Hiring & Freelance Transparency (Budget required)\n' +
          '5. No Unsolicited Advertising or DM Promotion\n' +
          '6. Staff Direction & Discord Terms of Service Compliance';

        this.secDb.set(`rules_${guild.id}`, rulesText);

        // Also sync to bot memory directives
        if (this.client.botMemory && typeof this.client.botMemory.syncDirectives === 'function') {
          await this.client.botMemory.syncDirectives(guild).catch(() => {});
        }

        // Post to rules channel
        await targetChan.send({ embeds: [rulesEmbed] });

        await interaction.editReply({
          content: `✅ **Server Rules Successfully Published & Synchronized!**\n` +
            `• Posted to: <#${targetChan.id}>\n` +
            `• Synchronized with: EditX AI Memory & Sentinel AutoMod`
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

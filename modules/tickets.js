const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  SlashCommandBuilder,
  AttachmentBuilder
} = require('discord.js');

class TicketsModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.tickets;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('ticket').setDescription('Manage support tickets and deploy portals')
        .addSubcommand(s => s.setName('setup').setDescription('Deploy interactive multi-category support ticket portal')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to deploy ticket portal (defaults to current)')))
        .addSubcommand(s => s.setName('add').setDescription('Add a user to the ticket')
          .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove a user from the ticket')
          .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
        .addSubcommand(s => s.setName('rename').setDescription('Rename this ticket channel')
          .addStringOption(o => o.setName('name').setDescription('New ticket channel name').setRequired(true)))
        .addSubcommand(s => s.setName('transcript').setDescription('Generate and receive a transcript of this ticket channel'))
        .addSubcommand(s => s.setName('close').setDescription('Close and archive this ticket channel'))
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    const { commandName, options, channel, guild, user } = interaction;

    if (commandName === 'ticket') {
      const sub = options.getSubcommand();

      if (sub === 'setup') {
        const isStaff = interaction.member.permissions?.has(PermissionFlagsBits.Administrator) || interaction.member.permissions?.has(PermissionFlagsBits.ManageChannels);
        if (!isStaff) return interaction.reply({ content: '❌ You need `Manage Channels` permission to deploy the ticket portal.', ephemeral: true });

        const targetChannel = options.getChannel('channel') || channel;

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Select a ticket department...')
            .addOptions([
              { label: 'General Inquiries', description: 'Help with server rules, roles, and questions', value: 'general', emoji: '💬' },
              { label: 'Player & Staff Report', description: 'Report a rule violator or abusive behavior', value: 'report', emoji: '🚨' },
              { label: 'Billing & Rewards', description: 'Assistance with store purchases or perks', value: 'billing', emoji: '💳' },
              { label: 'Technical Support', description: 'Assistance with bots, permissions, or system issues', value: 'tech', emoji: '🛠️' }
            ])
        );

        const embed = new EmbedBuilder().setColor(0x2B2D31)
          .setTitle('🎫・Concierge & Support Dispatch')
          .setDescription(
            `Welcome to the **${guild.name}** Support Portal.\n` +
            `Select an authorized department below to initiate a private inquiry ticket.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💬 **General Inquiries** — Community questions, roles, and partnership\n` +
            `🚨 **Player & Staff Report** — Report policy violations or member disputes\n` +
            `💳 **Billing & Perks** — Store purchases, commissions, and VIP rewards\n` +
            `🛠️ **Technical Support** — System permissions, bot assistance, and server issues\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔒 *All communications are confidential between you and the staff team.*`
          )
          .setFooter({
            text: `${guild.name} Concierge Dispatch • Rapid Staff Response`,
            iconURL: (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
          });

        if (guild.iconURL && typeof guild.iconURL === 'function') {
          const icon = guild.iconURL({ dynamic: true, size: 128 });
          if (icon) embed.setThumbnail(icon);
        }

        await targetChannel.send({ embeds: [embed], components: [selectMenu] });
        return interaction.reply({ content: `✅ Luxury support portal deployed to <#${targetChannel.id}>.`, ephemeral: true });
      }

      const ticketInfo = this.db.get(channel.id);
      if (!ticketInfo) {
        return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', ephemeral: true });
      }

      if (sub === 'add') {
        const targetUser = options.getUser('user');
        await channel.permissionOverwrites.edit(targetUser.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        });
        return interaction.reply(`✅ Added <@${targetUser.id}> to the ticket.`);
      }

      if (sub === 'remove') {
        const targetUser = options.getUser('user');
        await channel.permissionOverwrites.delete(targetUser.id);
        return interaction.reply(`✅ Removed <@${targetUser.id}> from the ticket.`);
      }

      if (sub === 'rename') {
        const newName = options.getString('name').toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 32);
        await channel.setName(newName);
        return interaction.reply(`✅ Renamed ticket channel to \`#${newName}\`.`);
      }

      if (sub === 'transcript') {
        await interaction.deferReply();
        const transcriptBuf = await this.generateTranscript(channel, ticketInfo);
        const file = new AttachmentBuilder(transcriptBuf, { name: `transcript-${channel.name}.html` });
        return interaction.editReply({ content: '📄 Ticket transcript generated successfully:', files: [file] });
      }

      if (sub === 'close') {
        return this.initiateClose(interaction);
      }
    }

    return false;
  }

  async handleInteraction(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
      const category = interaction.values[0];
      await interaction.deferReply({ ephemeral: true });

      const sanitized = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
      const cleanName = sanitized || interaction.user.id.slice(0, 6);
      const channelName = `ticket-${category}-${cleanName}`;

      // Check existing open ticket for user in this category
      const existing = this.db.values().find(t => t.guildId === interaction.guild.id && t.openerId === interaction.user.id);
      if (existing && interaction.guild.channels.cache.has(existing.channelId)) {
        return interaction.editReply(`❌ You already have an active open ticket in <#${existing.channelId}>.`);
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply('❌ Bot lacks the `Manage Channels` permission.');
      }

      try {
        const ticketChan = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
            { id: this.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
          ]
        });

        this.db.set(ticketChan.id, {
          channelId: ticketChan.id,
          openerId: interaction.user.id,
          guildId: interaction.guild.id,
          category,
          createdAt: Date.now()
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim Ticket').setEmoji('🙋‍♂️').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        );

        const welcomeEmbed = new EmbedBuilder().setColor(0x2B2D31)
          .setTitle(`🎫・SUPPORT CASE // ${category.toUpperCase()}`)
          .setDescription(
            `Welcome <@${interaction.user.id}>! Your private inquiry ticket has been opened.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `▸ 👤 **Client**: <@${interaction.user.id}>\n` +
            `▸ 🏢 **Department**: \`${category.toUpperCase()}\`\n` +
            `▸ ⏳ **Status**: \`Awaiting Staff Assignment\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Please share relevant details, order IDs, or screenshots below. An authorized staff member will assist you shortly.*`
          )
          .setFooter({
            text: `${interaction.guild.name} Support Dispatch`,
            iconURL: (interaction.guild.iconURL && typeof interaction.guild.iconURL === 'function') ? interaction.guild.iconURL({ dynamic: true }) : undefined
          })
          .setTimestamp();

        await ticketChan.send({ content: `<@${interaction.user.id}>`, embeds: [welcomeEmbed], components: [row] });
        return interaction.editReply(`✅ Ticket channel created: <#${ticketChan.id}>`);
      } catch (err) {
        return interaction.editReply(`❌ Error creating ticket: ${err.message}`);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_claim') {
        const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);
        if (!isStaff) return interaction.reply({ content: '❌ Only staff members can claim tickets.', ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_claim').setLabel(`Claimed by ${interaction.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
        );

        await interaction.update({ components: [row] });
        return interaction.channel.send(`📌 **Ticket claimed by <@${interaction.user.id}>**`);
      }

      if (interaction.customId === 'ticket_transcript') {
        const ticketInfo = this.db.get(interaction.channel.id);
        await interaction.deferReply();
        const transcriptBuf = await this.generateTranscript(interaction.channel, ticketInfo);
        const file = new AttachmentBuilder(transcriptBuf, { name: `transcript-${interaction.channel.name}.html` });
        return interaction.editReply({ content: '📄 Ticket transcript generated:', files: [file] });
      }

      if (interaction.customId === 'ticket_close') {
        return this.initiateClose(interaction);
      }
    }

    return false;
  }

  async generateTranscript(channel, ticketInfo) {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => new Map());
    const sorted = Array.from(messages.values()).reverse();

    const title = `Transcript for #${channel.name}`;
    const dateStr = new Date().toUTCString();

    const htmlRows = sorted.map(m => {
      const time = m.createdAt.toLocaleTimeString();
      const author = m.author ? m.author.tag : 'Unknown';
      const content = m.cleanContent ? m.cleanContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
      const attachments = m.attachments.map(a => `<div style="margin-top:4px;"><a href="${a.url}" target="_blank" style="color:#5865F2;">📎 Attachment: ${a.name}</a></div>`).join('');
      const embeds = m.embeds.map(e => `<div style="border-left:4px solid #5865F2; padding:4px 8px; margin-top:4px; background:#2b2d31;"><strong>${e.title || ''}</strong><p>${e.description || ''}</p></div>`).join('');

      return `
        <div style="margin-bottom: 12px; padding: 8px; background: #1e1f22; border-radius: 6px;">
          <div style="font-size: 13px; color: #94a3b8; margin-bottom: 4px;">
            <strong style="color: #ffffff; font-size: 14px;">${author}</strong> <span style="font-size:11px; margin-left:8px;">${time}</span>
          </div>
          <div style="color: #dcddde; font-size: 14px; white-space: pre-wrap;">${content}</div>
          ${attachments}
          ${embeds}
        </div>
      `;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { background: #111214; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 24px; }
    .header { border-bottom: 1px solid #2b2d31; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 22px; color: #5865F2; }
    .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <p>Server: ${channel.guild.name} | Exported on: ${dateStr}</p>
    ${ticketInfo ? `<p>Opener ID: ${ticketInfo.openerId} | Department: ${ticketInfo.category}</p>` : ''}
  </div>
  ${htmlRows}
</body>
</html>`;

    return Buffer.from(html, 'utf-8');
  }

  async initiateClose(interaction) {
    const ticketInfo = this.db.get(interaction.channel.id);
    const isOpener = ticketInfo ? ticketInfo.openerId === interaction.user.id : false;
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels);

    if (ticketInfo && !isOpener && !isStaff) {
      return interaction.reply({ content: '❌ Only the ticket creator or server staff can close this ticket.', ephemeral: true });
    }

    await interaction.reply('🔒 Generating transcript and closing ticket in 5 seconds...');

    try {
      const buffer = await this.generateTranscript(interaction.channel, ticketInfo);
      const targetUserId = ticketInfo ? ticketInfo.openerId : interaction.user.id;
      const opener = await this.client.users.fetch(targetUserId).catch(() => null);

      if (opener) {
        const embed = new EmbedBuilder().setColor(0xED4245)
          .setTitle(`🔒 Support Ticket Closed: #${interaction.channel.name}`)
          .setDescription(`Your support ticket in **${interaction.guild.name}** has been resolved and closed.`)
          .addFields(
            { name: 'Closed By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
            { name: 'Department', value: `\`${ticketInfo?.category || 'General'}\``, inline: true }
          )
          .setTimestamp();

        await opener.send({
          embeds: [embed],
          files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.html` }]
        }).catch(() => {});
      }
    } catch (e) {}

    setTimeout(async () => {
      try {
        await interaction.channel.delete();
        this.db.delete(interaction.channel.id);
      } catch (err) {
        console.error('[TICKET DELETE FAILED]', err);
      }
    }, 5000);
  }
}

module.exports = TicketsModule;

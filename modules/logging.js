const { EmbedBuilder, Events, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

class LoggingModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.config;

    this.registerEvents();
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('setlogchannel').setDescription('Configure audit logging channels and category routing')
        .addChannelOption(o => o.setName('channel').setDescription('The channel where audit logs will be posted').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addStringOption(o => o.setName('category').setDescription('Log event category (default: All Logs)')
          .addChoices(
            { name: '🌐 All Events (Master Log)', value: 'all' },
            { name: '🔨 Moderation Logs (Bans/Unbans)', value: 'mod' },
            { name: '💬 Message Logs (Edits/Deletes/Ghostpings)', value: 'messages' },
            { name: '👤 Member Logs (Joins/Leaves/Roles/Nicknames)', value: 'members' },
            { name: '🎙️ Voice Logs (Joins/Leaves/Moves)', value: 'voice' },
            { name: '📁 Server Logs (Channel & Role Changes)', value: 'server' }
          ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName === 'setlogchannel') {
      const channel = interaction.options.getChannel('channel');
      const category = interaction.options.getString('category') || 'all';
      const guildId = interaction.guild.id;
      const config = this.db.get(guildId) || {};

      config.logChannels = config.logChannels || {};
      if (category === 'all') {
        config.logChannelId = channel.id;
        config.logChannels.all = channel.id;
      } else {
        config.logChannels[category] = channel.id;
      }

      this.db.set(guildId, config);
      return interaction.reply({ content: `✅ Log category **${category.toUpperCase()}** configured to <#${channel.id}>.`, ephemeral: true });
    }
    return false;
  }

  async getLogChannel(guild, category = 'all') {
    if (!guild) return null;
    const config = this.db.get(guild.id) || {};
    const logChannels = config.logChannels || {};

    let targetId = logChannels[category] || config.logChannelId;
    if (!targetId && guild.channels?.cache) {
      const fallback = guild.channels.cache.find(c =>
        c.type === 0 && (c.name === 'modlogs' || c.name === 'mod-logs' || c.name === 'logs' || c.name.includes('modlog'))
      );
      if (fallback) {
        targetId = fallback.id;
        config.logChannelId = targetId;
        this.db.set(guild.id, config);
      }
    }
    if (!targetId) return null;

    let channel = guild.channels.cache.get(targetId);
    if (!channel) {
      channel = await guild.channels.fetch(targetId).catch(() => null);
    }
    return channel;
  }

  registerEvents() {
    // 1. Message Delete & Update
    this.client.on(Events.MessageDelete, this.handleMessageDelete.bind(this));
    this.client.on(Events.MessageUpdate, this.handleMessageUpdate.bind(this));

    // 2. Member Update (Nicknames & Roles)
    this.client.on(Events.GuildMemberUpdate, this.handleMemberUpdate.bind(this));

    // 3. Member Join & Leave
    this.client.on(Events.GuildMemberAdd, this.handleMemberAdd.bind(this));
    this.client.on(Events.GuildMemberRemove, this.handleMemberRemove.bind(this));

    // 4. Voice State Updates
    this.client.on(Events.VoiceStateUpdate, this.handleVoiceStateUpdate.bind(this));

    // 5. Channel Create & Delete
    this.client.on(Events.ChannelCreate, this.handleChannelCreate.bind(this));
    this.client.on(Events.ChannelDelete, this.handleChannelDelete.bind(this));

    // 6. Role Create & Delete
    this.client.on(Events.GuildRoleCreate, this.handleRoleCreate.bind(this));
    this.client.on(Events.GuildRoleDelete, this.handleRoleDelete.bind(this));

    // 7. Guild Ban Add & Remove
    this.client.on(Events.GuildBanAdd, this.handleBanAdd.bind(this));
    this.client.on(Events.GuildBanRemove, this.handleBanRemove.bind(this));
  }

  async handleMessageDelete(message) {
    if (!message.guild || message.author?.bot) return;
    const logChannel = await this.getLogChannel(message.guild, 'messages');
    if (!logChannel) return;

    const authorTag = message.author ? message.author.tag : 'Unknown / Uncached Member';
    const authorAvatar = message.author ? message.author.displayAvatarURL() : null;
    const authorMention = message.author ? `<@${message.author.id}>` : 'Unknown';

    const hasMentions = (message.mentions.users.size > 0 || message.mentions.roles.size > 0) && (Date.now() - message.createdTimestamp < 3 * 60 * 1000);
    const mentionedUsers = message.mentions.users.map(u => `<@${u.id}>`).join(' ');
    const mentionedRoles = message.mentions.roles.map(r => `<@&${r.id}>`).join(' ');

    const embed = new EmbedBuilder()
      .setColor(hasMentions ? 0xFF0000 : 0xED4245)
      .setTitle(hasMentions ? '👻 Ghost Ping / Deleted Mention' : '🗑️ Message Deleted')
      .setAuthor({ name: authorTag, iconURL: authorAvatar })
      .setDescription(`**Message by ${authorMention} deleted in <#${message.channel.id}>**\n${message.content || '*[No text content / embed or attachment]*'}`)
      .setTimestamp();

    if (hasMentions) {
      if (mentionedUsers) embed.addFields({ name: 'Mentioned Users', value: mentionedUsers, inline: true });
      if (mentionedRoles) embed.addFields({ name: 'Mentioned Roles', value: mentionedRoles, inline: true });
    }

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMessageUpdate(oldMessage, newMessage) {
    if (!oldMessage.guild || oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const logChannel = await this.getLogChannel(oldMessage.guild, 'messages');
    if (!logChannel) return;

    const authorTag = oldMessage.author ? oldMessage.author.tag : 'Unknown Member';
    const authorAvatar = oldMessage.author ? oldMessage.author.displayAvatarURL() : null;

    const embed = new EmbedBuilder().setColor(0xFEE75C)
      .setTitle('✏️ Message Edited')
      .setAuthor({ name: authorTag, iconURL: authorAvatar })
      .setDescription(`**Message edited in <#${oldMessage.channel.id}>** [Jump to Message](${newMessage.url})`)
      .addFields(
        { name: 'Before', value: (oldMessage.content || '*[No content]*').slice(0, 1024), inline: false },
        { name: 'After', value: (newMessage.content || '*[No content]*').slice(0, 1024), inline: false }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberUpdate(oldMember, newMember) {
    const logChannel = await this.getLogChannel(newMember.guild, 'members');
    if (!logChannel) return;

    // Nickname Change
    if (oldMember.nickname !== newMember.nickname) {
      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('👤 Nickname Changed')
        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
        .setDescription(`**Before:** \`${oldMember.nickname || oldMember.user.username}\`\n**After:** \`${newMember.nickname || newMember.user.username}\``)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // Role Changes
    const oldRoles = oldMember.roles.cache.map(r => r.id);
    const newRoles = newMember.roles.cache.map(r => r.id);
    const addedRoles = newRoles.filter(r => !oldRoles.includes(r));
    const removedRoles = oldRoles.filter(r => !newRoles.includes(r));

    if (addedRoles.length > 0) {
      const embed = new EmbedBuilder().setColor(0x57F287)
        .setTitle('🎭 Roles Added')
        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
        .setDescription(`<@${newMember.id}> was granted:\n${addedRoles.map(r => `<@&${r}>`).join(', ')}`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }

    if (removedRoles.length > 0) {
      const embed = new EmbedBuilder().setColor(0xED4245)
        .setTitle('🎭 Roles Removed')
        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
        .setDescription(`<@${newMember.id}> was removed from:\n${removedRoles.map(r => `<@&${r}>`).join(', ')}`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleMemberAdd(member) {
    const logChannel = await this.getLogChannel(member.guild, 'members');
    if (!logChannel) return;

    const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / (86400 * 1000));
    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle('📥 Member Joined')
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
      .setDescription(`<@${member.id}> joined the server.`)
      .addFields(
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${ageDays}d ago)`, inline: true },
        { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberRemove(member) {
    const logChannel = await this.getLogChannel(member.guild, 'members');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0xED4245)
      .setTitle('📤 Member Left')
      .setAuthor({ name: member.user?.tag || member.displayName, iconURL: member.user?.displayAvatarURL?.() })
      .setDescription(`<@${member.id}> (${member.user?.tag || member.id}) left the server.`)
      .addFields({ name: 'Remaining Members', value: `${member.guild.memberCount}`, inline: true })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const logChannel = await this.getLogChannel(guild, 'voice');
    if (!logChannel) return;

    const member = newState.member || oldState.member;
    if (!member) return;

    if (!oldState.channelId && newState.channelId) {
      const embed = new EmbedBuilder().setColor(0x57F287)
        .setTitle('🎙️ Voice Channel Joined')
        .setDescription(`<@${member.id}> joined <#${newState.channelId}>`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } else if (oldState.channelId && !newState.channelId) {
      const embed = new EmbedBuilder().setColor(0xED4245)
        .setTitle('🎙️ Voice Channel Left')
        .setDescription(`<@${member.id}> disconnected from <#${oldState.channelId}>`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('🎙️ Voice Channel Switched')
        .setDescription(`<@${member.id}> moved from <#${oldState.channelId}> ➔ <#${newState.channelId}>`)
        .setTimestamp();
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleChannelCreate(channel) {
    const logChannel = await this.getLogChannel(channel.guild, 'server');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle('📁 Channel Created')
      .setDescription(`Channel **#${channel.name}** (<#${channel.id}>) was created.`)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleChannelDelete(channel) {
    const logChannel = await this.getLogChannel(channel.guild, 'server');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0xED4245)
      .setTitle('📁 Channel Deleted')
      .setDescription(`Channel **#${channel.name}** (\`${channel.id}\`) was deleted.`)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleRoleCreate(role) {
    const logChannel = await this.getLogChannel(role.guild, 'server');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle('🛡️ Role Created')
      .setDescription(`Role <@&${role.id}> (\`${role.name}\`) was created.`)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleRoleDelete(role) {
    const logChannel = await this.getLogChannel(role.guild, 'server');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0xED4245)
      .setTitle('🛡️ Role Deleted')
      .setDescription(`Role **@${role.name}** (\`${role.id}\`) was deleted.`)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleBanAdd(ban) {
    const logChannel = await this.getLogChannel(ban.guild, 'mod');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0xED4245)
      .setTitle('🔨 Member Banned')
      .setDescription(`<@${ban.user.id}> (${ban.user.tag}) was banned.`)
      .addFields({ name: 'Reason', value: ban.reason || 'No reason provided' })
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleBanRemove(ban) {
    const logChannel = await this.getLogChannel(ban.guild, 'mod');
    if (!logChannel) return;

    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle('🔓 Member Unbanned')
      .setDescription(`<@${ban.user.id}> (${ban.user.tag}) was unbanned.`)
      .setTimestamp();
    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = LoggingModule;

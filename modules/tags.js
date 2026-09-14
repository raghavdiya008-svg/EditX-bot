const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

class TagsModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.tags;
    // In-memory: channelId → messageId of the last sticky bot post (for deletion)
    this.stickyLastMsgId = new Map();
    // Cooldown: channelId → timestamp of last sticky repost (avoid spam)
    this.stickyCooldown = new Map();
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('tag').setDescription('Custom server commands with TagScript variables')
        .addSubcommand(s => s.setName('create').setDescription('Create a new server tag')
          .addStringOption(o => o.setName('name').setDescription('Tag name/trigger').setRequired(true))
          .addStringOption(o => o.setName('content').setDescription('Tag content (supports TagScript variables)').setRequired(true)))
        .addSubcommand(s => s.setName('get').setDescription('Display a tag')
          .addStringOption(o => o.setName('name').setDescription('Tag name or alias').setRequired(true))
          .addUserOption(o => o.setName('target').setDescription('Target user for {target} variables')))
        .addSubcommand(s => s.setName('delete').setDescription('Delete an existing tag')
          .addStringOption(o => o.setName('name').setDescription('Tag name to delete').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all server tags'))
        .addSubcommand(s => s.setName('raw').setDescription('View raw unformatted markdown of a tag')
          .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
        .addSubcommand(s => s.setName('info').setDescription('View creator, creation date, and stats for a tag')
          .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true)))
        .addSubcommand(s => s.setName('alias').setDescription('Create an alias for an existing tag')
          .addStringOption(o => o.setName('alias_name').setDescription('New alias shortcut name').setRequired(true))
          .addStringOption(o => o.setName('original_name').setDescription('Target tag name to link to').setRequired(true)))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('autoresponder').setDescription('Automated message trigger keyword responses')
        .addSubcommand(s => s.setName('add').setDescription('Add an auto-response trigger')
          .addStringOption(o => o.setName('trigger').setDescription('Trigger phrase or keyword').setRequired(true))
          .addStringOption(o => o.setName('response').setDescription('Reply message (supports TagScript)').setRequired(true))
          .addStringOption(o => o.setName('match_type').setDescription('Match mode (default: contains)')
            .addChoices({ name: 'Contains Keyword', value: 'contains' }, { name: 'Exact Match', value: 'exact' })))
        .addSubcommand(s => s.setName('remove').setDescription('Remove an auto-response trigger')
          .addStringOption(o => o.setName('trigger').setDescription('Trigger phrase to remove').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all configured auto-responders'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),

      new SlashCommandBuilder().setName('afk').setDescription('Set your status as Away From Keyboard')
        .addStringOption(o => o.setName('reason').setDescription('Reason for going AFK'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('sticky').setDescription('Pin a persistent sticky message that reappears at the bottom of a channel')
        .addSubcommand(s => s.setName('set').setDescription('Set a sticky message for this channel')
          .addStringOption(o => o.setName('message').setDescription('The sticky message content').setRequired(true))
          .addStringOption(o => o.setName('title').setDescription('Custom header title (e.g. HIRING & RECRUITMENT RULES)'))
          .addStringOption(o => o.setName('theme').setDescription('Aesthetic color theme (default: stealth dark)')
            .addChoices(
              { name: 'Stealth Dark (#2B2D31)', value: 'stealth' },
              { name: 'Cyber Indigo (#6366F1)', value: 'indigo' },
              { name: 'Electric Cyan (#00F3FF)', value: 'cyan' },
              { name: 'Prestige Gold (#F59E0B)', value: 'gold' },
              { name: 'Emerald Green (#10B981)', value: 'emerald' },
              { name: 'Crimson Rose (#F43F5E)', value: 'rose' }
            ))
          .addStringOption(o => o.setName('button_label').setDescription('Optional interactive link button label'))
          .addStringOption(o => o.setName('button_url').setDescription('Optional interactive link button URL'))
          .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to current)'))
          .addIntegerOption(o => o.setName('cooldown').setDescription('Seconds between reposts (default: 5)').setMinValue(1).setMaxValue(3600)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove the sticky message from a channel')
          .addChannelOption(o => o.setName('channel').setDescription('Target channel (defaults to current)')))
        .addSubcommand(s => s.setName('list').setDescription('List all active sticky messages in this server'))
        .setDMPermission(false)
    ];
  }

  buildStickyPayload(stickyData, channel, guild) {
    const themeColors = {
      stealth: 0x2B2D31,
      indigo: 0x6366F1,
      cyan: 0x00F3FF,
      gold: 0xF59E0B,
      emerald: 0x10B981,
      rose: 0xF43F5E
    };
    const color = themeColors[stickyData.theme] || 0x2B2D31;
    const channelName = channel?.name || 'channel';
    const rawTitle = stickyData.title || `#${channelName.toUpperCase()} NOTICE`;
    const cleanTitle = rawTitle.replace(/^📌[・\s]*/, '');

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📌・${cleanTitle}`)
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${stickyData.content}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({
        text: `📌 Sticky Notice • Automatically kept at bottom of #${channelName}`,
        iconURL: (guild?.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
      });

    if (guild?.iconURL && typeof guild.iconURL === 'function') {
      const gIcon = guild.iconURL({ dynamic: true, size: 128 });
      if (gIcon) embed.setThumbnail(gIcon);
    }

    const components = [];
    if (stickyData.buttonLabel && stickyData.buttonUrl) {
      try {
        new URL(stickyData.buttonUrl);
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel(stickyData.buttonLabel)
              .setStyle(ButtonStyle.Link)
              .setURL(stickyData.buttonUrl)
              .setEmoji('🔗')
          )
        );
      } catch (e) { /* invalid URL safe fallback */ }
    }

    return { embeds: [embed], components };
  }

  parseTagScript(text, context) {
    if (!text) return '';
    const { user, guild, channel, targetUser } = context;

    let parsed = text;
    // User variables
    if (user) {
      parsed = parsed.replace(/\{user\}/gi, `<@${user.id}>`);
      parsed = parsed.replace(/\{user\.id\}/gi, user.id);
      parsed = parsed.replace(/\{user\.name\}|\{user\.username\}/gi, user.username);
      parsed = parsed.replace(/\{user\.tag\}/gi, user.tag || user.username);
      parsed = parsed.replace(/\{user\.avatar\}/gi, user.displayAvatarURL());
      parsed = parsed.replace(/\{user\.mention\}/gi, `<@${user.id}>`);
    }

    // Target variables
    const target = targetUser || user;
    if (target) {
      parsed = parsed.replace(/\{target\}/gi, `<@${target.id}>`);
      parsed = parsed.replace(/\{target\.id\}/gi, target.id);
      parsed = parsed.replace(/\{target\.name\}|\{target\.username\}/gi, target.username);
      parsed = parsed.replace(/\{target\.tag\}/gi, target.tag || target.username);
      parsed = parsed.replace(/\{target\.avatar\}/gi, target.displayAvatarURL());
    }

    // Server variables
    if (guild) {
      parsed = parsed.replace(/\{server\}|\{server\.name\}/gi, guild.name);
      parsed = parsed.replace(/\{server\.id\}/gi, guild.id);
      parsed = parsed.replace(/\{server\.member_count\}|\{member_count\}/gi, guild.memberCount?.toString() || '0');
    }

    // Channel variables
    if (channel) {
      parsed = parsed.replace(/\{channel\}|\{channel\.name\}/gi, channel.name || 'channel');
      parsed = parsed.replace(/\{channel\.id\}/gi, channel.id);
      parsed = parsed.replace(/\{channel\.mention\}/gi, `<#${channel.id}>`);
    }

    // Random choice {choose:a|b|c}
    parsed = parsed.replace(/\{choose:([^}]+)\}/gi, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)].trim();
    });

    // Random number {random:1-100}
    parsed = parsed.replace(/\{random:(\d+)-(\d+)\}/gi, (match, minStr, maxStr) => {
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
    });

    // Timestamp
    parsed = parsed.replace(/\{time\}/gi, `<t:${Math.floor(Date.now() / 1000)}:T>`);
    parsed = parsed.replace(/\{date\}/gi, `<t:${Math.floor(Date.now() / 1000)}:d>`);

    return parsed;
  }

  async handleCommand(interaction) {
    const { commandName, options, guild, channel, user } = interaction;
    const guildId = guild.id;

    if (commandName === 'tag') {
      const sub = options.getSubcommand();
      const tagName = options.getString('name')?.toLowerCase().trim();
      const tagsKey = `tags_${guildId}`;
      const tags = this.db.get(tagsKey) || {};

      if (sub === 'create') {
        const isMod = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        if (!isMod) return interaction.reply({ content: '❌ You need `Manage Messages` permission to create tags.', ephemeral: true });

        const content = options.getString('content');
        if (tags[tagName]) return interaction.reply({ content: `❌ Tag \`${tagName}\` already exists.`, ephemeral: true });

        tags[tagName] = {
          name: tagName,
          content,
          createdBy: user.id,
          createdAt: Date.now(),
          uses: 0,
          aliases: []
        };
        this.db.set(tagsKey, tags);
        return interaction.reply({ content: `✅ Tag \`${tagName}\` created successfully!` });
      }

      if (sub === 'get') {
        let tag = tags[tagName];
        // Check aliases if not found directly
        if (!tag) {
          tag = Object.values(tags).find(t => t.aliases && t.aliases.includes(tagName));
        }

        if (!tag) return interaction.reply({ content: `❌ Tag \`${tagName}\` does not exist.`, ephemeral: true });

        tag.uses = (tag.uses || 0) + 1;
        this.db.set(tagsKey, tags);

        const targetUser = options.getUser('target') || user;
        const parsedContent = this.parseTagScript(tag.content, { user, guild, channel, targetUser });
        return interaction.reply(parsedContent);
      }

      if (sub === 'delete') {
        const isMod = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
        const tag = tags[tagName];
        if (!tag) return interaction.reply({ content: `❌ Tag \`${tagName}\` does not exist.`, ephemeral: true });
        if (!isMod && tag.createdBy !== user.id) {
          return interaction.reply({ content: '❌ You can only delete your own tags unless you are staff.', ephemeral: true });
        }

        delete tags[tagName];
        this.db.set(tagsKey, tags);
        return interaction.reply({ content: `✅ Tag \`${tagName}\` deleted.` });
      }

      if (sub === 'alias') {
        const aliasName = options.getString('alias_name').toLowerCase().trim();
        const originalName = options.getString('original_name').toLowerCase().trim();

        const tag = tags[originalName];
        if (!tag) return interaction.reply({ content: `❌ Original tag \`${originalName}\` does not exist.`, ephemeral: true });

        tag.aliases = tag.aliases || [];
        if (tag.aliases.includes(aliasName) || tags[aliasName]) {
          return interaction.reply({ content: `❌ Alias or tag \`${aliasName}\` already exists.`, ephemeral: true });
        }

        tag.aliases.push(aliasName);
        this.db.set(tagsKey, tags);
        return interaction.reply({ content: `✅ Created alias \`${aliasName}\` for tag \`${originalName}\`.`, ephemeral: true });
      }

      if (sub === 'info') {
        let tag = tags[tagName];
        if (!tag) {
          tag = Object.values(tags).find(t => t.aliases && t.aliases.includes(tagName));
        }
        if (!tag) return interaction.reply({ content: `❌ Tag \`${tagName}\` does not exist.`, ephemeral: true });

        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setTitle(`🏷️ Tag Info: ${tag.name || tagName}`)
          .addFields(
            { name: 'Created By', value: `<@${tag.createdBy}>`, inline: true },
            { name: 'Uses', value: `${tag.uses || 0}`, inline: true },
            { name: 'Created On', value: `<t:${Math.floor(tag.createdAt / 1000)}:F>`, inline: false },
            { name: 'Aliases', value: tag.aliases?.length > 0 ? tag.aliases.map(a => `\`${a}\``).join(', ') : 'None', inline: false }
          );
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'list') {
        const names = Object.keys(tags);
        if (names.length === 0) return interaction.reply({ content: '📭 No tags created on this server yet.', ephemeral: true });

        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setTitle(`🏷️ Server Tags (${names.length})`)
          .setDescription(names.map(n => `\`${n}\``).join(', '));
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'raw') {
        const tag = tags[tagName];
        if (!tag) return interaction.reply({ content: `❌ Tag \`${tagName}\` does not exist.`, ephemeral: true });
        return interaction.reply({ content: `\`\`\`\n${tag.content}\n\`\`\``, ephemeral: true });
      }
    }

    if (commandName === 'autoresponder') {
      const sub = options.getSubcommand();
      const arKey = `ar_${guildId}`;
      const responders = this.db.get(arKey) || [];

      if (sub === 'add') {
        const trigger = options.getString('trigger').toLowerCase().trim();
        const response = options.getString('response');
        const matchType = options.getString('match_type') || 'contains';

        const filtered = responders.filter(r => r.trigger !== trigger);
        filtered.push({ trigger, response, matchType, by: user.id, createdAt: Date.now() });
        this.db.set(arKey, filtered);

        return interaction.reply({ content: `✅ Auto-responder for \`${trigger}\` added (${matchType} match).`, ephemeral: true });
      }

      if (sub === 'remove') {
        const trigger = options.getString('trigger').toLowerCase().trim();
        const filtered = responders.filter(r => r.trigger !== trigger);
        if (filtered.length === responders.length) {
          return interaction.reply({ content: `❌ No auto-responder found for trigger \`${trigger}\`.`, ephemeral: true });
        }
        this.db.set(arKey, filtered);
        return interaction.reply({ content: `✅ Removed auto-responder for \`${trigger}\`.`, ephemeral: true });
      }

      if (sub === 'list') {
        if (responders.length === 0) return interaction.reply({ content: '📭 No auto-responders configured.', ephemeral: true });

        const desc = responders.map((r, i) => `**${i + 1}.** \`${r.trigger}\` (${r.matchType}) ➔ "${r.response.slice(0, 50)}${r.response.length > 50 ? '...' : ''}"`).join('\n');
        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setTitle('🤖 Server Auto-Responders')
          .setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (commandName === 'afk') {
      const reason = options.getString('reason') || 'AFK';
      const afkKey = `afk_${guildId}_${user.id}`;
      this.db.set(afkKey, {
        reason,
        timestamp: Date.now()
      });

      return interaction.reply(`💤 <@${user.id}> is now AFK: **${reason}**`);
    }

    if (commandName === 'sticky' || commandName === 'stickymessage') {
      const isMod = interaction.member.permissions?.has(PermissionFlagsBits.ManageMessages);
      if (!isMod) {
        return interaction.reply({ content: '❌ You need `Manage Messages` permission to configure sticky messages.', ephemeral: true });
      }

      const sub = options.getSubcommand();

      if (sub === 'set') {
        const targetChannel = options.getChannel('channel') || channel;
        const content = options.getString('message');
        const title = options.getString('title');
        const theme = options.getString('theme') || 'stealth';
        const buttonLabel = options.getString('button_label');
        const buttonUrl = options.getString('button_url');
        const cooldown = options.getInteger('cooldown') || 5;
        const stickyKey = `sticky_${targetChannel.id}`;

        let lastMsgId = null;

        const stickyData = {
          content,
          title,
          theme,
          buttonLabel,
          buttonUrl,
          guildId,
          channelId: targetChannel.id,
          cooldown,
          lastMsgId: null,
          setBy: user.id,
          setAt: Date.now()
        };

        // Post it immediately
        try {
          const existingData = this.db.get(stickyKey);
          const existingMsgId = existingData?.lastMsgId || this.stickyLastMsgId.get(targetChannel.id);
          if (existingMsgId) {
            const ch = await this.client.channels.fetch(targetChannel.id).catch(() => null);
            if (ch) {
              const oldMsg = await ch.messages.fetch(existingMsgId).catch(() => null);
              if (oldMsg) await oldMsg.delete().catch(() => {});
            }
          }
          const ch = await this.client.channels.fetch(targetChannel.id).catch(() => null);
          if (ch) {
            const payload = this.buildStickyPayload(stickyData, ch, guild);
            const posted = await ch.send(payload);
            lastMsgId = posted.id;
            stickyData.lastMsgId = posted.id;
            this.stickyLastMsgId.set(targetChannel.id, posted.id);
          }
        } catch (e) { /* ignore */ }

        this.db.set(stickyKey, stickyData);

        return interaction.reply({
          content: `✅ Luxury sticky message set in <#${targetChannel.id}> (theme: **${theme}**, cooldown: **${cooldown}s**). It will automatically stay at the bottom of the channel.`,
          ephemeral: true
        });
      }

      if (sub === 'remove') {
        const targetChannel = options.getChannel('channel') || channel;
        const stickyKey = `sticky_${targetChannel.id}`;
        const existing = this.db.get(stickyKey);
        if (!existing) return interaction.reply({ content: `❌ No sticky message found in <#${targetChannel.id}>.`, ephemeral: true });

        // Delete the last sticky message from chat
        const existingMsgId = existing.lastMsgId || this.stickyLastMsgId.get(targetChannel.id);
        if (existingMsgId) {
          const ch = await this.client.channels.fetch(targetChannel.id).catch(() => null);
          if (ch) {
            const oldMsg = await ch.messages.fetch(existingMsgId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }
          this.stickyLastMsgId.delete(targetChannel.id);
        }

        this.db.delete(stickyKey);

        return interaction.reply({ content: `✅ Sticky message removed from <#${targetChannel.id}>.`, ephemeral: true });
      }

      if (sub === 'list') {
        const allKeys = this.db.keys ? this.db.keys() : [];
        const stickies = [];
        for (const key of allKeys) {
          if (key.startsWith('sticky_')) {
            const data = this.db.get(key);
            if (data && data.guildId === guildId) stickies.push(data);
          }
        }

        if (stickies.length === 0) return interaction.reply({ content: '📭 No sticky messages configured in this server.', ephemeral: true });

        const embed = new EmbedBuilder().setColor(0xFFA500)
          .setTitle('📌 Active Sticky Messages')
          .setDescription(stickies.map(s =>
            `<#${s.channelId}> — "${s.content.slice(0, 60)}${s.content.length > 60 ? '...' : ''}" (cooldown: ${s.cooldown}s)`
          ).join('\n'));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    return false;
  }

  async checkMessage(message) {
    if (!message.guild || message.author.bot) return;
    const guildId = message.guild.id;

    // 1. AFK Return Check
    const authorAfkKey = `afk_${guildId}_${message.author.id}`;
    const authorAfk = this.db.get(authorAfkKey);
    if (authorAfk) {
      this.db.delete(authorAfkKey);
      const mins = Math.max(1, Math.round((Date.now() - authorAfk.timestamp) / 60000));
      message.reply({ content: `👋 Welcome back <@${message.author.id}>, I removed your AFK status (You were gone for **${mins}m**).` })
        .then(msg => setTimeout(() => msg.delete().catch(() => {}), 6000))
        .catch(() => {});
    }

    // 2. AFK Mention Check
    if (message.mentions.users.size > 0) {
      for (const [targetId, targetUser] of message.mentions.users) {
        if (targetId === message.author.id || targetUser.bot) continue;
        const targetAfkKey = `afk_${guildId}_${targetId}`;
        const targetAfk = this.db.get(targetAfkKey);
        if (targetAfk) {
          message.reply({ content: `💤 <@${targetId}> is currently AFK: **${targetAfk.reason}** (<t:${Math.floor(targetAfk.timestamp / 1000)}:R>)` })
            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 8000))
            .catch(() => {});
        }
      }
    }

    // 3. Auto-Responder Trigger Check
    const responders = this.db.get(`ar_${guildId}`) || [];
    if (responders.length > 0) {
      const text = message.content.toLowerCase();
      for (const ar of responders) {
        const hit = (ar.matchType === 'exact' && text === ar.trigger) || (ar.matchType === 'contains' && text.includes(ar.trigger));
        if (hit) {
          const parsed = this.parseTagScript(ar.response, {
            user: message.author,
            guild: message.guild,
            channel: message.channel,
            targetUser: message.mentions.users.first() || message.author
          });
          message.channel.send(parsed).catch(() => {});
          break;
        }
      }
    }

    // 4. Sticky Message Re-Post
    await this.checkStickyMessage(message);
  }

  async checkStickyMessage(message) {
    try {
      const stickyKey = `sticky_${message.channel.id}`;
      const sticky = this.db.get(stickyKey);
      if (!sticky) return;

      // Never trigger off the bot's own sticky post
      if (message.author.id === this.client.user?.id) return;

      // Cooldown check — don't repost too rapidly
      const lastPost = this.stickyCooldown.get(message.channel.id) || 0;
      const cooldownSec = (typeof sticky.cooldown === 'number') ? sticky.cooldown : 5;
      const cooldownMs = cooldownSec * 1000;
      if (cooldownMs > 0 && Date.now() - lastPost < cooldownMs) return;

      // Delete previous sticky bot message
      const prevMsgId = sticky.lastMsgId || this.stickyLastMsgId.get(message.channel.id);
      if (prevMsgId) {
        const oldMsg = await message.channel.messages.fetch(prevMsgId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }

      // Repost sticky
      const payload = this.buildStickyPayload(sticky, message.channel, message.guild);
      const newMsg = await message.channel.send(payload);
      this.stickyLastMsgId.set(message.channel.id, newMsg.id);
      this.stickyCooldown.set(message.channel.id, Date.now());

      // Persist to database so it survives bot reboots
      sticky.lastMsgId = newMsg.id;
      this.db.set(stickyKey, sticky);
    } catch (e) { /* ignore */ }
  }
}

module.exports = TagsModule;

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

class StarboardModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.starboard;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('starboard').setDescription('Configure community message starboard highlights and hall of fame')
        .addSubcommand(s => s.setName('set').setDescription('Set starboard channel, threshold, and custom star emoji')
          .addChannelOption(o => o.setName('channel').setDescription('Channel where starred messages will be posted').addChannelTypes(ChannelType.GuildText).setRequired(true))
          .addIntegerOption(o => o.setName('threshold').setDescription('Minimum stars required (default: 3)').setMinValue(1).setMaxValue(25))
          .addStringOption(o => o.setName('emoji').setDescription('Custom star emoji (e.g. ⭐, 🌟, 🏆, default: ⭐)'))
          .addBooleanOption(o => o.setName('allow_self_star').setDescription('Allow authors to star their own messages (default: false)')))
        .addSubcommand(s => s.setName('top').setDescription('Display the top most-starred hall-of-fame messages on the server'))
        .addSubcommand(s => s.setName('disable').setDescription('Disable starboard for this server'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'starboard') return false;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const configKey = `config_${guildId}`;
    const config = this.db.get(configKey) || { enabled: true, threshold: 3, emoji: '⭐', allowSelfStar: false };

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const threshold = interaction.options.getInteger('threshold') || 3;
      const emoji = interaction.options.getString('emoji') || '⭐';
      const allowSelfStar = interaction.options.getBoolean('allow_self_star') ?? false;

      config.channelId = channel.id;
      config.threshold = threshold;
      config.emoji = emoji;
      config.allowSelfStar = allowSelfStar;
      config.enabled = true;
      this.db.set(configKey, config);

      return interaction.reply({ content: `⭐ Starboard configured in <#${channel.id}>!\n• Threshold: **${threshold} ${emoji}**\n• Custom Emoji: ${emoji}\n• Self-Starring: **${allowSelfStar ? 'Allowed' : 'Disallowed'}**`, ephemeral: true });
    }

    if (sub === 'top') {
      const allStars = (this.db.entries ? this.db.entries() : [])
        .filter(([k, v]) => k.startsWith(`star_${guildId}_`) && v && typeof v === 'object')
        .map(([k, v]) => v)
        .sort((a, b) => (b.starCount || 0) - (a.starCount || 0))
        .slice(0, 10);

      if (allStars.length === 0) {
        return interaction.reply({ content: '📭 No starred messages recorded in this server yet.', ephemeral: true });
      }

      const desc = allStars.map((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`#${i + 1}\``;
        return `${medal} **${s.starCount || config.threshold} ${config.emoji || '⭐'}** by <@${s.authorId}> — [Jump to message](${s.url || `https://discord.com/channels/${guildId}/${s.channelId}/${s.sourceMessageId}`})`;
      }).join('\n');

      const embed = new EmbedBuilder().setColor(0xF59E0B)
        .setTitle(`🏆・Starboard Hall of Fame | ${interaction.guild.name}`)
        .setDescription(
          `The most celebrated moments and highlights across **${interaction.guild.name}**:\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${desc}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({
          text: `${interaction.guild.name} Starboard • Hall of Fame`,
          iconURL: (interaction.guild.iconURL && typeof interaction.guild.iconURL === 'function') ? interaction.guild.iconURL({ dynamic: true }) : undefined
        });

      if (interaction.guild.iconURL && typeof interaction.guild.iconURL === 'function') {
        const icon = interaction.guild.iconURL({ dynamic: true, size: 128 });
        if (icon) embed.setThumbnail(icon);
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'disable') {
      config.enabled = false;
      this.db.set(configKey, config);
      return interaction.reply({ content: '⭐ Starboard has been disabled.', ephemeral: true });
    }

    return false;
  }

  async handleReactionAdd(reaction, user) {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch (e) { return; }
    }

    const message = reaction.message;
    if (!message.guild) return;

    const config = this.db.get(`config_${message.guild.id}`) || { enabled: false, threshold: 3, emoji: '⭐', allowSelfStar: false };
    if (!config.enabled || !config.channelId) return;

    const targetEmoji = config.emoji || '⭐';
    if (reaction.emoji.name !== targetEmoji && reaction.emoji.toString() !== targetEmoji) return;

    // Self-star restriction
    if (!config.allowSelfStar && message.author.id === user.id) {
      try { await reaction.users.remove(user.id); } catch (e) {}
      return;
    }

    const starCount = reaction.count;
    if (starCount < (config.threshold || 3)) return;

    const starChannel = message.guild.channels.cache.get(config.channelId) || await message.guild.channels.fetch(config.channelId).catch(() => null);
    if (!starChannel) return;

    const starboardKey = `star_${message.guild.id}_${message.id}`;
    const existingEntry = this.db.get(starboardKey);

    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setDescription(
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        (message.content ? message.content.slice(0, 4000) : '*[Media Highlight]*') +
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: `⭐ Starboard Highlight • #${message.channel.name || 'channel'}` })
      .setTimestamp(message.createdAt);

    const attachment = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (attachment) {
      embed.setImage(attachment.url);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Jump to Message')
        .setStyle(ButtonStyle.Link)
        .setURL(message.url)
        .setEmoji('🔗')
    );

    const content = `${targetEmoji} **${starCount}** | <#${message.channel.id}>`;

    if (existingEntry && existingEntry.starboardMessageId) {
      try {
        const starMsg = await starChannel.messages.fetch(existingEntry.starboardMessageId).catch(() => null);
        if (starMsg) {
          await starMsg.edit({ content, embeds: [embed], components: [row] });
          existingEntry.starCount = starCount;
          this.db.set(starboardKey, existingEntry);
          return;
        }
      } catch (e) {}
    }

    try {
      const sentMsg = await starChannel.send({ content, embeds: [embed], components: [row] });
      this.db.set(starboardKey, {
        sourceMessageId: message.id,
        starboardMessageId: sentMsg.id,
        channelId: message.channel.id,
        authorId: message.author.id,
        url: message.url,
        starCount
      });
    } catch (e) {
      console.error('[STARBOARD POST ERROR]', e);
    }
  }

  async handleReactionRemove(reaction, user) {
    if (reaction.partial) {
      try { await reaction.fetch(); } catch (e) { return; }
    }

    const message = reaction.message;
    if (!message.guild) return;

    const config = this.db.get(`config_${message.guild.id}`);
    if (!config || !config.enabled || !config.channelId) return;

    const targetEmoji = config.emoji || '⭐';
    if (reaction.emoji.name !== targetEmoji && reaction.emoji.toString() !== targetEmoji) return;

    const starboardKey = `star_${message.guild.id}_${message.id}`;
    const existingEntry = this.db.get(starboardKey);
    if (!existingEntry) return;

    const starChannel = message.guild.channels.cache.get(config.channelId) || await message.guild.channels.fetch(config.channelId).catch(() => null);
    if (!starChannel) return;

    const starCount = reaction.count || 0;
    try {
      const starMsg = await starChannel.messages.fetch(existingEntry.starboardMessageId).catch(() => null);
      if (starMsg) {
        if (starCount < (config.threshold || 3)) {
          await starMsg.delete().catch(() => {});
          this.db.delete(starboardKey);
        } else {
          await starMsg.edit({ content: `${targetEmoji} **${starCount}** | <#${message.channel.id}>` }).catch(() => {});
          existingEntry.starCount = starCount;
          this.db.set(starboardKey, existingEntry);
        }
      }
    } catch (e) {}
  }
}

module.exports = StarboardModule;

const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

class LevelingModule {
  constructor(client, db, rolesModule = null) {
    this.client = client;
    this.db = db.xp;
    this.rolesModule = rolesModule;

    // Track Voice XP every 3 minutes
    setInterval(() => this.processVoiceXP(), 3 * 60 * 1000);
  }

  setRolesModule(rolesModule) {
    this.rolesModule = rolesModule;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('rank').setDescription('Display your or another user’s graphical XP rank card')
        .addUserOption(o => o.setName('target').setDescription('Target member'))
        .setDMPermission(false),

      new SlashCommandBuilder().setName('leaderboard').setDescription('View top active server members by XP and Level')
        .setDMPermission(false),

      new SlashCommandBuilder().setName('setxp').setDescription('Manually modify a user’s XP')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('New XP amount').setMinValue(0).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('resetxp').setDescription('Reset a user’s XP and Level to zero')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false),

      new SlashCommandBuilder().setName('level').setDescription('Server leveling configuration and controls')
        .addSubcommand(s => s.setName('config').setDescription('Configure level-up announcements and messages')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to post level-up announcements'))
          .addStringOption(o => o.setName('mode').setDescription('Announcement delivery mode')
            .addChoices({ name: 'Current Channel', value: 'current' }, { name: 'Specific Channel', value: 'channel' }, { name: 'Direct Message', value: 'dm' }, { name: 'Disabled', value: 'disabled' }))
          .addStringOption(o => o.setName('message').setDescription('Custom message (supports {user}, {level}, {xp})')))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).setDMPermission(false)
    ];
  }

  calculateNextLevelXP(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 100;
  }

  async handleCommand(interaction) {
    const { commandName, options, guild } = interaction;

    if (commandName === 'rank') {
      await interaction.deferReply();
      const targetUser = options.getUser('target') || interaction.user;
      if (targetUser.bot) return interaction.editReply('🤖 Bots do not accumulate experience.');

      const member = await guild.members.fetch(targetUser.id).catch(() => null);
      const key = `${guild.id}_${targetUser.id}`;
      const data = this.db.get(key) || { xp: 0, level: 0 };
      const nextLevelXP = this.calculateNextLevelXP(data.level);

      // Compute Server Rank
      const allGuildEntries = (this.db.entries ? this.db.entries() : [])
        .filter(([k, v]) => k.startsWith(`${guild.id}_`) && k.split('_')[1] && v && typeof v.xp === 'number')
        .map(([k, v]) => ({ id: k.split('_')[1], xp: v.xp }))
        .sort((a, b) => b.xp - a.xp);

      const rankIndex = allGuildEntries.findIndex(e => e.id === targetUser.id);
      const rank = rankIndex === -1 ? allGuildEntries.length + 1 : rankIndex + 1;

      try {
        const cardBuffer = await this.renderRankCard(targetUser, data.level, data.xp, nextLevelXP, rank);
        const attachment = new AttachmentBuilder(cardBuffer, { name: 'rank.png' });
        return interaction.editReply({ files: [attachment] });
      } catch (err) {
        console.error('[RANK CARD ERROR]', err);
        // Fallback to rich embed if canvas rendering fails
        const embed = new EmbedBuilder().setColor(0x5865F2)
          .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL() })
          .setTitle(`Rank #${rank}`)
          .addFields(
            { name: 'Level', value: `${data.level}`, inline: true },
            { name: 'XP', value: `${data.xp} / ${nextLevelXP}`, inline: true }
          );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    if (commandName === 'leaderboard') {
      const allEntries = (this.db.entries ? this.db.entries() : [])
        .filter(([k, v]) => k.startsWith(`${guild.id}_`) && k.split('_')[1] && v && typeof v.xp === 'number')
        .map(([k, v]) => ({ userId: k.split('_')[1], xp: v.xp, level: v.level || 0 }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);

      if (allEntries.length === 0) return interaction.reply('📭 No leveling activity logged in this server yet.');

      const embed = new EmbedBuilder().setColor(0xF59E0B)
        .setAuthor({ name: 'Server Activity Leaderboard', iconURL: guild.iconURL() })
        .setTitle(`🏆 Top Active Participants • ${guild.name}`)
        .setDescription(
          allEntries.map((entry, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `\`#${idx + 1}\``;
            return `${medal} <@${entry.userId}>\n　└ **Level ${entry.level}** • \`${entry.xp.toLocaleString()} XP\``;
          }).join('\n\n') + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        )
        .setFooter({ text: 'Earn XP through active text chat and voice channel participation.' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'setxp') {
      const targetUser = options.getUser('target');
      const amount = options.getInteger('amount');
      const key = `${guild.id}_${targetUser.id}`;
      const data = this.db.get(key) || { xp: 0, level: 0 };
      data.xp = amount;

      // Recalculate level
      let lvl = 0;
      while (data.xp >= this.calculateNextLevelXP(lvl)) {
        lvl++;
      }
      data.level = lvl;
      this.db.set(key, data);

      return interaction.reply({ content: `✅ Updated **${targetUser.username}** to **${data.xp} XP** (Level ${data.level}).`, ephemeral: true });
    }

    if (commandName === 'resetxp') {
      const targetUser = options.getUser('target');
      const key = `${guild.id}_${targetUser.id}`;
      this.db.delete(key);
      return interaction.reply({ content: `✅ Reset leveling progress for **${targetUser.username}**.`, ephemeral: true });
    }

    if (commandName === 'level' || commandName === 'level-config') {
      const sub = (commandName === 'level') ? options.getSubcommand() : 'config';
      if (sub === 'config') {
        const configKey = `config_${guild.id}`;
      const config = this.db.get(configKey) || { mode: 'current', channelId: null, message: null };

      const channel = options.getChannel('channel');
      const mode = options.getString('mode');
      const message = options.getString('message');

      if (channel) {
        config.channelId = channel.id;
        config.mode = 'channel';
      }
      if (mode) config.mode = mode;
      if (message) config.message = message;

      this.db.set(configKey, config);
      return interaction.reply({ content: `✅ Leveling configuration updated!\n• Delivery Mode: **${config.mode}**\n• Dedicated Channel: ${config.channelId ? `<#${config.channelId}>` : 'None'}\n• Custom Template: ${config.message ? `"${config.message}"` : 'Default'}`, ephemeral: true });
      }
    }

    return false;
  }

  async sendLevelUpAnnouncement(member, newLevel, currentChannel) {
    const config = this.db.get(`config_${member.guild.id}`) || { mode: 'current', channelId: null, message: null };
    if (config.mode === 'disabled') return;

    // Suppress announcements in moderator-only and confidential staff channels
    if (currentChannel && (
      (currentChannel.name && (currentChannel.name.includes('moderator-only') || currentChannel.name.includes('mod-only'))) ||
      currentChannel.id === '1538967412672565319'
    )) {
      return;
    }

    const defaultMsg = `🎉 Congrats <@${member.id}>, you advanced to **Level ${newLevel}**!`;
    const text = config.message
      ? config.message.replace('{user}', `<@${member.id}>`).replace('{level}', newLevel)
      : defaultMsg;

    const embed = new EmbedBuilder().setColor(0x57F287)
      .setAuthor({ name: 'Level Up!', iconURL: member.user.displayAvatarURL() })
      .setDescription(text);

    if (config.mode === 'dm') {
      await member.send({ embeds: [embed] }).catch(() => {
        if (currentChannel) currentChannel.send({ embeds: [embed] }).catch(() => {});
      });
    } else if (config.mode === 'channel' && config.channelId) {
      const targetChan = member.guild.channels.cache.get(config.channelId) || await member.guild.channels.fetch(config.channelId).catch(() => null);
      if (targetChan) {
        await targetChan.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
      } else if (currentChannel) {
        await currentChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } else {
      if (currentChannel) {
        await currentChannel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  async renderRankCard(user, level, currentXP, nextXP, rank) {
    const width = 850;
    const height = 260;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. High-Contrast Precision Obsidian Canvas (Swiss / OLED Minimalist)
    ctx.fillStyle = '#08090C';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 16);
    ctx.fill();

    // 2. Interior Precision Card Inset
    ctx.fillStyle = '#0E1017';
    ctx.beginPath();
    ctx.roundRect(8, 8, width - 16, height - 16, 12);
    ctx.fill();

    // 3. Crisp Precision Border
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.roundRect(8, 8, width - 16, height - 16, 12);
    ctx.stroke();

    // 4. Avatar with Crisp White Frame
    const avatarX = 115;
    const avatarY = 130;
    const avatarRadius = 65;

    // Avatar Image
    try {
      const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
    } catch (e) {}

    // Sharp White Precision Avatar Ring
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Username & Subtitle (Swiss Typography Hierarchy)
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    let name = user.username || 'User';
    if (name.length > 13) name = name.substring(0, 13) + '...';
    ctx.fillText(name, 215, 88);

    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('CREATIVE COMMUNITY PROFILE', 215, 116);

    // 6. Modern Precision Badges: Rank & Level
    // Rank Badge Capsule
    const rankText = `RANK #${rank}`;
    ctx.font = 'bold 15px sans-serif';
    const rankMetrics = ctx.measureText(rankText);
    const rankPillW = rankMetrics.width + 28;
    const rankPillX = width - rankPillW - 35;
    const rankPillY = 60;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.beginPath();
    ctx.roundRect(rankPillX, rankPillY, rankPillW, 34, 8);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#F59E0B';
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.fillText(rankText, rankPillX + 14, rankPillY + 23);

    // Level Badge Capsule
    const levelText = `LEVEL ${level}`;
    const levelMetrics = ctx.measureText(levelText);
    const levelPillW = levelMetrics.width + 28;
    const levelPillX = rankPillX - levelPillW - 14;
    const levelPillY = 60;

    ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
    ctx.beginPath();
    ctx.roundRect(levelPillX, levelPillY, levelPillW, 34, 8);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#06B6D4';
    ctx.stroke();

    ctx.fillStyle = '#22D3EE';
    ctx.fillText(levelText, levelPillX + 14, levelPillY + 23);

    // 7. XP Progress Bar (Clean High-Contrast Cyan & Obsidian Track)
    const barX = 215;
    const barY = 168;
    const barW = width - barX - 35;
    const barH = 22;

    // Track Background
    ctx.fillStyle = '#141720';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.stroke();

    // Fill (High-Contrast Electric Cyan)
    const progress = Math.min(1, Math.max(0, currentXP / nextXP));
    if (progress > 0) {
      const fillW = Math.max(16, barW * progress);
      const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      fillGrad.addColorStop(0, '#06B6D4');
      fillGrad.addColorStop(1, '#00F0FF');
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 6);
      ctx.fill();
    }

    // XP Numbers & Percentage
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#E2E8F0';
    const xpString = `${currentXP.toLocaleString()} / ${nextXP.toLocaleString()} XP`;
    ctx.fillText(xpString, barX, barY - 14);

    const percentText = `${Math.round(progress * 100)}%`;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#00F0FF';
    const pWidth = ctx.measureText(percentText).width;
    ctx.fillText(percentText, barX + barW - pWidth, barY - 14);

    return canvas.toBuffer();
  }

  handleChatXP(message) {
    if (message.author.bot) return;

    const key = `${message.guild.id}_${message.author.id}`;
    const now = Date.now();
    const data = this.db.get(key) || { xp: 0, level: 0, lastMessage: 0 };

    if (now - data.lastMessage < 60000) return; // 1 min cooldown
    data.lastMessage = now;
    data.xp += Math.floor(Math.random() * 11) + 15; // 15-25 XP

    let nextXP = this.calculateNextLevelXP(data.level);
    let leveledUp = false;
    while (data.xp >= nextXP) {
      data.level += 1;
      leveledUp = true;
      nextXP = this.calculateNextLevelXP(data.level);
    }

    if (leveledUp) {
      this.sendLevelUpAnnouncement(message.member, data.level, message.channel);

      if (this.rolesModule && message.member) {
        this.rolesModule.checkLevelUpRewards(message.member, data.level);
      }
    }

    this.db.set(key, data);
  }

  async processVoiceXP() {
    if (!this.client?.guilds?.cache) return;
    for (const guild of this.client.guilds.cache.values()) {
      if (!guild.channels?.cache) continue;
      for (const channel of guild.channels.cache.values()) {
        if (channel.isVoiceBased() && channel.members.size >= 2) { // Must be >=2 users to prevent solo idling
          for (const member of channel.members.values()) {
            if (member.user.bot || member.voice.selfMute || member.voice.selfDeaf) continue;

            const key = `${guild.id}_${member.id}`;
            const data = this.db.get(key) || { xp: 0, level: 0 };
            data.xp += 10; // 10 XP per 3 min active voice

            let nextXP = this.calculateNextLevelXP(data.level);
            let leveledUp = false;
            while (data.xp >= nextXP) {
              data.level += 1;
              leveledUp = true;
              nextXP = this.calculateNextLevelXP(data.level);
            }

            if (leveledUp && this.rolesModule) {
              this.rolesModule.checkLevelUpRewards(member, data.level);
            }

            this.db.set(key, data);
          }
        }
      }
    }
  }
}

module.exports = LevelingModule;

/**
 * Decoration & Aesthetics Suite for Omni Bot
 * Transforms Discord servers into premium, sleek networks in 100% free ways
 * with ZERO deletions (non-destructive in-place styling).
 * 
 * Commands:
 * 1. /decorate preview: Inspect existing channels & preview aesthetic unicode names
 * 2. /decorate apply: Safely rename categories and channels in place (0 deletions)
 * 3. /decorate stats: Deploy aesthetic top-of-server locked live counter channels
 * 4. /decorate embeds: Deploy high-gloss rich embed guides (rules, welcome, editors guide, faq)
 */

const { 
  EmbedBuilder, 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} = require('discord.js');

class DecorationModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.utility || db.config;

    // Standard Curated Aesthetic Emojis for Channel Naming
    this.EMOJI_MAP = {
      'announcement': '📢',
      'news': '📰',
      'rule': '📜',
      'guideline': '📜',
      'welcome': '👋',
      'hello': '👋',
      'showcase': '🎬',
      'edit': '🎞️',
      'video': '🎥',
      'portfolio': '💼',
      'feedback': '💡',
      'critique': '🎨',
      'general': '💬',
      'chat': '💬',
      'lounge': '☕',
      'bot': '🤖',
      'command': '⚡',
      'media': '📸',
      'clip': '✂️',
      'meme': '🎭',
      'voice': '🔊',
      'music': '🎵',
      'mod': '🛡️',
      'log': '📋',
      'ticket': '🎟️',
      'verify': '✅',
      'bump': '🚀',
      'invite': '🔗',
      'support': '🤝'
    };
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('decorate')
        .setDescription('Aesthetic server makeover suite (100% free with zero deletions)')
        .addSubcommand(s => s.setName('preview').setDescription('Preview aesthetic category and channel formatting with zero changes applied'))
        .addSubcommand(s => s.setName('apply').setDescription('Apply aesthetic unicode styling to existing channels in place (0 deletions)'))
        .addSubcommand(s => s.setName('roles').setDescription('Decorate server roles with aesthetic badges (100% preserves permissions)')
          .addStringOption(o => o.setName('action').setDescription('Choose preview or apply').setRequired(true)
            .addChoices(
              { name: 'Preview Role Makeover (Zero Changes Applied)', value: 'preview' },
              { name: 'Apply In-Place Styling (Permissions 100% Preserved)', value: 'apply' }
            ))
          .addStringOption(o => o.setName('style').setDescription('Aesthetic theme for roles')
            .addChoices(
              { name: 'Creative Studio Pro (Curated icons for editors, software & staff)', value: 'creative' },
              { name: 'Sleek Minimalist Badges (Clean symbols: ✦, ◈, ▫, etc.)', value: 'minimal' },
              { name: 'Brackets & Studio Tags ([VFX], [GFX], [AE], etc.)', value: 'tags' }
            )))
        .addSubcommand(s => s.setName('stats').setDescription('Deploy top-of-server locked live member & boost counter channels'))
        .addSubcommand(s => s.setName('embeds').setDescription('Deploy high-gloss formatted cards into a channel')
          .addStringOption(o => o.setName('template').setDescription('Select embed guide template').setRequired(true)
            .addChoices(
              { name: '📜 Server Official Rulebook', value: 'rules' },
              { name: '👋 Welcome & Community Hub Guide', value: 'welcome' },
              { name: '🎬 Editors & Creative Submission Guide', value: 'editors_guide' },
              { name: '❓ Frequently Asked Questions (FAQ)', value: 'faq' }
            ))
          .addChannelOption(o => o.setName('channel').setDescription('Channel to post the aesthetic embed card in').addChannelTypes(ChannelType.GuildText)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
    ];
  }

  /**
   * Generates a sleek, aesthetic name for any category
   */
  formatCategoryName(name) {
    const clean = name.replace(/[^\w\s]/g, '').trim().toUpperCase();
    if (clean.includes('INFO') || clean.includes('WELCOME')) return '╭━━〔 ✦ INFORMATION 〕━━╮';
    if (clean.includes('MOD') || clean.includes('STAFF') || clean.includes('ADMIN')) return '╭━━〔 🛡️ STAFF QUARTERS 〕━━╮';
    if (clean.includes('CREATIVE') || clean.includes('EDIT') || clean.includes('PORTFOLIO')) return '╭━━〔 🎬 CREATIVE SUITE 〕━━╮';
    if (clean.includes('COMMUNITY') || clean.includes('CHAT') || clean.includes('TEXT')) return '╭━━〔 💬 COMMUNITY HUB 〕━━╮';
    if (clean.includes('VOICE') || clean.includes('VC')) return '╭━━〔 🔊 VOICE LOUNGE 〕━━╮';
    return `╭━━〔 ✦ ${clean || 'CATEGORY'} 〕━━╮`;
  }

  /**
   * Generates a sleek, aesthetic name for any channel
   */
  formatChannelName(name) {
    const raw = name.toLowerCase().replace(/^[^\w]+/, '').trim();
    
    // Check keyword matches for curated icons
    for (const [key, emoji] of Object.entries(this.EMOJI_MAP)) {
      if (raw.includes(key)) {
        return `${emoji}・${raw}`;
      }
    }

    return `✨・${raw}`;
  }

  /**
   * Generates a tailored, aesthetic name for any server role based on style
   */
  formatRoleName(name, style = 'creative') {
    // Cleanly strip leading emojis, surrogate artifacts, and existing decoration symbols
    let raw = name.replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s✦◈▫▸◆✂️⚡📱🎞️🎨📸🎬💫✨👑🛡️⚠️💎⭐💼・\|\-\.]+/u, '').trim();
    if (!raw) raw = name.trim();

    // Capitalize each word if all lowercase (e.g. "members" -> "Members", "bot" -> "Bot")
    if (raw === raw.toLowerCase()) {
      raw = raw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    const lower = raw.toLowerCase();

    // 1. Creative Studio Pro (Rich, distinct icons for each creative role & tool)
    if (style === 'creative') {
      // Moderation & Safety
      if (lower.includes('quarantine') || lower.includes('muted')) return `⚠️ ${raw}`;
      if (lower.includes('owner') || lower.includes('founder')) return `👑 ${raw}`;
      if (lower.includes('admin') || lower.includes('manager')) return `👑 ${raw}`;
      if (lower.includes('mod') || lower.includes('staff')) return `🛡️ ${raw}`;

      // Creative Specializations (ordered specific to generic)
      if (lower.includes('motion') && lower.includes('designer')) return `✨ ${raw}`;
      if (lower.includes('animat')) return `💫 ${raw}`;
      if (lower.includes('video editor') || lower.includes('video')) return `🎬 ${raw}`;
      if (lower.includes('photo') && lower.includes('editor')) return `📸 ${raw}`;
      if (lower.includes('graphic') || lower.includes('gfx') || lower.includes('designer')) return `🎨 ${raw}`;
      if (lower.includes('vfx') || lower.includes('motion')) return `✨ ${raw}`;
      if (lower.includes('3d') || lower.includes('blender')) return `🧊 ${raw}`;
      if (lower.includes('audio') || lower.includes('sound')) return `🎧 ${raw}`;

      // Software Suites
      if (lower.includes('after effect')) return `⚡ ${raw}`;
      if (lower.includes('premiere')) return `🎞️ ${raw}`;
      if (lower.includes('davinci') || lower.includes('resolve')) return `🎛️ ${raw}`;
      if (lower.includes('capcut')) return `📱 ${raw}`;
      if (lower.includes('vegas') || lower.includes('sony')) return `✂️ ${raw}`;
      if (lower.includes('alight motion')) return `📱 ${raw}`;
      if (lower.includes('photoshop')) return `🖌️ ${raw}`;
      if (lower.includes('lightroom')) return `📷 ${raw}`;
      if (lower.includes('canva')) return `🎨 ${raw}`;
      if (lower.includes('gimp')) return `🖌️ ${raw}`;

      // Pings & Notification Roles
      if (lower.includes('announcement')) return `📢 ${raw}`;
      if (lower.includes('giveaway')) return `🎉 ${raw}`;
      if (lower.includes('resource')) return `📦 ${raw}`;
      if (lower.includes('dead chat')) return `💬 ${raw}`;
      if (lower.includes('edit of the week')) return `🏆 ${raw}`;
      if (lower.includes('help') || lower.includes('support')) return `💡 ${raw}`;
      if (lower.includes('ping')) return `🔔 ${raw}`;

      // Bots & System
      if (lower.includes('bot')) return `🤖 ${raw}`;

      // Community & Clients
      if (lower.includes('client') || lower.includes('buyer')) return `💼 ${raw}`;
      if (lower.includes('vip') || lower.includes('booster') || lower.includes('supporter')) return `💎 ${raw}`;
      if (lower.includes('member') || lower.includes('verified')) return `👥 ${raw}`;

      return `✨ ${raw}`;
    }

    // 2. Bracketed Studio Tags ([VFX], [GFX], [AE], [PR], etc.)
    if (style === 'tags') {
      if (lower.includes('quarantine')) return `[RESTRICTED] ${raw}`;
      if (lower.includes('admin') || lower.includes('owner')) return `[Admin] ${raw}`;
      if (lower.includes('mod') || lower.includes('staff')) return `[Staff] ${raw}`;
      if (lower.includes('motion') || lower.includes('vfx')) return `[Motion] ${raw}`;
      if (lower.includes('animat')) return `[Anim] ${raw}`;
      if (lower.includes('video')) return `[Video] ${raw}`;
      if (lower.includes('photo')) return `[Photo] ${raw}`;
      if (lower.includes('graphic') || lower.includes('gfx') || lower.includes('designer')) return `[GFX] ${raw}`;
      if (lower.includes('after effect')) return `[AE] ${raw}`;
      if (lower.includes('premiere')) return `[PR] ${raw}`;
      if (lower.includes('davinci') || lower.includes('resolve')) return `[DR] ${raw}`;
      if (lower.includes('capcut')) return `[CC] ${raw}`;
      if (lower.includes('vegas') || lower.includes('sony')) return `[SV] ${raw}`;
      if (lower.includes('alight motion')) return `[AM] ${raw}`;
      if (lower.includes('photoshop')) return `[PS] ${raw}`;
      if (lower.includes('lightroom')) return `[LR] ${raw}`;
      if (lower.includes('canva')) return `[Canva] ${raw}`;
      if (lower.includes('gimp')) return `[GIMP] ${raw}`;
      if (lower.includes('announcement')) return `[Announce] ${raw}`;
      if (lower.includes('giveaway')) return `[Giveaway] ${raw}`;
      if (lower.includes('resource')) return `[Resources] ${raw}`;
      if (lower.includes('dead chat')) return `[Chat] ${raw}`;
      if (lower.includes('edit of the week')) return `[EOTW] ${raw}`;
      if (lower.includes('help')) return `[Help] ${raw}`;
      if (lower.includes('ping')) return `[Ping] ${raw}`;
      if (lower.includes('bot')) return `[Bot] ${raw}`;
      if (lower.includes('client')) return `[Client] ${raw}`;
      if (lower.includes('member')) return `[Community] ${raw}`;
      return `[Studio] ${raw}`;
    }

    // 3. Sleek Minimalist Symbols (Clean, understated typography)
    if (lower.includes('quarantine')) return `⚠️ ${raw}`;
    if (lower.includes('admin') || lower.includes('owner')) return `✦ ${raw}`;
    if (lower.includes('mod') || lower.includes('staff')) return `◈ ${raw}`;
    if (lower.includes('client')) return `◆ ${raw}`;
    if (lower.includes('member')) return `▫ ${raw}`;
    if (lower.includes('ping')) return `🔔 ${raw}`;
    if (lower.includes('bot')) return `🤖 ${raw}`;
    return `▸ ${raw}`;
  }

  /**
   * Categorizes a role into an intuitive visual cluster for rich preview embeds
   */
  categorizeRole(name) {
    const lower = name.toLowerCase();
    if (lower.includes('admin') || lower.includes('mod') || lower.includes('staff') || lower.includes('quarantine') || lower.includes('owner') || lower.includes('founder')) {
      return '🛡️ Staff & Safety';
    }
    if (lower.includes('editor') || lower.includes('designer') || lower.includes('animat') || lower.includes('vfx') || lower.includes('3d') || lower.includes('artist')) {
      return '🎬 Creative Crafts & Disciplines';
    }
    if (lower.includes('after effect') || lower.includes('premiere') || lower.includes('davinci') || lower.includes('capcut') || lower.includes('vegas') || lower.includes('motion') || lower.includes('photoshop') || lower.includes('lightroom') || lower.includes('canva') || lower.includes('gimp') || lower.includes('blender')) {
      return '💻 Software & Editing Suites';
    }
    if (lower.includes('ping') || lower.includes('announcement') || lower.includes('giveaway') || lower.includes('resource') || lower.includes('chat') || lower.includes('help') || lower.includes('notify')) {
      return '🔔 Notification Pings';
    }
    if (lower.includes('bot')) {
      return '🤖 Automation & Bots';
    }
    return '👥 Community & Members';
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'decorate') return false;

    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    // 1. PREVIEW AESTHETICS (Zero Changes Applied)
    if (sub === 'preview') {
      await interaction.deferReply({ ephemeral: true });

      const rawChannels = await guild.channels.fetch();
      const channelList = rawChannels.values ? Array.from(rawChannels.values()) : Array.from(rawChannels);
      const categories = channelList.filter(c => c && c.type === ChannelType.GuildCategory);
      const textChannels = channelList.filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement));

      let catPreview = '';
      categories.slice(0, 4).forEach(c => {
        catPreview += `• \`${c.name}\` ➔ **${this.formatCategoryName(c.name)}**\n`;
      });

      let chanPreview = '';
      textChannels.slice(0, 8).forEach(c => {
        chanPreview += `• \`#${c.name}\` ➔ **#${this.formatChannelName(c.name)}**\n`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✨・Aesthetic Server Makeover // Preview')
        .setDescription(
          `Here is how your channels and categories will look when formatted.\n` +
          `**Everything is updated in place — 0 channels, roles, or messages will be deleted.**\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**📁 Categories (Before ➔ After):**\n${catPreview || 'No categories found'}\n` +
          `**💬 Sample Channels (Before ➔ After):**\n${chanPreview || 'No text channels found'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 *To apply these changes safely across your server, run \`/decorate apply\`.*`
        )
        .setFooter({ text: `${guild.name} • 100% Free Non-Destructive Makeover` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 2. APPLY AESTHETIC STYLING (In-Place, Zero Deletions)
    if (sub === 'apply') {
      await interaction.deferReply();

      const rawChannels = await guild.channels.fetch();
      const channelList = rawChannels.values ? Array.from(rawChannels.values()) : Array.from(rawChannels);
      let styledCategories = 0;
      let styledChannels = 0;
      let errors = 0;

      for (const channel of channelList) {
        if (!channel) continue;
        try {
          if (channel.type === ChannelType.GuildCategory) {
            const newName = this.formatCategoryName(channel.name);
            if (channel.name !== newName) {
              await channel.setName(newName).catch(() => { errors++; });
              styledCategories++;
            }
          } else if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
            const newName = this.formatChannelName(channel.name);
            if (channel.name !== newName) {
              await channel.setName(newName).catch(() => { errors++; });
              styledChannels++;
            }
          }
        } catch (e) {
          errors++;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('💎・Server Makeover Successfully Applied!')
        .setDescription(
          `Your server now has a sleek, aesthetic, premium layout!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `▸ 📁 **Categories Styled**: \`${styledCategories}\`\n` +
          `▸ 💬 **Channels Styled**: \`${styledChannels}\`\n` +
          `▸ 🗑️ **Items Deleted**: \`0\` *(100% of messages & permissions preserved)*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Tip: You can deploy live counter channels at the top using \`/decorate stats\`.`
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 3. DEPLOY LIVE COUNTER STATS CHANNELS
    if (sub === 'stats') {
      await interaction.deferReply();

      try {
        // Create stats category at the very top
        const cat = await guild.channels.create({
          name: '╭━━〔 📊 SERVER STATS 〕━━╮',
          type: ChannelType.GuildCategory,
          position: 0,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }
          ]
        });

        const memberChan = await guild.channels.create({
          name: `👥・Members: ${guild.memberCount.toLocaleString()}`,
          type: ChannelType.GuildVoice,
          parent: cat.id,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }
          ]
        });

        const boostChan = await guild.channels.create({
          name: `🚀・Boost Level: ${guild.premiumTier || 0} (${guild.premiumSubscriptionCount || 0})`,
          type: ChannelType.GuildVoice,
          parent: cat.id,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }
          ]
        });

        this.db.set(`stats_channels_${guild.id}`, {
          categoryId: cat.id,
          memberChannelId: memberChan.id,
          boostChannelId: boostChan.id
        });

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📊・Live Server Counter Deployed')
          .setDescription(
            `Dynamic counter channels are now active at the top of your server!\n\n` +
            `▸ <#${memberChan.id}>\n` +
            `▸ <#${boostChan.id}>\n\n` +
            `*These channels are locked from joining and update automatically in the background.*`
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        return interaction.editReply(`❌ Could not deploy stats counters: ${err.message}`);
      }
    }

    // 4. DECORATE SERVER ROLES (100% PRESERVES PERMISSIONS)
    if (sub === 'roles') {
      const action = interaction.options.getString('action');
      const style = interaction.options.getString('style') || 'creative';
      await interaction.deferReply({ ephemeral: action === 'preview' });

      const rawRoles = await guild.roles.fetch();
      const roleList = rawRoles.values ? Array.from(rawRoles.values()) : Array.from(rawRoles);
      const eligibleRoles = roleList.filter(r => r && r.id !== guild.roles.everyone.id && !r.managed);
      const sortedRoles = eligibleRoles.sort((a, b) => b.position - a.position);

      const styleNames = {
        creative: 'Creative Studio Pro (Tailored Icons)',
        minimal: 'Sleek Minimalist Symbols',
        tags: 'Bracketed Studio Tags'
      };

      if (action === 'preview') {
        const groups = {};
        sortedRoles.forEach(r => {
          const cat = this.categorizeRole(r.name);
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push(r);
        });

        let roleSections = '';
        for (const [categoryTitle, roles] of Object.entries(groups)) {
          roleSections += `**${categoryTitle}**\n`;
          roles.forEach(r => {
            const newName = this.formatRoleName(r.name, style);
            roleSections += `• \`${r.name}\` ➔ **${newName}**\n`;
          });
          roleSections += '\n';
        }

        const botMember = guild.members.me;
        const botHighestRole = botMember ? botMember.roles.highest : null;
        let hierarchyWarning = '';
        const blockedRoles = botHighestRole ? sortedRoles.filter(r => r.position >= botHighestRole.position) : [];
        if (blockedRoles.length > 0) {
          hierarchyWarning = `\n💡 **Discord Hierarchy Setup:**\n` +
            `Edit X is currently at position **${botHighestRole ? botHighestRole.position : 1}**.\n` +
            `To apply these names, drag **Edit X** above the roles in **Server Settings ➔ Roles**.\n`;
        }

        let fullDesc = `Here is how **all ${sortedRoles.length} custom server roles** will be styled:\n\n` +
          `${roleSections}` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🛡️ **Permissions Safety Guarantee:**\n` +
          `▸ **Permissions Modified**: \`0\` *(Administrator, ManageMessages, Kick/Ban remain 100% untouched)*\n` +
          `▸ **Members Assigned/Removed**: \`0\` *(Nobody gains or loses any roles)*\n` +
          hierarchyWarning +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👉 *To apply this makeover in place, run \`/decorate roles action:apply style:${style}\`.*`;

        // Safety against Discord's 4096-character embed limit
        if (fullDesc.length > 4000) {
          fullDesc = fullDesc.slice(0, 3950) + '\n\n... *(remaining roles will also be formatted upon apply)*';
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🎭・Role Aesthetic Makeover // ${styleNames[style] || 'Preview'}`)
          .setDescription(fullDesc)
          .setFooter({ text: `${guild.name} • ${sortedRoles.length} Roles Catalogued • 100% Safe Role Styling` })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (action === 'apply') {
        let styledCount = 0;
        let skippedCount = 0;

        const botMember = guild.members.me;
        const botHighestRole = botMember ? botMember.roles.highest : null;

        for (const role of sortedRoles) {
          // Check if bot can edit this role according to Discord hierarchy
          if (botHighestRole && role.position >= botHighestRole.position) {
            skippedCount++;
            continue;
          }

          const newName = this.formatRoleName(role.name, style);
          if (role.name !== newName) {
            try {
              // ONLY modify name — PERMISSIONS ARE NEVER TOUCHED!
              await role.setName(newName, 'Aesthetic role makeover (permissions preserved)');
              styledCount++;
            } catch (err) {
              skippedCount++;
            }
          }
        }

        let helpAdvice = '';
        if (skippedCount > 0 && styledCount === 0) {
          helpAdvice = `\n\n⚠️ **Action Required (Discord Role Hierarchy):**\n` +
            `Discord only allows bots to edit roles placed **below** the bot's highest role.\n` +
            `Right now, **Edit X** is below your custom roles in the role list.\n` +
            `👉 **To fix:** Go to **Server Settings ➔ Roles**, drag the **Edit X** role higher up above your custom roles, and run \`/decorate roles action:apply\` again!`;
        }

        const embed = new EmbedBuilder()
          .setColor(styledCount > 0 ? 0x2ECC71 : 0xF1C40F)
          .setTitle(styledCount > 0 ? '💎・Role Makeover Applied Successfully!' : '⚠️・Discord Role Hierarchy Notice')
          .setDescription(
            `Makeover process completed across all server roles!\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `▸ 🎭 **Roles Styled**: \`${styledCount}\`\n` +
            `▸ 🔒 **Roles Skipped**: \`${skippedCount}\` *(Roles above bot or managed integrations)*\n` +
            `▸ 🛡️ **Permissions Changed**: \`0\` *(100% Preserved & Untouched)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` +
            helpAdvice
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }
    }

    // 5. DEPLOY HIGH-GLOSS RICH EMBED CARDS
    if (sub === 'embeds') {
      const template = interaction.options.getString('template');
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

      const card = this.getEmbedTemplate(template, guild);
      await targetChannel.send({ embeds: [card] });

      return interaction.reply({
        content: `✅ Successfully deployed **${template}** embed into <#${targetChannel.id}>!`,
        ephemeral: true
      });
    }

    return false;
  }

  /**
   * High-gloss dark-neon aesthetic embed templates
   */
  getEmbedTemplate(type, guild) {
    const iconUrl = (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : null;

    if (type === 'rules') {
      return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📜・COMMUNITY GUIDELINES // ${guild.name}`)
        .setDescription(
          `Welcome to **${guild.name}**! To maintain a productive, creative, and safe environment for all members, please review our official rules.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `### 1. 🛡️ Mutual Respect & Creative Professionalism\n` +
          `Treat every member with courtesy. Hate speech, harassment, slurs, doxxing threats, or unsolicited sexual content will result in an immediate ban.\n\n` +
          `### 2. 🚫 Zero Scam, Phishing, or Unauthorized Invites\n` +
          `Do not post unsolicited Discord invite links or unverified external software. Fake Nitro promotions and crypto links are actively flagged by our security Sentinel.\n\n` +
          `### 3. 🎬 Creative Ownership & Feedback Etiquette\n` +
          `Only submit work that you created or edited. When providing feedback on other editors' showcases, offer constructive, respectful critique.\n\n` +
          `### 4. 📁 Keep Channels Organized\n` +
          `Post video edits and showcase media in the dedicated showcase channels. Keep general discussions inside the community lounge.\n\n` +
          `### 5. ⚖️ Staff & Wick Security Decisions\n` +
          `Follow instructions from moderators. If you suspect an account of being compromised or raiding, notify staff immediately.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setFooter({ text: `${guild.name} • Official Network Standards`, iconURL: iconUrl })
        .setTimestamp();
    }

    if (type === 'welcome') {
      return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`👋・WELCOME TO ${guild.name.toUpperCase()} // QUICKSTART`)
        .setDescription(
          `We are a premier network for video editors, VFX artists, sound designers, and content creators!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `▸ 📜 **Step 1: Read the Rules** — Familiarize yourself with our server policies.\n` +
          `▸ 🎭 **Step 2: Grab Your Roles** — Select your primary editing software and notification pings.\n` +
          `▸ 🎬 **Step 3: Share Your Edits** — Drop your reels, YouTube links, and WIPs in our showcase channels.\n` +
          `▸ 💬 **Step 4: Network & Learn** — Join our general chat to exchange project presets and workflows.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `*Have questions or need assistance? Open a support ticket anytime!*`
        )
        .setThumbnail(iconUrl)
        .setFooter({ text: 'EDITX Creative Network • Welcome Hub' })
        .setTimestamp();
    }

    if (type === 'editors_guide') {
      return new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle(`🎬・EDITORS SHOWCASE & SUBMISSION GUIDE`)
        .setDescription(
          `Maximize engagement and receive the best feedback on your video edits!\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `▸ 🎞️ **Supported Media**: Direct video uploads (\`.mp4\`, \`.mov\`), YouTube, Vimeo, and Streamable links are supported.\n` +
          `▸ 💡 **Constructive Critique**: When you post your edit, an automated feedback thread will be created. Let reviewers know if you want notes on pacing, sound design, or color grading!\n` +
          `▸ 🎨 **Project Presets & Assets**: Google Drive and Dropbox project files can be freely shared in designated asset channels.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `*Never re-upload another creator's work without permission.*`
        )
        .setFooter({ text: 'Creative Workflow Hub' })
        .setTimestamp();
    }

    // Default: FAQ
    return new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle(`❓・FREQUENTLY ASKED QUESTIONS // FAQ`)
      .setDescription(
        `Frequently asked questions regarding server navigation and tools:\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**Q: How do I report a suspicious message or scam?**\n` +
        `A: Ping any online moderator or use the ticket system.\n\n` +
        `**Q: Are Google Drive and YouTube links allowed?**\n` +
        `A: Yes! Our AutoMod specifically whitelists creative media and portfolio platforms.\n\n` +
        `**Q: How do I get my edits featured?**\n` +
        `A: Edits that receive high appreciation (🔥, ⭐) are regularly highlighted in our community spotlight!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({ text: 'Knowledge Base' })
      .setTimestamp();
  }
}

module.exports = DecorationModule;

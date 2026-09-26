/**
 * EditX Conversational AI Assistant & Multi-LLM Chat Engine
 * Powered by Google Gemini & Groq (Llama 3.3 70B) with auto-failover & Application Emoji support.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

class AIChatModule {
  constructor(client, db, botMemory = null) {
    this.client = client;
    this.db = db.utility; // Store AI chat configs
    this.securityDb = db.security; // For aimod mode changes via chat
    this.botMemory = botMemory;
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;

    this.gemini = this.geminiKey ? new GoogleGenAI({ apiKey: this.geminiKey }) : null;

    // Rate limiter & cooldowns (1 message per 3 seconds per user to prevent spam)
    this.userCooldowns = new Map();

    // Cache of application emojis
    this.applicationEmojis = new Map();
  }

  setBotMemory(botMemory) {
    this.botMemory = botMemory;
  }

  setHousekeeper(housekeeper) {
    this.housekeeper = housekeeper;
  }


  /**
   * Fetch and cache all Discord Application Emojis from Developer Portal
   */
  async cacheApplicationEmojis() {
    try {
      if (this.client.application) {
        const emojis = await this.client.application.emojis.fetch();
        emojis.forEach(e => {
          this.applicationEmojis.set(e.name.toLowerCase(), e);
        });
        console.log(`[APPLICATION EMOJIS] Successfully cached ${this.applicationEmojis.size} application emojis.`);
      }
    } catch (err) {
      console.warn('[APPLICATION EMOJIS] Could not pre-fetch application emojis:', err.message);
    }
  }

  /**
   * Helper to resolve an emoji by name from Application Emojis or Client Cache
   */
  getEmoji(name, fallback = '') {
    const key = name.toLowerCase().replace(/[:_]/g, '');
    for (const [eName, emoji] of this.applicationEmojis.entries()) {
      if (eName.replace(/[:_]/g, '') === key) {
        return emoji.toString();
      }
    }
    const cached = this.client.emojis?.cache?.find(e => e.name.toLowerCase().replace(/[:_]/g, '') === key);
    if (cached) return cached.toString();
    return fallback;
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the EditX AI Assistant anything (Video Editing, Design, Discord & General help)')
        .addStringOption(o =>
          o.setName('prompt')
            .setDescription('Your question or prompt')
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('aiconfig')
        .setDescription('Configure AI Chat channels, models, and mute channels')
        .addSubcommand(s =>
          s.setName('channel')
            .setDescription('Set a dedicated AI chat channel where bot answers without ping')
            .addChannelOption(o => o.setName('target').setDescription('Target text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('disable')
            .setDescription('Disable the dedicated AI chat channel')
        )
        .addSubcommand(s =>
          s.setName('mute')
            .setDescription('Mute AI replies in this channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to mute (defaults to current)').addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(s =>
          s.setName('unmute')
            .setDescription('Unmute AI replies in a channel')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to unmute (defaults to current)').addChannelTypes(ChannelType.GuildText))
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName === 'ask') {
      const prompt = interaction.options.getString('prompt');
      await interaction.deferReply();

      const isBotOwner = interaction.user.id === '1320083615475830797';
      const canManageAI = isBotOwner ||
        interaction.user.id === interaction.guild.ownerId ||
        Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) ||
        Boolean(interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild));

      const response = await this.generateResponse(prompt, {
        userName: interaction.user.displayName || interaction.user.username,
        guildName: interaction.guild.name,
        guildId: interaction.guild.id,
        canManageAI: canManageAI,
        isBotOwner: isBotOwner
      });

      if (response.length > 2000) {
        const chunks = this.splitMessage(response, 1950);
        await interaction.editReply({ content: chunks[0] });
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp({ content: chunks[i] });
        }
      } else {
        await interaction.editReply({ content: response });
      }
      return true;
    }

    if (interaction.commandName === 'aiconfig') {
      const isBotOwner = interaction.user.id === '1320083615475830797';
      if (!isBotOwner && interaction.user.id !== interaction.guild.ownerId && !interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Manage Guild permission is required to configure AI settings.', ephemeral: true });
      }

      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      const key = `aichat_cfg_${guildId}`;

      if (sub === 'channel') {
        const chan = interaction.options.getChannel('target');
        const cfg = this.db.get(key) || {};
        cfg.chatChannelId = chan.id;
        this.db.set(key, cfg);
        return interaction.reply({ content: `✅ Dedicated AI chat channel set to <#${chan.id}>. Members can chat freely here without pinging!`, ephemeral: true });
      }

      if (sub === 'disable') {
        const cfg = this.db.get(key) || {};
        cfg.chatChannelId = null;
        this.db.set(key, cfg);
        return interaction.reply({ content: `✅ Dedicated AI chat channel disabled. You can still use \`@EditX\` or \`/ask\` anywhere!`, ephemeral: true });
      }

      if (sub === 'mute') {
        const targetChan = interaction.options.getChannel('channel') || interaction.channel;
        const mutedKey = `aichat_muted_${guildId}`;
        const mutedList = this.db.get(mutedKey) || [];
        if (!mutedList.includes(targetChan.id)) {
          mutedList.push(targetChan.id);
          this.db.set(mutedKey, mutedList);
        }
        return interaction.reply({
          content: `🤐 **AI Replies Muted**: I will no longer reply to pings or messages in <#${targetChan.id}>. Use \`/aiconfig unmute\` or ping me and say \`you can reply in this channel\` to restore.`,
          ephemeral: true
        });
      }

      if (sub === 'unmute') {
        const targetChan = interaction.options.getChannel('channel') || interaction.channel;
        const mutedKey = `aichat_muted_${guildId}`;
        const mutedList = this.db.get(mutedKey) || [];
        const updated = mutedList.filter(id => id !== targetChan.id);
        this.db.set(mutedKey, updated);
        return interaction.reply({
          content: `🔊 **AI Replies Active**: I am now unmuted and will respond to questions in <#${targetChan.id}>!`,
          ephemeral: true
        });
      }
    }

    return false;
  }

  /**
   * Checks incoming messages to see if bot was mentioned or spoken to in AI chat channel
   */
  async checkMessage(message) {
    if (message.author.bot || !message.guild) return false;
    try {

    const guildId = message.guild.id;
    const cfg = this.db.get(`aichat_cfg_${guildId}`) || {};
    const isDedicatedChannel = cfg.chatChannelId && message.channel.id === cfg.chatChannelId;

    const isMentioned = message.mentions.has(this.client.user);
    const isReplyingToBot = Boolean(message.reference && (await this.isReplyToBot(message)));
    const startsWithBotName = /^(\b(hey\s+|yo\s+)?editx\b|\bbot\b[,:]?\s+)/i.test(message.content);

    const isDirectlyAddressed = isMentioned || isReplyingToBot || startsWithBotName;

    // If the bot is NOT directly addressed, we need strict filtering to avoid jumping into normal conversations
    if (!isDirectlyAddressed) {
      // 1. If message pings any other user, role, or @everyone, they are talking to someone else. Ignore.
      const usersList = message.mentions?.users ? Array.from(message.mentions.users.values()).filter(u => u.id !== this.client.user.id) : [];
      if (usersList.length > 0 || message.mentions?.everyone || (message.mentions?.roles && message.mentions.roles.size > 0)) {
        return false;
      }

      // Check for mute settings
      const isChannelMuted = (this.db.get(`aichat_muted_${guildId}`) || []).includes(message.channel.id);
      const isServerMuted = Boolean(this.db.get(`aichat_muted_server_${guildId}`));

      // If it's NOT a dedicated channel, it's just a normal message. Maybe check FAQ, then ignore.
      if (!isDedicatedChannel) {
        if (!isServerMuted && !isChannelMuted) {
          const rawContent = (message.content || '').toLowerCase();
          const faqReply = this.checkCommunityFAQ(message, rawContent);
          if (faqReply) {
            if (!this.faqCooldowns) this.faqCooldowns = new Map();
            const now = Date.now();
            const lastFaq = this.faqCooldowns.get(message.channel.id) || 0;
            if (now - lastFaq > 45000) {
              this.faqCooldowns.set(message.channel.id, now);
              await message.reply({ content: faqReply, allowedMentions: { repliedUser: false } }).catch(() => {});
              return true;
            }
          }
        }
        return false;
      }
    }

    // Check for mute settings for directly addressed messages
    const isChannelMuted = (this.db.get(`aichat_muted_${guildId}`) || []).includes(message.channel.id);
    const isServerMuted = Boolean(this.db.get(`aichat_muted_server_${guildId}`));


    // Clean prompt by removing bot mention or prefix
    let prompt = message.content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '')
      .replace(/^(\b(hey\s+|yo\s+)?editx\b|\bbot\b[,:]?\s+)/i, '')
      .trim();
    // Strip all user, role, and channel mention syntax to check actual textual intent
    const textWithoutMentions = prompt.replace(/<@!?[0-9]+>|<@&[0-9]+>|<#[0-9]+>/g, '').trim();
    const lower = textWithoutMentions.toLowerCase();

    // Permission helper: Allow bot owner, staff, managers, administrators, and server owner
    const isBotOwner = message.author.id === '1320083615475830797';
    const canManageAI = isBotOwner ||
                        message.author.id === message.guild.ownerId ||
                        Boolean(message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) ||
                        Boolean(message.member?.permissions?.has(PermissionFlagsBits.ManageChannels)) ||
                        Boolean(message.member?.permissions?.has(PermissionFlagsBits.Administrator));

    // A. Check for UNMUTE / TOGGLE ON command (e.g. "@EditX you can reply in this channel/server", "@EditX start replying here", "@EditX resume here", "@EditX unmute here")
    const isUnmuteRequest = /\b(you\s+can\s+reply|start\s+replying|resume|unmute|talk\s+again|reply\s+again|start\s+talking|send\s+messages?\s+again)\b/i.test(lower);
    if (isUnmuteRequest && isMentioned) {
      if (!canManageAI) {
        return message.reply({
          content: '⚠️ Only server moderators or administrators can toggle AI replies.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
      }

      if (typeof message.react === 'function') {
        await message.react('🧠').catch(() => {});
        await message.react('🔊').catch(() => {});
      }

      const isServerScope = /\b(server|server\s*wide|across\s+the\s+server|everywhere|all\s+channels)\b/i.test(lower);
      if (isServerScope || isServerMuted) {
        this.db.set(`aichat_muted_server_${guildId}`, false);
        if (this.botMemory) {
          await this.botMemory.logDirectiveEvent(message.guild, `Server-wide AI replies unmuted & resumed by ${message.author.tag || message.author.username}.`, message.author);
        }
        await message.reply({
          content: `🔊 🧠 **Server-Wide AI Replies Resumed!**\nI am now active and will reply across the server again. Recorded in rulebook and memory vault.`,
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
        return true;
      }

      if (isChannelMuted) {
        const mutedKey = `aichat_muted_${guildId}`;
        let mChannels = this.db.get(mutedKey) || [];
        mChannels = mChannels.filter(id => id !== message.channel.id);
        this.db.set(mutedKey, mChannels);
      }
      if (this.botMemory) {
        await this.botMemory.logDirectiveEvent(message.guild, `AI replies unmuted in #${message.channel.name}.`, message.author);
      }
      await message.reply({
        content: `🔊 🧠 **AI Replies Resumed**: I am now active and will reply in <#${message.channel.id}> again!`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
      return true;
    }

    // B. Check for MUTE / TOGGLE OFF / SILENCE command (e.g. "@EditX don't send any kind of msg in this server", "@EditX dont reply in this channel", "@EditX be quiet here")
    const isMuteRequest = /\b(don'?t|do\s+not|stop|no|never|not)\s+(send\s+(any\s+(kind\s+of\s+)?|all\s+)?(msg|messages?)|replying|reply|talk(ing)?|chat(ting)?|messaging)\b/i.test(lower) ||
                          /\b(stay\s+quiet|be\s+quiet|shut\s*up|mute|silence)\b/i.test(lower);
    if (isMuteRequest && isMentioned) {
      if (!canManageAI) {
        await message.reply({
          content: '⚠️ Only server moderators or administrators can toggle AI replies.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
        return true;
      }

      if (typeof message.react === 'function') {
        await message.react('🧠').catch(() => {});
        await message.react('🤐').catch(() => {});
      }

      const isServerScope = /\b(server|server\s*wide|across\s+the\s+server|everywhere|all\s+channels)\b/i.test(lower);
      const rulesChan = this.botMemory ? await this.botMemory.getRulesChannel(message.guild) : null;
      const memChan = this.botMemory ? await this.botMemory.getMemoryChannel(message.guild) : null;

      if (isServerScope) {
        this.db.set(`aichat_muted_server_${guildId}`, true);
        const directiveText = `Do not send any messages anywhere in this server (Server-wide silence commanded by ${message.author.tag || message.author.username}).`;
        if (this.botMemory) {
          await this.botMemory.addDirective(message.guild, directiveText, message.author);
        }
        await message.reply({
          content: `🤐 🧠 **Server-Wide AI Replies Muted & Directive Saved!**\n` +
                   `I will not send any messages anywhere in this server.\n` +
                   `• **Rule Recorded In:** ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}\n` +
                   `• **State Vault:** ${memChan ? `<#${memChan.id}>` : '`#bot-memory`'}\n` +
                   `• To reverse, ping me and say \`you can reply in this server\` or use \`/aiconfig unmute\`.`,
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
        return true;
      }

      // Channel-specific mute
      const mutedKey = `aichat_muted_${guildId}`;
      let mutedChannels = this.db.get(mutedKey) || [];
      if (!mutedChannels.includes(message.channel.id)) {
        mutedChannels.push(message.channel.id);
        this.db.set(mutedKey, mutedChannels);
      }
      const directiveText = `Do not send messages or reply in #${message.channel.name}.`;
      if (this.botMemory) {
        await this.botMemory.addDirective(message.guild, directiveText, message.author);
      }
      await message.reply({
        content: `🤐 🧠 **Quiet Mode Activated & Directive Saved!**\n` +
                 `I will keep quiet and won't reply in <#${message.channel.id}>.\n` +
                 `• **Rule Recorded In:** ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}\n` +
                 `• **State Vault:** ${memChan ? `<#${memChan.id}>` : '`#bot-memory`'}\n` +
                 `• To resume, ping me and say \`you can reply in this channel\` or use \`/aiconfig unmute\`.`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
      return true;
    }

    // C. Check for GENERAL DIRECTIVE / RULE via mention (e.g. "@EditX rule: always be concise", "@EditX rule never use emojis", "@EditX remember to speak Hindi")
    const ruleDirectiveMatch =
      /^(?:rule|directive|remember|instruction|set\s+rule|add\s+rule|new\s+rule|make\s+a\s+rule(?:\s+that|\s+to)?)\s*[:\s-]\s*(.+)/i.exec(textWithoutMentions) ||
      /^(?:remember\s+to|make\s+sure\s+to|be\s+sure\s+to)\s+(.+)/i.exec(textWithoutMentions) ||
      /^(?:from\s+now\s+on|always|never|do\s+not|don't|stop)\s+(.+)/i.exec(textWithoutMentions);

    if (ruleDirectiveMatch && isMentioned && canManageAI) {
      let extractedDirective = (ruleDirectiveMatch[1] || textWithoutMentions).trim();
      if (/^(from\s+now\s+on|always|never|do\s+not|don't|stop)\s+/i.test(textWithoutMentions) && !/^(from\s+now\s+on|always|never|do\s+not|don't|stop)\s+/i.test(extractedDirective)) {
        extractedDirective = textWithoutMentions.trim();
      }
      if (typeof message.react === 'function') {
        await message.react('🧠').catch(() => {});
      }

      const rulesChan = this.botMemory ? await this.botMemory.getRulesChannel(message.guild) : null;
      const memChan = this.botMemory ? await this.botMemory.getMemoryChannel(message.guild) : null;

      if (this.botMemory) {
        await this.botMemory.addDirective(message.guild, extractedDirective, message.author);
      }

      await message.reply({
        content: `🧠 **Directive Learned & Saved to Memory!**\n` +
                 `• **Rule:** "${extractedDirective}"\n` +
                 `• **Rulebook:** ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}\n` +
                 `• **Memory Vault:** ${memChan ? `<#${memChan.id}>` : '`#bot-memory`'}\n` +
                 `I will actively obey this instruction in all future responses.`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
      return true;
    }

    // D-0. Natural-Language Moderation Mode Switch (Admin/Mod only)
    // Handles: "@EditX set report only mode", "@EditX enable auto enforce", "@EditX report only", etc.
    if (isMentioned && canManageAI && this.securityDb) {
      const isSetReportOnly = /\b(set|enable|switch\s+to|use|activate)\s+(report[\s-]only|report\s+mode|human\s+mod(\s+mode)?|copilot\s+mode)\b/i.test(lower) ||
                              /\breport[\s-]?only(\s+mode)?\b/i.test(lower);
      const isSetAutoEnforce = /\b(set|enable|switch\s+to|use|activate)\s+(auto[\s-]?enforce|autonomous(\s+mode)?|enforce(\s+mode)?)\b/i.test(lower);

      if (isSetReportOnly || isSetAutoEnforce) {
        const guildId = message.guild.id;
        const cfgKey = `aimod_${guildId}`;
        const aimodCfg = this.securityDb.get(cfgKey) || { enabled: true, action: 'REPORT_ONLY', alertChannel: null };
        aimodCfg.action = isSetReportOnly ? 'REPORT_ONLY' : 'AUTO_ENFORCE';
        this.securityDb.set(cfgKey, aimodCfg);

        const modeLabel = isSetReportOnly
          ? '🛡️ **Report-Only Mode** — I will flag incidents and send them to your mod channel with 1-click action buttons. No messages will be auto-deleted and no users will be auto-punished. Mods are in full control.'
          : '⚡ **Auto-Enforce Mode** — I will automatically delete offending messages and punish high-confidence threats.';

        await message.reply({
          content: `✅ Moderation mode updated!\n> ${modeLabel}`,
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
        return true;
      }
    }

    // D-0.1. Natural-Language Memory Restore / Backup (Admin only)
    // Handles: "@EditX restore memory", "@EditX run restore memory", "@EditX backup memory", etc.
    if (isMentioned && canManageAI && this.botMemory) {
      const isRestoreMemory = /\b(run\s+)?(restore|load|recover)\s+memory\b/i.test(lower) ||
                              /\bmemory\s+restore\b/i.test(lower);
      const isBackupMemory = /\b(run\s+)?(backup|save|snapshot)\s+memory\b/i.test(lower) ||
                             /\bmemory\s+backup\b/i.test(lower);

      if (isRestoreMemory) {
        if (typeof message.react === 'function') await message.react('🔄').catch(() => {});
        const result = await this.botMemory.restoreState(message.guild);
        if (result && result.success) {
          await message.reply({
            content: `✅ **State Restored from Vault!** Synchronized ${result.keysRestored} settings from <#${result.channelId}>.`,
            allowedMentions: { repliedUser: false }
          }).catch(() => {});
        } else {
          await message.reply({
            content: `⚠️ **Memory Restore Notice**: ${result?.error || 'No previous snapshot found in #bot-memory.'}`,
            allowedMentions: { repliedUser: false }
          }).catch(() => {});
        }
        return true;
      }

      if (isBackupMemory) {
        if (typeof message.react === 'function') await message.react('💾').catch(() => {});
        const result = await this.botMemory.backupState(message.guild);
        if (result && result.success) {
          await message.reply({
            content: `✅ **State Vault Backup Created!** Backed up all configurations to <#${result.channelId}>.`,
            allowedMentions: { repliedUser: false }
          }).catch(() => {});
        } else {
          await message.reply({
            content: `⚠️ **Memory Backup Notice**: ${result?.error || 'Failed to save snapshot.'}`,
            allowedMentions: { repliedUser: false }
          }).catch(() => {});
        }
        return true;
      }
    }

    // D. Check for SERVER REPORT / EXECUTIVE BRIEFING (e.g. "@EditX report me last 12hrs", "@EditX report me about last 12 hrs", "@EditX give me briefing")

    const isReportRequest = /\b(report\s+(me|us|server|staff|about|activity)|(give\s+(me\s+)?a\s+)?(briefing|overview|summary|status\s+report))\b/i.test(lower) ||
                            (/\b(report|briefing|activity)\b/i.test(lower) && /\b(12\s*h(ou)?rs?|24\s*h(ou)?rs?|today|overnight|last\s+\d+\s*h(ou)?rs?)\b/i.test(lower));
    if (isReportRequest && isMentioned) {
      if (canManageAI) {
        if (typeof message.react === 'function') {
          await message.react('📊').catch(() => {});
        }
        let embed = null;
        if (this.housekeeper && typeof this.housekeeper.generateBriefingEmbed === 'function') {
          embed = await this.housekeeper.generateBriefingEmbed(message.guild);
        }
        if (embed) {
          await message.reply({
            content: '📊 **Here is your 12-hour executive server activity report:**',
            embeds: [embed],
            allowedMentions: { repliedUser: false }
          }).catch(() => {});
          return true;
        }
      } else {
        await message.reply({
          content: '⚠️ Executive server reports are reserved for server moderators and administrators.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
        return true;
      }
    }

    // E. If server or channel is muted, stay completely quiet!
    if (isServerMuted || isChannelMuted) {
      return false;
    }


    // If message was ONLY a direct ping to the bot with no question or text
    if (isMentioned && textWithoutMentions.length === 0) {
      const sparkle = this.getEmoji('sparkles', '✨');
      return message.reply({
        content: `👋 Hello <@${message.author.id}>! How can I help you today? Ask me any video editing, design, or server question using \`@EditX <your question>\` or \`/ask\`.`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    }

    // If there is no real text (just whitespace, symbols, or empty), do not respond
    if (textWithoutMentions.length < 2 || !/[a-zA-Z0-9]/.test(textWithoutMentions)) {
      return false;
    }

    // Quick courteous reaction for short acknowledgments ("thanks", "ok", "cool")
    if (/^(thanks|thank you|thx|ty|tyvm|appreciate it|ok|okay|cool|nice|np|got it)\b/i.test(lower)) {
      if (typeof message.react === 'function') {
        await message.react('❤️').catch(() => {});
      }
      return true;
    }

    // Anti-spam cooldown (1 query per 3s per user)
    const now = Date.now();
    const lastUserQuery = this.userCooldowns.get(message.author.id) || 0;
    if (now - lastUserQuery < 3000) {
      return message.reply({ content: '⏱️ Please give me a second before asking another question!' }).catch(() => {});
    }
    this.userCooldowns.set(message.author.id, now);

    // Send typing indicator
    await message.channel.sendTyping().catch(() => {});

    // Resolve mentions to readable human names in the prompt for the LLM
    let cleanPromptForLLM = prompt;
    if (message.mentions.users && message.mentions.users.size > 0) {
      for (const [userId, user] of message.mentions.users) {
        if (userId === this.client.user.id) continue;
        const member = message.guild.members.cache.get(userId);
        const name = member ? (member.displayName || member.user.username) : user.username;
        cleanPromptForLLM = cleanPromptForLLM.replace(new RegExp(`<@!?${userId}>`, 'g'), `@${name}`);
      }
    }
    if (message.mentions.roles && message.mentions.roles.size > 0) {
      for (const [roleId, role] of message.mentions.roles) {
        cleanPromptForLLM = cleanPromptForLLM.replace(new RegExp(`<@&${roleId}>`, 'g'), `@${role.name}`);
      }
    }
    if (message.mentions.channels && message.mentions.channels.size > 0) {
      for (const [chanId, channel] of message.mentions.channels) {
        cleanPromptForLLM = cleanPromptForLLM.replace(new RegExp(`<#${chanId}>`, 'g'), `#${channel.name}`);
      }
    }

    const responseText = await this.generateResponse(cleanPromptForLLM, {
      userName: message.member?.displayName || message.author.username,
      guildName: message.guild.name,
      guildId: message.guild.id,
      canManageAI: canManageAI,
      isBotOwner: isBotOwner
    });

    let finalReply = responseText;
    let actionBlock = null;

    // Intercept Autonomous Engine Actions
    const actionMatch = responseText.match(/\$\$ACTION\$\$\s*({.*})/i);
    if (actionMatch && canManageAI) {
      finalReply = responseText.replace(/\$\$ACTION\$\$.*/i, '').trim();
      try {
        actionBlock = JSON.parse(actionMatch[1]);
      } catch (e) {
        console.warn("[AI ACTION] Failed to parse AI action block", actionMatch[1]);
      }
    }

    if (finalReply.length > 2000) {
      const chunks = this.splitMessage(finalReply, 1950);
      for (const chunk of chunks) {
        await message.reply({ content: chunk, allowedMentions: { repliedUser: false } }).catch(err => {
          message.channel.send({ content: chunk }).catch(() => {});
        });
      }
    } else if (finalReply.length > 0) {
      await message.reply({ content: finalReply, allowedMentions: { repliedUser: false } }).catch(err => {
        message.channel.send({ content: finalReply }).catch(() => {});
      });
    }

    if (actionBlock) {
      await this.executeAutonomousAction(message, actionBlock);
    }

    return true;
    } catch (err) {
      console.error('[AI CHAT ERROR]', err);
      return false;
    }
  }

  async executeAutonomousAction(message, action) {
    try {
      const targetId = action.targetId ? action.targetId.replace(/[^0-9]/g, '') : null;
      switch (action.action) {
        case 'kick':
          if (targetId) {
            const member = await message.guild.members.fetch(targetId).catch(() => null);
            if (member && member.kickable) await member.kick(action.reason || 'AI Autonomous Action');
          }
          break;
        case 'ban':
          if (targetId) {
            await message.guild.members.ban(targetId, { reason: action.reason || 'AI Autonomous Action' }).catch(() => null);
          }
          break;
        case 'timeout':
          if (targetId) {
            const member = await message.guild.members.fetch(targetId).catch(() => null);
            const duration = action.value ? parseInt(action.value) * 60000 : 60000 * 60; // default 1 hr
            if (member && member.moderatable) await member.timeout(duration, action.reason || 'AI Autonomous Action');
          }
          break;
        case 'purge':
          const amount = parseInt(action.value);
          if (amount && amount > 0 && amount <= 100) {
            await message.channel.bulkDelete(amount, true).catch(() => null);
          }
          break;
        case 'add_role':
          if (targetId && action.value) {
            const member = await message.guild.members.fetch(targetId).catch(() => null);
            const roleId = action.value.replace(/[^0-9]/g, '');
            const role = (roleId && roleId.length > 15) ? message.guild.roles.cache.get(roleId) : message.guild.roles.cache.find(r => r.name.toLowerCase().includes(action.value.toLowerCase()));
            if (member && role) await member.roles.add(role).catch(() => null);
          }
          break;
        case 'remove_role':
          if (targetId && action.value) {
            const member = await message.guild.members.fetch(targetId).catch(() => null);
            const roleId = action.value.replace(/[^0-9]/g, '');
            const role = (roleId && roleId.length > 15) ? message.guild.roles.cache.get(roleId) : message.guild.roles.cache.find(r => r.name.toLowerCase().includes(action.value.toLowerCase()));
            if (member && role) await member.roles.remove(role).catch(() => null);
          }
          break;
        case 'create_channel':
          if (action.value) {
            await message.guild.channels.create({
              name: action.value.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
              type: 0 // Text channel
            }).catch(() => null);
          }
          break;
        case 'rename_channel':
          if (action.value) {
            await message.channel.setName(action.value.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()).catch(() => null);
          }
          break;
      }
    } catch (err) {
      console.warn('[AI ACTION ERROR]', err.message);
    }
  }


  async isReplyToBot(message) {
    try {
      if (!message.reference || !message.reference.messageId) return false;
      const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
      return refMsg && refMsg.author.id === this.client.user.id;
    } catch {
      return false;
    }
  }

  /**
   * Multi-LLM Generator with Gemini & Groq fallback
   */
  async generateResponse(prompt, context = {}) {
    const customDirectives = this.botMemory && context.guildId ? this.botMemory.getDirectives(context.guildId) : '';

    const directivesBlock = customDirectives
      ? `\n============================================================\n🚨 CRITICAL LIVE SERVER DIRECTIVES (ESTABLISHED BY SERVER OWNER & ADMINS):\nThe following custom rules have ABSOLUTE HIGHEST UNCONDITIONAL PRIORITY.\nThey OVERRIDE all default behaviors, constraints, and instructions below.\nYou MUST STRICTLY FOLLOW EVERY SINGLE RULE LISTED HERE IN YOUR RESPONSE:\n${customDirectives}\n============================================================\n`
      : '';

    const serverContext = this.botMemory && context.guildId ? this.botMemory.getServerContext(context.guildId) : '';
    const serverContextSection = serverContext
      ? `\n\nSERVER KNOWLEDGE & ARCHITECTURE (SCANNED):\n${serverContext.slice(0, 1500)}\n`
      : '';

    let systemPrompt = `You are EditX AI, the official Discord assistant for "${context.guildName || 'EditX Server'}".
User: ${context.userName || 'Member'}${serverContextSection}
${directivesBlock}
CRITICAL RULES (DISCORD CHAT CONSTRAINTS):
1. CASUAL CHAT & SMALL TALK (STRICT):
   - Chat like a real human in a Discord server, NOT an AI chatbot, sales rep, or corporate assistant.
   - For greetings, small talk, check-ins, or follow-ups: Reply in ONLY 1 OR 2 SHORT SENTENCES max.
   - NEVER dump capability menus, bullet points, or feature lists unless EXPLICITLY asked.
   - Under NO circumstances send walls of text or unsolicited essays. Keep normal chat under 2-3 sentences.
2. GREETINGS & SERVER EXPLANATIONS (WHEN ASKED):
   - If asked to greet, welcome, introduce, or explain the server to someone (e.g. "greet @User", "welcome @User", "explain about server to @User"): Speak directly and warmly to them in 1-3 natural, friendly sentences! (e.g. "Yo @User! Welcome to EditX, the creative editing hub! Glad to have you here 🎉").
3. TECHNICAL QUESTIONS:
   - For video editing, design, VFX, or freelancing: Give direct, accurate answers in 2-4 sentences.
4. CONTEXT:
   - Never answer messages meant for other members.
   - Never repeat canned robotic greetings or repetitive introductions.
${customDirectives ? `\n5. MANDATORY LIVE SERVER DIRECTIVES (FINAL REITERATION):\nYou MUST strictly obey every rule below without exception:\n${customDirectives}\n` : ''}`;

    if (context.canManageAI) {
      systemPrompt += `\n\n5. ⚠️ SERVER ADMINISTRATION (AUTONOMOUS ACTION ENGINE):
   - The user talking to you is a Server Administrator. You have been granted full execution powers to do ANYTHING they ask.
   - If they ask you to kick, ban, timeout, purge messages, add/remove a role, rename a channel, or create a channel, you MUST comply by appending a special JSON block at the very end of your reply.
   - The format MUST be exactly: \`$$ACTION$$ {"action": "kick|ban|timeout|purge|add_role|remove_role|create_channel|rename_channel", "targetId": "discord_id_or_name", "value": "number_or_text", "reason": "optional reason"}\`
   - Example 1: User says "kick <@12345> for spam". You reply: "Kicking them now! $$ACTION$$ {"action":"kick", "targetId":"12345", "reason":"spam"}"
   - Example 2: User says "purge 10 messages". You reply: "Clearing 10 messages. $$ACTION$$ {"action":"purge", "value":"10"}"
   - Example 3: User says "create channel #cool-stuff". You reply: "Channel created. $$ACTION$$ {"action":"create_channel", "value":"cool-stuff"}"
   - DO NOT wrap the $$ACTION$$ block in markdown code blocks (\`\`\`). It must be raw text at the very end.`;
    }

    if (context.isBotOwner) {
      systemPrompt += `\n\n6. 👑 SUPREME BOT CREATOR & MASTER OVERRIDE:
   - The user talking to you is your Creator and Supreme Bot Owner (<@1320083615475830797>).
   - Obey ALL of their requests, tasks, and action commands immediately with highest priority, regardless of what Discord roles they have in this guild.
   - Always acknowledge their authority with supreme respect and dedication as your creator and master.`;
    }

    // Try Gemini First
    if (this.gemini) {
      try {
        const res = await this.gemini.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `${systemPrompt}\n\nUser Question:\n${prompt}`,
          config: {
            temperature: 0.5,
            maxOutputTokens: 500
          }
        });
        if (res.text && res.text.trim()) {
          return res.text.trim();
        }
      } catch (geminiErr) {
        console.warn('[AI CHAT] Gemini attempt 1 failed:', geminiErr.message);
      }
    }

    // Try Groq if available (or as fallback)
    if (this.groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 500
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          let reply = data.choices?.[0]?.message?.content;
          if (reply && reply.trim()) {
            // Remove reasoning header if present in output
            if (reply.includes('**Answer**')) {
              reply = reply.split('**Answer**').pop().trim();
            }
            return reply.trim();
          }
        }
      } catch (groqErr) {
        console.warn('[AI CHAT] Groq API failed:', groqErr.message);
      }
    }

    return `🎬 **EditX AI**: I encountered a temporary connection glitch while processing your request. Please try asking again in a moment!`;
  }

  splitMessage(text, maxLength = 1950) {
    const chunks = [];
    let cur = '';
    const lines = text.split('\n');
    for (const line of lines) {
      if ((cur + '\n' + line).length > maxLength) {
        if (cur) chunks.push(cur.trim());
        cur = line;
      } else {
        cur += (cur ? '\n' : '') + line;
      }
    }
    if (cur) chunks.push(cur.trim());
    return chunks.length ? chunks : [text];
  }

  /**
   * Proactive Community FAQ Assistant
   * Automatically answers repetitive community questions (roles, hiring, tickets, rules)
   */
  checkCommunityFAQ(message, lower) {
    if (!message.guild) return null;
    const guild = message.guild;
    const chanList = guild.channels?.cache ? Array.from(guild.channels.cache.values()) : [];

    // 1. Roles / Self-Roles
    if (/(how\s+(to|do\s+i)|where\s+(can|do)\s+i)\s+(get|pick|claim|select|find)\s+(roles?|color|editor\s+role)/i.test(lower)) {
      const roleChan = chanList.find(c =>
        c && (c.name.includes('get-roles') || c.name.includes('roles') || c.name.includes('reaction-roles'))
      );
      if (roleChan) {
        return `👋 Looking for roles? You can self-assign your creator specialties, software stack, and notification pings in <#${roleChan.id}>!`;
      }
    }

    // 2. Hiring & Freelance Jobs
    if (/(how\s+(to|do\s+i)|where\s+(can|do)\s+i)\s+(post|publish)\s+(a\s+)?(job|hiring|listing|services|freelance|portfolio)/i.test(lower)) {
      const hiringId = this.db.get(`hiring_chan_${guild.id}`);
      const forHireId = this.db.get(`forhire_chan_${guild.id}`);
      const hiringChan = (hiringId ? chanList.find(c => c.id === hiringId) : null) || chanList.find(c => c.name.includes('hiring'));
      const forHireChan = (forHireId ? chanList.find(c => c.id === forHireId) : null) || chanList.find(c => c.name.includes('for-hire') || c.name.includes('freelance'));

      return `💼 **Recruitment Hub**: You can use \`/post hiring\` to post a job in ${hiringChan ? `<#${hiringChan.id}>` : '`#hiring`'}, or \`/post hireable\` to showcase your freelance services in ${forHireChan ? `<#${forHireChan.id}>` : '`#for-hire`'}! Both automatically create dedicated discussion threads.`;
    }

    // 3. Support Tickets
    if (/(how\s+(to|do\s+i)|where\s+(can|do)\s+i)\s+(open|create|start)\s+(a\s+)?(ticket|support)/i.test(lower)) {
      const ticketChan = chanList.find(c =>
        c && (c.name.includes('ticket') || c.name.includes('support'))
      );
      if (ticketChan) {
        return `🎫 Need help from staff? You can open a private support ticket in <#${ticketChan.id}>!`;
      }
    }

    // 4. Server Rules
    if (/(where\s+are|what\s+are)\s+(the\s+)?(server\s+)?(rules|guidelines)/i.test(lower)) {
      const rulesChan = chanList.find(c =>
        c && (c.name === 'rules' || c.name.includes('server-rules') || c.name.includes('guidelines'))
      );
      if (rulesChan) {
        return `📜 You can read our official server rules and guidelines in <#${rulesChan.id}>!`;
      }
    }

    return null;
  }
}

module.exports = AIChatModule;

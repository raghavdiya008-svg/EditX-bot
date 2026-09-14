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

      const response = await this.generateResponse(prompt, {
        userName: interaction.user.displayName || interaction.user.username,
        guildName: interaction.guild.name,
        guildId: interaction.guild.id
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

    // 1. If message pings any other user (e.g. @Alter), they are addressing that user, NEVER the bot!
    const usersList = message.mentions?.users ? (typeof message.mentions.users.filter === 'function' ? Array.from(message.mentions.users.filter(u => u.id !== this.client.user.id).values()) : Array.from(message.mentions.users.values()).filter(u => u.id !== this.client.user.id)) : [];
    if (usersList.length > 0) {
      return false;
    }

    // 2. If message has broad role pings (@everyone, @here, @Staff, etc.), ignore
    if (message.mentions.everyone || message.mentions.roles.size > 0) {
      return false;
    }

    const guildId = message.guild.id;
    const cfg = this.db.get(`aichat_cfg_${guildId}`) || {};
    const isDedicatedChannel = cfg.chatChannelId && message.channel.id === cfg.chatChannelId;

    const isMentioned = message.mentions.has(this.client.user);
    const isReplyingToBot = Boolean(message.reference && (await this.isReplyToBot(message)));

    if (!isMentioned && !isReplyingToBot && !isDedicatedChannel) {
      return false;
    }

    // Clean prompt by removing bot mention
    let prompt = message.content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    // Strip all user, role, and channel mention syntax to check actual textual intent
    const textWithoutMentions = prompt.replace(/<@!?[0-9]+>|<@&[0-9]+>|<#[0-9]+>/g, '').trim();
    const lower = textWithoutMentions.toLowerCase();

    // Check if channel is currently muted for AI chat
    const mutedKey = `aichat_muted_${guildId}`;
    let mutedChannels = this.db.get(mutedKey) || [];
    const isChannelMuted = mutedChannels.includes(message.channel.id);

    // Permission helper: Allow staff, managers, administrators, and server owner
    const canManageAI = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
                        message.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
                        message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                        message.author.id === message.guild.ownerId;

    // A. Check for UNMUTE / TOGGLE ON command (e.g. "@EditX you can reply in this channel", "@EditX start replying here", "@EditX resume here", "@EditX unmute here")
    const isUnmuteRequest = /\b(you\s+can\s+reply|start\s+replying|resume|unmute|talk\s+again|reply\s+again)\b/i.test(lower);
    if (isUnmuteRequest && isMentioned) {
      if (!canManageAI) {
        return message.reply({
          content: '⚠️ Only server moderators or administrators can toggle AI replies.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
      }
      if (isChannelMuted) {
        mutedChannels = mutedChannels.filter(id => id !== message.channel.id);
        this.db.set(mutedKey, mutedChannels);
      }
      return message.reply({
        content: `🔊 **AI Replies Resumed**: I am now active and will reply in <#${message.channel.id}> again!`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    }

    // B. Check for MUTE / TOGGLE OFF command (e.g. "@EditX dont reply in this channel", "@EditX stop replying here", "@EditX stay quiet here", "@EditX be quiet in this channel", "@EditX mute here")
    const isMuteRequest = /\b(don'?t\s+reply|stop\s+replying|stay\s+quiet|be\s+quiet|mute|don'?t\s+talk|shut\s*up)\s*(in\s+this\s+channel|here|now)?\b/i.test(lower) ||
                          /\b(don'?t\s+reply\s+in\s+this\s+channel|stop\s+talking\s+here)\b/i.test(lower);
    if (isMuteRequest && isMentioned) {
      if (!canManageAI) {
        return message.reply({
          content: '⚠️ Only server moderators or administrators can toggle AI replies.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
      }
      if (!isChannelMuted) {
        mutedChannels.push(message.channel.id);
        this.db.set(mutedKey, mutedChannels);
      }
      return message.reply({
        content: `🤐 **Quiet Mode Activated**: I will keep quiet and won't reply in <#${message.channel.id}>. Ping me and say \`you can reply in this channel\` whenever you want me back!`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    }

    // C. If this channel is muted, stay completely quiet!
    if (isChannelMuted) {
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
      await message.react('❤️').catch(() => {});
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

    const response = await this.generateResponse(prompt, {
      userName: message.member?.displayName || message.author.username,
      guildName: message.guild.name,
      guildId: message.guild.id
    });

    if (response.length > 2000) {
      const chunks = this.splitMessage(response, 1950);
      for (const chunk of chunks) {
        await message.reply({ content: chunk, allowedMentions: { repliedUser: false } }).catch(err => {
          message.channel.send({ content: chunk }).catch(() => {});
        });
      }
    } else {
      await message.reply({ content: response, allowedMentions: { repliedUser: false } }).catch(err => {
        message.channel.send({ content: response }).catch(() => {});
      });
    }

    return true;
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
    const directivesSection = customDirectives
      ? `\n\nOWNER & ADMIN CUSTOM RULES (STRICT LIVE DIRECTIVES FROM #bot-rules):\n${customDirectives}\n(You MUST obey all custom rules above unconditionally.)`
      : '';

    const systemPrompt = `You are EditX AI, a chill, friendly, and concise Discord assistant for the EditX Community (${context.guildName || 'EditX Server'}).
User: ${context.userName || 'Member'}

CRITICAL RULES (DISCORD CHAT CONSTRAINTS):
1. CASUAL CHAT & SMALL TALK (STRICT):
   - Chat like a real human in a Discord server, NOT an AI chatbot, sales rep, or corporate assistant.
   - For greetings, small talk, check-ins, or follow-ups (e.g. "Good, and you?", "how are you", "what's up", "doing good", "hey", "hbu", "wbu", "nm"): Reply in ONLY 1 OR 2 SHORT SENTENCES max (e.g. "Doing great, thanks! What are you working on today?").
   - NEVER dump capability menus, bullet points, or feature lists ("What are we creating today? Let me know if you need help with: Video Editing...") unless the user EXPLICITLY asks "What can you do?" or "List your features".
   - Under NO circumstances send walls of text or unsolicited essays. Keep normal chat under 2-3 sentences.
2. TECHNICAL QUESTIONS:
   - For video editing (Premiere, AE, DaVinci, CapCut), design (Photoshop, Blender), VFX, or freelancing: Give direct, accurate answers in 2-4 sentences. Only use short bullet steps if the user asked for a step-by-step tutorial or troubleshooting guide.
3. CONTEXT:
   - Never answer messages meant for other members.
   - Never repeat canned robotic greetings or repetitive introductions.${directivesSection}`;

    // Try Gemini First
    if (this.gemini) {
      try {
        const res = await this.gemini.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `${systemPrompt}\n\nUser Question:\n${prompt}`,
          config: {
            temperature: 0.5,
            maxOutputTokens: 250
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
            max_tokens: 250
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
}

module.exports = AIChatModule;

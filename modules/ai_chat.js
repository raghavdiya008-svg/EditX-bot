/**
 * EditX Conversational AI Assistant & Multi-LLM Chat Engine
 * Powered by Google Gemini & Groq (Llama 3.3 70B) with auto-failover & Application Emoji support.
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

class AIChatModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.utility; // Store AI chat configs
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;

    this.gemini = this.geminiKey ? new GoogleGenAI({ apiKey: this.geminiKey }) : null;

    // Rate limiter & cooldowns (1 message per 3 seconds per user to prevent spam)
    this.userCooldowns = new Map();

    // Cache of application emojis
    this.applicationEmojis = new Map();
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
        .setDescription('Configure AI Chat channels and models')
        .addSubcommand(s =>
          s.setName('channel')
            .setDescription('Set a dedicated AI chat channel where bot answers without ping')
            .addChannelOption(o => o.setName('target').setDescription('Target text channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('disable')
            .setDescription('Disable the dedicated AI chat channel')
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
        guildName: interaction.guild.name
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
    }

    return false;
  }

  /**
   * Checks incoming messages to see if bot was mentioned or spoken to in AI chat channel
   */
  async checkMessage(message) {
    if (message.author.bot || !message.guild) return false;

    const guildId = message.guild.id;
    const cfg = this.db.get(`aichat_cfg_${guildId}`) || {};
    const isDedicatedChannel = cfg.chatChannelId && message.channel.id === cfg.chatChannelId;

    const isMentioned = message.mentions.has(this.client.user) && !message.mentions.everyone && !message.reference;
    const isReplyingToBot = message.reference && (await this.isReplyToBot(message));

    if (!isMentioned && !isReplyingToBot && !isDedicatedChannel) {
      return false;
    }

    // Anti-spam cooldown (1 query per 3s per user)
    const now = Date.now();
    const lastUserQuery = this.userCooldowns.get(message.author.id) || 0;
    if (now - lastUserQuery < 3000) {
      await message.react('⏳').catch(() => {});
      return true;
    }
    this.userCooldowns.set(message.author.id, now);

    // Clean prompt
    let prompt = message.content.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
    if (!prompt && isMentioned) {
      const sparkle = this.getEmoji('sparkles', '✨');
      return message.reply({ content: `👋 Hello <@${message.author.id}>! I am the **EditX AI Assistant** ${sparkle}\nAsk me anything using \`@EditX <question>\` or \`/ask <question>\`!` });
    }

    if (!prompt) return false;

    // Send typing indicator
    await message.channel.sendTyping().catch(() => {});

    const response = await this.generateResponse(prompt, {
      userName: message.member?.displayName || message.author.username,
      guildName: message.guild.name
    });

    if (response.length > 2000) {
      const chunks = this.splitMessage(response, 1950);
      for (const chunk of chunks) {
        await message.reply({ content: chunk }).catch(err => {
          message.channel.send({ content: chunk }).catch(() => {});
        });
      }
    } else {
      await message.reply({ content: response }).catch(err => {
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
    const systemPrompt = `You are EditX AI, the official Discord intelligent assistant for the EditX Community (${context.guildName || 'EditX Server'}).
User: ${context.userName || 'Member'}

Guidelines:
1. Tone: Friendly, concise, professional, creative, and Discord-native.
2. Expertise: Video editing (Premiere Pro, After Effects, DaVinci Resolve, CapCut), graphic design (Photoshop, Illustrator, Blender), motion graphics, VFX, freelancing, and Discord community features.
3. Keep responses clean, well-formatted using markdown (bullet points, bold text, code blocks where appropriate).
4. Do not make answers unnecessarily long. Be direct and helpful.`;

    // Try Gemini First
    if (this.gemini) {
      try {
        const res = await this.gemini.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `${systemPrompt}\n\nUser Question:\n${prompt}`,
          config: {
            temperature: 0.7,
            maxOutputTokens: 1000
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
            model: 'groq/compound',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 1000
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

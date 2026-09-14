/**
 * Auto English Translator Engine for EditX Discord Community
 * Features:
 * - Real-time non-English message auto-detection
 * - Instant English translation preserving exact meaning, tone, and technical VFX context
 * - Multi-engine translation (Google Translate API + Gemini 3.6 Flash + Groq Compound fallback)
 * - Non-intrusive Discord replies (repliedUser: false to avoid ping spam)
 * - In-memory translation caching & user cooldowns to protect resources
 * - Zero-hyphens slash command suite (/translate auto, /translate text, /translate config)
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

class TranslatorModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.utility;
    this.configDb = db.config;

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    this.ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
    this.groqKey = groqKey;

    // Translation cache: Map<hash, { lang, translation, cachedAt }>
    this.translationCache = new Map();

    // User cooldowns to prevent spam (max 1 auto-translation per 5 seconds per user)
    this.userCooldowns = new Map();

    // Periodically clean translation cache every 10 minutes
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000);
  }

  cleanupCache() {
    const now = Date.now();
    for (const [key, val] of this.translationCache.entries()) {
      if (now - val.cachedAt > 60 * 60 * 1000) {
        this.translationCache.delete(key);
      }
    }
    for (const [userId, ts] of this.userCooldowns.entries()) {
      if (now - ts > 30 * 1000) {
        this.userCooldowns.delete(userId);
      }
    }
  }

  /**
   * Fast script & heuristic non-English pre-check
   */
  isLikelyNonEnglish(text) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();

    // Ignore very short greetings, single words, numbers, emojis
    if (clean.length < 4) return false;

    // Ignore links, code blocks, or commands
    if (/^(\/|!|\.|\?)/.test(clean)) return false;
    if (/^https?:\/\//i.test(clean)) return false;
    if (clean.startsWith('```') || clean.startsWith('`')) return false;

    // Non-Latin scripts check (Asian scripts don't use space-separation):
    // Cyrillic (Russian, Ukrainian, etc.)
    if (/[\u0400-\u04FF]/.test(clean)) return true;
    // Arabic, Urdu, Persian
    if (/[\u0600-\u06FF\u0750-\u077F]/.test(clean)) return true;
    // Devanagari (Hindi, Marathi, Nepali, Sanskrit)
    if (/[\u0900-\u097F]/.test(clean)) return true;
    // CJK Hanzi / Kanji (Chinese)
    if (/[\u4E00-\u9FFF]/.test(clean)) return true;
    // Japanese Hiragana & Katakana
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(clean)) return true;
    // Korean Hangul
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(clean)) return true;
    // Thai
    if (/[\u0E00-\u0E7F]/.test(clean)) return true;
    // Hebrew
    if (/[\u0590-\u05FF]/.test(clean)) return true;
    // Greek
    if (/[\u0370-\u03FF]/.test(clean)) return true;

    // For space-separated Latin alphabets, require at least 2 words and >= 8 chars to avoid false alarms on typos
    if (clean.length < 8 || clean.split(/\s+/).length < 2) return false;

    // Common non-English Latin diacritics & markers (Spanish, French, German, Portuguese, Vietnamese, etc.)
    if (/[¿¡ñÑçÇäÄöÖüÜßéÉèÈêÊàÀôÔùÙáÁíÍóÓúÚãÃõÕâÂîÎûÛ]/i.test(clean)) return true;

    // Common non-English phrases in Latin script (Spanish, French, German, Hindi Hinglish, Tagalog, etc.)
    const commonForeignTriggers = [
      /\b(hola|amigo|gracias|por favor|buenas|como estas|que tal|ayuda|necesito|donde|quien)\b/i,
      /\b(bonjour|merci|salut|s'il vous plait|comment|pourquoi|avec|tres|bien)\b/i,
      /\b(hallo|guten tag|danke|bitte|wie gehts|warum|nicht|ich bin)\b/i,
      /\b(ciao|grazie|prego|buongiorno|per favore|come stai)\b/i,
      /\b(ola|obrigado|por favor|bom dia|como vai|tudo bem)\b/i,
      /\b(kya|kaise|hai|bhai|mujhe|chahiye|karo|mera|meri|karna|nahi|acha)\b/i,
      /\b(kamusta|salamat|bakit|ano|opo|magkano)\b/i,
      /\b(xin chao|cam on|lam on|the nao)\b/i
    ];

    if (commonForeignTriggers.some(rgx => rgx.test(clean))) {
      return true;
    }

    return false;
  }

  /**
   * Translate text using Fast Free Google Translate API with Gemini/Groq Fallback
   */
  async translateToEnglish(text) {
    if (!text || text.trim().length === 0) return null;
    const cleanText = text.trim();
    const cacheKey = cleanText.toLowerCase();

    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    // 1. Try Fast Google Translate Endpoint (Instant, 0 Quota, Supports 100+ languages)
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data[0])) {
          const translatedText = data[0].map(item => item[0]).filter(Boolean).join(' ').trim();
          const detectedCode = data[2] || 'auto';
          const langName = this.formatLanguageName(detectedCode);

          // If detected as English and translation is identical, skip
          if (detectedCode === 'en' || (translatedText.toLowerCase() === cleanText.toLowerCase() && !this.isLikelyNonEnglish(cleanText))) {
            return null;
          }

          const result = {
            sourceLanguage: langName,
            languageCode: detectedCode,
            translatedText,
            cachedAt: Date.now()
          };

          this.translationCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (apiErr) {
      // Fall through to AI engines
    }

    // 2. Gemini 3.6 Flash Fallback (Handles complex idioms, romanized slang, Hinglish, etc.)
    if (this.ai) {
      try {
        const prompt = `You are an expert real-time translator for a Discord video editor community.
Translate the following non-English message into natural, fluent English.
Preserve the exact meaning, technical editing context, tone, and intent.
If the text is already English, respond with {"isEnglish": true}.
Otherwise respond with strictly valid JSON:
{
  "isEnglish": false,
  "sourceLanguage": "Detected Language Name (e.g. Spanish, Hindi, Russian)",
  "translatedText": "Exact English translation"
}

Message to translate:
"""
${cleanText}
"""`;

        const geminiRes = await this.ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        });

        const parsed = this.parseJsonSafe(geminiRes.text);
        if (parsed && !parsed.isEnglish && parsed.translatedText) {
          const result = {
            sourceLanguage: parsed.sourceLanguage || 'Foreign Language',
            languageCode: 'auto',
            translatedText: parsed.translatedText.trim(),
            cachedAt: Date.now()
          };
          this.translationCache.set(cacheKey, result);
          return result;
        }
      } catch (gemErr) {}
    }

    // 3. Groq Compound Fallback
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
              {
                role: 'system',
                content: 'Translate non-English Discord messages to English. Return JSON: {"isEnglish": bool, "sourceLanguage": string, "translatedText": string}'
              },
              {
                role: 'user',
                content: cleanText
              }
            ],
            temperature: 0.1,
            max_tokens: 300
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          let textRes = data.choices?.[0]?.message?.content || '';
          if (textRes.includes('**Answer**')) textRes = textRes.split('**Answer**').pop().trim();
          const parsed = this.parseJsonSafe(textRes);
          if (parsed && !parsed.isEnglish && parsed.translatedText) {
            const result = {
              sourceLanguage: parsed.sourceLanguage || 'Foreign Language',
              languageCode: 'auto',
              translatedText: parsed.translatedText.trim(),
              cachedAt: Date.now()
            };
            this.translationCache.set(cacheKey, result);
            return result;
          }
        }
      } catch (groqErr) {}
    }

    return null;
  }

  parseJsonSafe(text) {
    if (!text) return null;
    let clean = text.trim();
    if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      clean = clean.substring(start, end + 1);
    }

    try {
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  formatLanguageName(code) {
    const map = {
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      ru: 'Russian',
      hi: 'Hindi',
      ar: 'Arabic',
      zh: 'Chinese',
      'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)',
      ja: 'Japanese',
      ko: 'Korean',
      pt: 'Portuguese',
      it: 'Italian',
      tr: 'Turkish',
      vi: 'Vietnamese',
      id: 'Indonesian',
      tl: 'Tagalog (Filipino)',
      nl: 'Dutch',
      pl: 'Polish',
      uk: 'Ukrainian',
      ro: 'Romanian',
      th: 'Thai',
      he: 'Hebrew',
      el: 'Greek',
      sv: 'Swedish',
      cs: 'Czech',
      hu: 'Hungarian',
      da: 'Danish',
      fi: 'Finnish',
      no: 'Norwegian',
      ur: 'Urdu',
      bn: 'Bengali',
      fa: 'Persian'
    };
    return map[code] || (code.toUpperCase());
  }

  /**
   * Main message event handler for automatic translation
   */
  async checkMessage(message) {
    if (!message.guild || message.author.bot || !message.content) return false;

    // Check if auto-translation is disabled for guild or channel
    const guildId = message.guild.id;
    const isAutoDisabled = this.db.get(`translate_disabled_${guildId}`, false);
    if (isAutoDisabled) return false;

    const ignoredChannels = this.db.get(`translate_ignore_channels_${guildId}`, []);
    if (ignoredChannels.includes(message.channel.id)) return false;

    // Fast check: is this likely non-English?
    if (!this.isLikelyNonEnglish(message.content)) {
      return false;
    }

    // Rate-limit per user to prevent translation spam
    const now = Date.now();
    const lastTime = this.userCooldowns.get(message.author.id) || 0;
    if (now - lastTime < 5000) return false;
    this.userCooldowns.set(message.author.id, now);

    // Perform translation
    const translation = await this.translateToEnglish(message.content);
    if (!translation || !translation.translatedText) {
      return false;
    }

    // If translation is identical to original, do not post
    if (translation.translatedText.trim().toLowerCase() === message.content.trim().toLowerCase()) {
      return false;
    }

    try {
      await message.reply({
        content: `🌐 **Auto-Translation** (*${translation.sourceLanguage}* ➔ *English*):\n> "${translation.translatedText}"`,
        allowedMentions: { repliedUser: false }
      });
      return true;
    } catch (err) {
      console.warn('[AUTO TRANSLATE REPLY ERROR]', err.message);
      return false;
    }
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate messages and configure Auto English Translation')
        .addSubcommand(s =>
          s.setName('text')
            .setDescription('Instantly translate any text to English')
            .addStringOption(o =>
              o.setName('query')
                .setDescription('The text you want to translate')
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s.setName('auto')
            .setDescription('Enable or disable automatic translation in this server or channel')
            .addStringOption(o =>
              o.setName('status')
                .setDescription('Enable or disable auto-translation')
                .setRequired(true)
                .addChoices(
                  { name: '🟢 Enable Auto Translation (Server-wide)', value: 'enable' },
                  { name: '🔴 Disable Auto Translation (Server-wide)', value: 'disable' }
                )
            )
        )
        .addSubcommand(s =>
          s.setName('ignore')
            .setDescription('Ignore or unignore auto-translation in a specific channel')
            .addChannelOption(o =>
              o.setName('channel')
                .setDescription('The channel to ignore or unignore')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand(s =>
          s.setName('config')
            .setDescription('View current Auto-Translation settings for this server')
        )
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'translate') return false;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'text') {
      const query = interaction.options.getString('query');
      await interaction.deferReply();

      const result = await this.translateToEnglish(query);
      if (!result) {
        return interaction.editReply({
          content: `ℹ️ The provided text appears to already be in English, or no translation was required.`
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({
          name: `🌐 Translation Result • ${result.sourceLanguage} ➔ English`,
          iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
        })
        .setDescription(
          `**Original Text:**\n\`\`\`\n${query}\n\`\`\`\n` +
          `**English Translation:**\n> "${result.translatedText}"`
        )
        .setFooter({ text: 'EditX Auto Translator' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    // Management subcommands require ManageGuild or Administrator
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Access Denied: You need **Manage Server** permissions to configure Auto-Translation.',
        ephemeral: true
      });
    }

    if (sub === 'auto') {
      const status = interaction.options.getString('status');
      if (status === 'enable') {
        this.db.set(`translate_disabled_${guildId}`, false);
        await interaction.reply({
          content: '🟢 **Auto English Translation is now ENABLED server-wide.** Whenever a member types in another language, the bot will automatically reply with the accurate English translation.'
        });
      } else {
        this.db.set(`translate_disabled_${guildId}`, true);
        await interaction.reply({
          content: '🔴 **Auto English Translation is now DISABLED server-wide.**'
        });
      }
      return true;
    }

    if (sub === 'ignore') {
      const targetChan = interaction.options.getChannel('channel');
      let ignored = this.db.get(`translate_ignore_channels_${guildId}`, []);

      if (ignored.includes(targetChan.id)) {
        ignored = ignored.filter(id => id !== targetChan.id);
        this.db.set(`translate_ignore_channels_${guildId}`, ignored);
        await interaction.reply({
          content: `✅ <#${targetChan.id}> is no longer ignored. Auto-translation is now **active** in this channel.`
        });
      } else {
        ignored.push(targetChan.id);
        this.db.set(`translate_ignore_channels_${guildId}`, ignored);
        await interaction.reply({
          content: `🚫 <#${targetChan.id}> added to ignore list. Auto-translation will **not** trigger in this channel.`
        });
      }
      return true;
    }

    if (sub === 'config') {
      const isAutoDisabled = this.db.get(`translate_disabled_${guildId}`, false);
      const ignored = this.db.get(`translate_ignore_channels_${guildId}`, []);
      const ignoredFormatted = ignored.length > 0
        ? ignored.map(id => `<#${id}>`).join(', ')
        : '*None (active in all text channels)*';

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🌐 Auto English Translation Settings')
        .setDescription(
          `**Status:** ${isAutoDisabled ? '🔴 Disabled' : '🟢 Active (Auto-Translating non-English chat)'}\n` +
          `**Target Language:** \`English (en)\`\n` +
          `**Ignored Channels:** ${ignoredFormatted}\n\n` +
          `*To toggle server status:* \`/translate auto [enable/disable]\`\n` +
          `*To toggle channel ignore:* \`/translate ignore channel:#channel\``
        )
        .setFooter({ text: 'EditX Community Engine' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return true;
    }

    return false;
  }
}

module.exports = TranslatorModule;

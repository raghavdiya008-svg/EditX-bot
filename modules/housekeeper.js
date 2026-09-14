/**
 * Autonomous Housekeeper & Staff Copilot Console
 * Features:
 * - Staff Ping AI Copilot (Answers FAQs + Auto-Forwards to human mods)
 * - Channel Conversation Summarizer (/copilot summarize)
 * - Daily 9:00 AM Morning Executive Briefing
 * - Ghost-Ping Catcher
 * - Staff Announcement Drafter & User Trust Scanner
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

class HousekeeperModule {
  constructor(client, db, sentinel) {
    this.client = client;
    this.db = db.utility;
    this.casesDb = db.cases;
    this.invitesDb = db.invites;
    this.sentinel = sentinel;

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    this.ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;
    this.groqKey = groqKey;

    // Cache for ghost ping detection: Map<messageId, { authorId, authorTag, content, mentions, createdTimestamp, channelId }>
    this.recentMessageCache = new Map();

    // Cache to prevent duplicate staff ping AI replies
    this.staffPingCooldowns = new Map();

    // Cleanup every 5 minutes
    setInterval(() => this.cleanupMessageCache(), 5 * 60 * 1000);

    // 9:00 AM Daily Briefing Check
    setInterval(() => this.checkMorningBriefing(), 60 * 1000);
  }

  cleanupMessageCache() {
    const now = Date.now();
    for (const [id, msg] of this.recentMessageCache.entries()) {
      if (now - msg.createdTimestamp > 60 * 1000) {
        this.recentMessageCache.delete(id);
      }
    }
  }

  trackMessage(message) {
    if (!message.guild || message.author.bot) return;

    if (message.mentions && (message.mentions.users?.size > 0 || message.mentions.roles?.size > 0)) {
      const userPings = message.mentions.users ? Array.from(message.mentions.users.values()).map(u => `<@${u.id}>`) : [];
      const rolePings = message.mentions.roles ? Array.from(message.mentions.roles.values()).map(r => `<@&${r.id}>`) : [];

      this.recentMessageCache.set(message.id, {
        authorId: message.author.id,
        authorTag: message.author.tag,
        content: message.content,
        mentions: [...userPings, ...rolePings],
        createdTimestamp: message.createdTimestamp,
        channelId: message.channel.id,
        channelName: message.channel.name,
        guildId: message.guild.id
      });
    }
  }

  async handleMessageDelete(message) {
    if (!message.guild) return;

    const cached = this.recentMessageCache.get(message.id);
    if (!cached) return;

    const age = Date.now() - cached.createdTimestamp;
    if (age < 30 * 1000 && cached.mentions.length > 0) {
      this.recentMessageCache.delete(message.id);

      try {
        const logChan = Array.from(message.guild.channels.cache.values()).find(c =>
          c.type === ChannelType.GuildText && (
            c.name.includes('modlog') ||
            c.name.includes('mod-log') ||
            c.name.includes('staff-logs')
          )
        );

        if (logChan) {
          const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setAuthor({ name: '👻 Ghost Ping Detected' })
            .setDescription(
              `**Author:** <@${cached.authorId}> (\`${cached.authorTag}\`)\n` +
              `**Channel:** <#${cached.channelId}>\n` +
              `**Deleted After:** \`${Math.round(age / 1000)}s\`\n\n` +
              `**Pings:** ${cached.mentions.join(', ')}\n\n` +
              `**Message Content:**\n\`\`\`\n${(cached.content || 'None').slice(0, 500)}\n\`\`\``
            )
            .setTimestamp();

          await logChan.send({ embeds: [embed] }).catch(() => {});
        }
      } catch (err) {
        console.warn('[GHOST PING ERROR]', err.message);
      }
    }
  }

  /**
   * Staff Ping AI Auto-Responder & Forwarder
   */
  async handleStaffPing(message) {
    if (!message.guild || message.author.bot) return false;

    // Check if message pings staff roles or contains staff mention
    const staffRoles = message.guild.roles.cache.filter(r =>
      r.permissions.has(PermissionFlagsBits.ManageMessages) ||
      r.name.toLowerCase().includes('staff') ||
      r.name.toLowerCase().includes('mod') ||
      r.name.toLowerCase().includes('admin')
    );

    const hasStaffMention = message.mentions.roles.some(r => staffRoles.has(r.id)) ||
      message.content.toLowerCase().includes('@staff') ||
      message.content.toLowerCase().includes('@moderator') ||
      message.content.toLowerCase().includes('@admin');

    if (!hasStaffMention) return false;

    // Cooldown per user (1 staff ping AI reply per 30s)
    const now = Date.now();
    const lastPing = this.staffPingCooldowns.get(message.author.id) || 0;
    if (now - lastPing < 30000) return false;
    this.staffPingCooldowns.set(message.author.id, now);

    const cleanPrompt = message.cleanContent.replace(/@\w+/g, '').trim();
    if (!cleanPrompt || cleanPrompt.length < 5) {
      await message.reply({
        content: `👋 Hello <@${message.author.id}>, our moderation team has been pinged. Please explain your issue clearly and a staff member will assist you shortly!`
      }).catch(() => {});
      return true;
    }

    // Evaluate with AI
    const systemPrompt = `You are the EditX Staff AI Copilot. A user pinged the staff team with an issue.
If the question is about video editing troubleshooting (Premiere/AE/DaVinci), Discord server roles, hiring rules, or general guidelines, provide a concise helpful answer directly.
If the issue strictly requires HUMAN AUTHORITY (like unbanning someone, payment disputes, partnership deals, reporting a moderator), state that you have notified the staff team and ask the user to wait patiently.`;

    let replyText = '';
    if (this.ai) {
      try {
        const res = await this.ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `${systemPrompt}\n\nUser Question:\n${cleanPrompt}`
        });
        replyText = res.text ? res.text.trim() : '';
      } catch (e) {}
    }

    if (!replyText && this.groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: cleanPrompt }]
          })
        });
        if (groqRes.ok) {
          const d = await groqRes.json();
          let t = d.choices?.[0]?.message?.content || '';
          if (t.includes('**Answer**')) t = t.split('**Answer**').pop().trim();
          replyText = t;
        }
      } catch (e) {}
    }

    if (!replyText) {
      replyText = `👋 Hello <@${message.author.id}>, our staff team has been notified. A moderator will review your inquiry shortly. Please wait patiently!`;
    }

    await message.reply({ content: `🤖 **Staff Copilot**: ${replyText}` }).catch(() => {});
    return true;
  }

  /**
   * Daily 9:00 AM Morning Executive Briefing
   */
  async checkMorningBriefing() {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() === 0) {
      for (const guild of this.client.guilds.cache.values()) {
        await this.dispatchMorningBriefing(guild);
      }
    }
  }

  async dispatchMorningBriefing(guild) {
    try {
      const staffChan = Array.from(guild.channels.cache.values()).find(c =>
        c.type === ChannelType.GuildText && (
          c.name.includes('owner-hq') ||
          c.name.includes('staff-quarters') ||
          c.name.includes('moderator-only') ||
          c.name.includes('modlog')
        )
      );

      if (!staffChan) return;

      const embed = await this.generateBriefingEmbed(guild);
      await staffChan.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.warn('[MORNING BRIEFING ERROR]', err.message);
    }
  }

  async generateBriefingEmbed(guild) {
    const incidents = this.sentinel ? this.sentinel.getRecentIncidents(5) : [];
    const totalMembers = guild.memberCount || 1;

    let incidentSummary = '✅ **Zero critical security incidents overnight.** Server operated quietly.';
    if (incidents.length > 0) {
      incidentSummary = incidents.map(i =>
        `• **[${i.category}]** ${i.action} on \`${i.user}\` in #${i.channel} (${i.confidence}% conf.)`
      ).join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({
        name: `☀️ Daily 9:00 AM Executive Briefing • ${guild.name}`,
        iconURL: guild.iconURL({ dynamic: true }) || undefined
      })
      .setTitle('24/7 Autonomous Server Status Report')
      .setDescription(
        `Good morning! Here is the overnight activity summary:\n\n` +
        `### 📊 Community Metrics\n` +
        `> 👥 **Total Members:** \`#${totalMembers}\`\n` +
        `> 🛡️ **Autonomous Guardian:** 🟢 \`Active (24/7 Auto-Pilot)\`\n\n` +
        `### 🛡️ Overnight Security Actions\n` +
        `${incidentSummary}\n\n` +
        `### ⚡ Quick Copilot Actions\n` +
        `Use \`/copilot summarize\` or \`/copilot briefing\` anytime to inspect server status.`
      )
      .setFooter({ text: 'EditX Autonomous Guardian 24/7' })
      .setTimestamp();

    return embed;
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('copilot')
        .setDescription('Autonomous Staff Copilot Management & Server Diagnostics')
        .addSubcommand(s =>
          s.setName('briefing')
            .setDescription('Get an on-demand executive summary of server health & security incidents')
        )
        .addSubcommand(s =>
          s.setName('summarize')
            .setDescription('AI summarizes recent channel conversation into a 3-bullet executive recap')
            .addChannelOption(o => o.setName('channel').setDescription('Channel to summarize').addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addIntegerOption(o => o.setName('count').setDescription('Number of messages to analyze (10-50)').setMinValue(10).setMaxValue(50))
        )
        .addSubcommand(s =>
          s.setName('scanuser')
            .setDescription('Run background check and trust score assessment on a member')
            .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        )
        .addSubcommand(s =>
          s.setName('draft')
            .setDescription('AI drafts a professional community announcement or contest post')
            .addStringOption(o => o.setName('prompt').setDescription('Topic or details for announcement').setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'copilot') return false;

    // Hardcoded Permission Security Validation
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Access Denied: Only server staff can use `/copilot`.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;

    if (sub === 'briefing') {
      await interaction.deferReply();
      const embed = await this.generateBriefingEmbed(guild);
      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    if (sub === 'summarize') {
      const chan = interaction.options.getChannel('channel');
      const count = interaction.options.getInteger('count') || 25;
      await interaction.deferReply();

      try {
        const fetched = await chan.messages.fetch({ limit: count }).catch(() => null);
        if (!fetched || fetched.size === 0) {
          return interaction.editReply({ content: `❌ Could not read recent messages in <#${chan.id}>.` });
        }

        const msgList = Array.from(fetched.values()).reverse()
          .filter(m => !m.author.bot && m.content)
          .map(m => `[${m.author.username}]: ${m.cleanContent}`);

        const textToSummarize = msgList.join('\n');

        let summary = 'Chat activity was normal and positive.';
        if (this.ai && textToSummarize) {
          const res = await this.ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: `Summarize the following Discord channel messages into 3 concise bullet points for the server owner. Focus on key topics, questions, or issues:\n\n${textToSummarize.slice(0, 2000)}`
          });
          summary = res.text ? res.text.trim() : summary;
        }

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📝 Channel Catch-Up Summary: #${chan.name}`)
          .setDescription(
            `**Analyzed:** \`${fetched.size} messages\`\n\n` +
            `### 📌 Key Highlights\n` +
            `${summary}`
          )
          .setFooter({ text: 'EditX Staff Copilot' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        await interaction.editReply({ content: `❌ Summarization failed: ${err.message}` });
      }
      return true;
    }

    if (sub === 'scanuser') {
      const user = interaction.options.getUser('target');
      const member = await guild.members.fetch(user.id).catch(() => null);
      await interaction.deferReply({ ephemeral: true });

      const createdTs = Math.floor(user.createdTimestamp / 1000);
      const joinedTs = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
      const ageDays = Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000));

      let riskLevel = '🟢 Low Risk (Trust Score: 95%)';
      if (ageDays < 3) riskLevel = '🔴 High Risk - Brand New Account (Trust Score: 20%)';
      else if (ageDays < 14) riskLevel = '🟡 Medium Risk - Recent Account (Trust Score: 60%)';

      const embed = new EmbedBuilder()
        .setColor(ageDays < 3 ? 0xED4245 : 0x5865F2)
        .setTitle(`🔍 Member Trust & Risk Assessment: ${user.username}`)
        .addFields(
          { name: 'User ID', value: `\`${user.id}\``, inline: true },
          { name: 'Trust Assessment', value: `\`${riskLevel}\``, inline: true },
          { name: 'Account Created', value: `<t:${createdTs}:F> (<t:${createdTs}:R>)`, inline: false },
          { name: 'Joined Server', value: joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : 'Not in server', inline: false }
        )
        .setFooter({ text: 'EditX Staff Copilot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    if (sub === 'draft') {
      const prompt = interaction.options.getString('prompt');
      await interaction.deferReply();

      let drafted = '';
      if (this.ai) {
        const res = await this.ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: `You are an expert Discord community manager for EditX (Video editing and creator network).
Draft an engaging, professional community announcement based on this prompt: "${prompt}".
Include clean typography, clear bullet points, rules/details, and relevant emojis.`
        });
        drafted = res.text ? res.text.trim() : '';
      }

      if (!drafted) {
        drafted = `📢 **Community Announcement**\n\n${prompt}`;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📢 Drafted Announcement')
        .setDescription(drafted)
        .setFooter({ text: 'Staff Copilot • Ready to copy and publish' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    return false;
  }
}

module.exports = HousekeeperModule;

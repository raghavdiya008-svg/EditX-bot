/**
 * EditX Bot Memory Vault & Live Directives Engine
 * Features:
 * 1. #🤖・bot-memory: Private state vault channel storing persistent database backups,
 *    auto-restoring state on Render container restarts/redeployments.
 * 2. #📋・bot-rules: Private custom directives channel where server owner/admins define
 *    rules for the bot (e.g. "don't reply here", "always do X"), dynamically ingested into the AI's prompt.
 * 3. Strictly Private: @everyone is denied ViewChannel; only Bot and Admins have access.
 */

const {
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
} = require('discord.js');

class BotMemoryModule {
  constructor(client, db) {
    this.client = client;
    this.db = db;           // full db object (all collections)
    this.utilDb = db.utility;
    this.configDb = db.config;

    // Cache of custom directives per guild: Map<guildId, string[]>
    this.guildDirectives = new Map();

    // Cache of channel IDs per guild: Map<guildId, { memoryChanId, rulesChanId }>
    this.channelCache = new Map();

    // In-memory cache of scanned server structure and knowledge
    this.serverContextCache = new Map();

    // Scheduled periodic backups every 15 minutes
    setInterval(() => this.runScheduledBackups(), 15 * 60 * 1000);
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('memory')
        .setDescription('Manage EditX Bot Memory Vault and Custom Rules')
        .addSubcommand(s =>
          s.setName('backup')
            .setDescription('Force an immediate state backup to #bot-memory')
        )
        .addSubcommand(s =>
          s.setName('restore')
            .setDescription('Restore state from latest #bot-memory backup')
        )
        .addSubcommand(s =>
          s.setName('rules')
            .setDescription('View active custom directives loaded from #bot-rules')
        )
        .addSubcommand(s =>
          s.setName('status')
            .setDescription('Check memory vault health and sync status')
        )
        .addSubcommand(s =>
          s.setName('scan')
            .setDescription('Deep-scan all channels, rules & categories into bot memory')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false),

      new SlashCommandBuilder()
        .setName('scan')
        .setDescription('Deep-scan the entire server so EditX AI understands everything')
        .addSubcommand(s =>
          s.setName('server')
            .setDescription('Scan all channels, categories, rules, and roles into bot memory')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'memory' && interaction.commandName !== 'scan') return false;

    const guild = interaction.guild;
    await interaction.deferReply({ ephemeral: true });

    if (interaction.commandName === 'scan' || (interaction.commandName === 'memory' && interaction.options.getSubcommand() === 'scan')) {
      const result = await this.scanServer(guild, interaction.user);
      if (result.success) {
        const memChan = await this.getMemoryChannel(guild);
        const rulesChan = await this.getRulesChannel(guild);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🌐 Server Deep-Scan & Memory Ingestion Complete')
          .setDescription(
            `EditX AI has thoroughly analyzed and memorized the layout, rules, and structure of **${guild.name}**!\n\n` +
            `• 📂 **Categories Mapped:** \`${result.categoryCount}\`\n` +
            `• 💬 **Text/Announce Channels Scanned:** \`${result.textCount}\` (total: \`${result.channelCount}\` channels)\n` +
            `• 📜 **Server Rules/Guidelines Extracted:** \`${result.rulesFound}\`\n` +
            `• 🛡️ **Roles Analyzed:** \`${result.roleCount}\`\n\n` +
            `🤖 **Knowledge Vault:** ${memChan ? `<#${memChan.id}>` : '`#bot-memory`'} *(full markdown manifest attached)*\n` +
            `📋 **Active Directives:** ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}`
          )
          .setFooter({ text: 'EditX Autonomous Autopilot • Server Context Synced' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.editReply(`⚠️ **Server Scan Failed**: ${result.error}`);
      }
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'backup') {
      const result = await this.backupState(guild);
      if (result.success) {
        return interaction.editReply(`✅ **State Vault Backup Complete**\nBacked up all configurations to <#${result.channelId}>.`);
      } else {
        return interaction.editReply(`⚠️ **Backup Failed**: ${result.error}`);
      }
    }

    if (sub === 'restore') {
      const result = await this.restoreState(guild);
      if (result.success) {
        return interaction.editReply(`✅ **State Restored**: Synchronized ${result.keysRestored} settings from <#${result.channelId}>.`);
      } else {
        return interaction.editReply(`⚠️ **Restore Failed**: ${result.error}`);
      }
    }

    if (sub === 'rules') {
      const rules = this.getDirectivesList(guild.id);
      if (!rules.length) {
        const rulesChan = await this.getRulesChannel(guild);
        return interaction.editReply(`ℹ️ No custom rules active yet. Add instructions or rules for the bot in ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}!`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 EditX Bot Live Directives')
        .setDescription(
          `These instructions are written by server admins and actively enforced by the bot's AI brain:\n\n` +
          rules.map((r, i) => `**${i + 1}.** ${r}`).join('\n\n')
        )
        .setFooter({ text: 'Edit or post new messages in #bot-rules to update instantly' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'status') {
      const memChan = await this.getMemoryChannel(guild);
      const rulesChan = await this.getRulesChannel(guild);
      const rules = this.getDirectivesList(guild.id);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🧠 Bot Memory Vault & Directives Status')
        .addFields(
          { name: '🤖 Memory Vault Channel', value: memChan ? `<#${memChan.id}> (🟢 Active & Private)` : '⚪ Not bound', inline: true },
          { name: '📋 Bot Rules Channel', value: rulesChan ? `<#${rulesChan.id}> (🟢 Active & Private)` : '⚪ Not bound', inline: true },
          { name: '📜 Active Directives Count', value: `\`${rules.length}\` rules active in AI context`, inline: true },
          { name: '🔒 Security', value: 'Both channels strictly hidden from `@everyone`', inline: false }
        )
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    return false;
  }

  /**
   * Initializes private channels and restores state on boot
   */
  async initGuild(guild) {
    if (!guild) return;
    try {
      // 1. Ensure private memory and rules channels exist
      const memChan = await this.ensureMemoryChannel(guild);
      const rulesChan = await this.ensureRulesChannel(guild);

      // 2. Restore state from memory vault
      if (memChan) {
        await this.restoreState(guild);
      }

      // 3. Load active rules from bot-rules channel
      if (rulesChan) {
        await this.syncDirectives(guild);
      }

      // 4. Auto-scan server structure if not yet cached
      if (!this.serverContextCache.has(guild.id) && !this.utilDb.get(`server_context_${guild.id}`)) {
        await this.scanServer(guild, null);
      }
    } catch (err) {
      console.warn(`[BOT MEMORY] Initialization notice for ${guild.name}:`, err.message);
    }
  }

  /**
   * Ensure private #🤖・bot-memory channel exists
   */
  async ensureMemoryChannel(guild) {
    const existing = await this.findChannel(guild, ['bot-memory', 'bot_memory', 'memory-vault']);
    if (existing) {
      this.setChannelCache(guild.id, 'memoryChanId', existing.id);
      return existing;
    }

    try {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      const everyoneId = guild.roles.everyone?.id || guild.id;
      const chan = await guild.channels.create({
        name: '🤖・bot-memory',
        type: ChannelType.GuildText,
        topic: 'EditX Bot Persistent State Vault • Automatic Cloud Backup • Do Not Delete',
        permissionOverwrites: [
          {
            id: everyoneId,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          ...(me && me.id ? [{
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }] : [])
        ]
      });

      this.setChannelCache(guild.id, 'memoryChanId', chan.id);
      console.log(`[BOT MEMORY] Created private vault channel #${chan.name} (${chan.id})`);
      return chan;
    } catch (err) {
      console.warn(`[BOT MEMORY] Could not auto-create #bot-memory:`, err.message);
      return null;
    }
  }

  /**
   * Ensure private #📋・bot-rules channel exists
   */
  async ensureRulesChannel(guild) {
    const existing = await this.findChannel(guild, ['bot-rules', 'bot_rules', 'bot-directives', 'bot_directives']);
    if (existing) {
      this.setChannelCache(guild.id, 'rulesChanId', existing.id);
      return existing;
    }

    try {
      const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
      const everyoneId = guild.roles.everyone?.id || guild.id;
      const chan = await guild.channels.create({
        name: '📋・bot-rules',
        type: ChannelType.GuildText,
        topic: 'EditX Bot Live Custom Directives • Post rules here for the bot to follow',
        permissionOverwrites: [
          {
            id: everyoneId,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          ...(me && me.id ? [{
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AddReactions
            ]
          }] : [])
        ]
      });

      this.setChannelCache(guild.id, 'rulesChanId', chan.id);

      // Post initial welcome and instructions
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 EditX Bot Live Directives Rulebook')
        .setDescription(
          `Welcome to the **Bot Directives Desk**! Any rule, instruction, or behavior you post in this channel is **automatically learned by EditX AI** in real-time.\n\n` +
          `### 💡 Example Rules You Can Post:\n` +
          `• \`Don't reply in #・general-chat unless directly pinged.\`\n` +
          `• \`Always recommend DaVinci Resolve or Premiere Pro for color grading questions.\`\n` +
          `• \`If someone asks about pricing, remind them to include their local currency.\`\n` +
          `• \`Keep answers short, friendly, and concise at all times.\`\n\n` +
          `*The bot will react with 🧠 to acknowledge and immediately save any rule you post or edit!*`
        )
        .setTimestamp();

      await chan.send({ embeds: [welcomeEmbed] }).catch(() => {});
      console.log(`[BOT MEMORY] Created private directives channel #${chan.name} (${chan.id})`);
      return chan;
    } catch (err) {
      console.warn(`[BOT MEMORY] Could not auto-create #bot-rules:`, err.message);
      return null;
    }
  }

  async findChannel(guild, names) {
    if (!guild.channels) return null;
    let list = guild.channels.cache ? Array.from(guild.channels.cache.values()) : [];
    if (!list.length && guild.channels.fetch) {
      const fetched = await guild.channels.fetch().catch(() => null);
      if (fetched) list = Array.from(fetched.values());
    }

    return list.find(c =>
      c && c.type === ChannelType.GuildText &&
      names.some(n => c.name.toLowerCase().includes(n))
    ) || null;
  }

  setChannelCache(guildId, key, channelId) {
    const cur = this.channelCache.get(guildId) || {};
    cur[key] = channelId;
    this.channelCache.set(guildId, cur);
  }

  async getMemoryChannel(guild) {
    const cachedId = this.channelCache.get(guild.id)?.memoryChanId;
    if (cachedId) {
      const c = guild.channels.cache?.get(cachedId) || (await guild.channels.fetch(cachedId).catch(() => null));
      if (c) return c;
    }
    return this.ensureMemoryChannel(guild);
  }

  async getRulesChannel(guild) {
    const cachedId = this.channelCache.get(guild.id)?.rulesChanId;
    if (cachedId) {
      const c = guild.channels.cache?.get(cachedId) || (await guild.channels.fetch(cachedId).catch(() => null));
      if (c) return c;
    }
    return this.ensureRulesChannel(guild);
  }

  /**
   * Backs up database state into #bot-memory
   */
  async backupState(guild) {
    try {
      const memChan = await this.getMemoryChannel(guild);
      if (!memChan) return { success: false, error: 'Memory channel unavailable' };

      const stateSnapshot = {
        guildId: guild.id,
        guildName: guild.name,
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        utility: {
          welcomer: this.utilDb.get(`welcomer_${guild.id}`),
          stats: this.utilDb.get(`stats_${guild.id}`),
          stats_channels: this.utilDb.get(`stats_channels_${guild.id}`),
          aichat_cfg: this.utilDb.get(`aichat_cfg_${guild.id}`),
          aichat_muted: this.utilDb.get(`aichat_muted_${guild.id}`),
          aichat_muted_server: this.utilDb.get(`aichat_muted_server_${guild.id}`),
          server_context: this.utilDb.get(`server_context_${guild.id}`),
          bump_cfg: this.utilDb.get(`bump_cfg_${guild.id}`),
          forhire_chan: this.utilDb.get(`forhire_chan_${guild.id}`)
        },
        config: {
          guildConfig: this.configDb.get(guild.id)
        },
        // ── NEWLY BACKED-UP KEYS (were lost on every restart before this fix) ──
        security: (() => {
          const secDb = this.db.security || this.db.config;
          return {
            guildSecurity: secDb.get(guild.id),
            aimod: secDb.get(`aimod_${guild.id}`),
            modReportChan: secDb.get(`mod_report_chan_${guild.id}`)
          };
        })(),
        tickets: (() => {
          const ticketDb = this.db.tickets;
          return {
            config: ticketDb ? ticketDb.get(`config_${guild.id}`) : null
          };
        })(),
        hiring: (() => {
          const hiringDb = this.db.hiring;
          return {
            hiringChan: hiringDb ? hiringDb.get(`hiring_chan_${guild.id}`) : null,
            forHireChan: hiringDb ? hiringDb.get(`forhire_chan_${guild.id}`) : null
          };
        })()
      };


      const jsonStr = JSON.stringify(stateSnapshot, null, 2);
      const buffer = Buffer.from(jsonStr, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `backup_${guild.id}.json` });

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('💾 Bot State Vault Snapshot')
        .setDescription(
          `**State Snapshot Generated**\n` +
          `• Timestamp: <t:${Math.floor(Date.now() / 1000)}:F>\n` +
          `• Welcomer: ${stateSnapshot.utility.welcomer?.channelId ? `<#${stateSnapshot.utility.welcomer.channelId}>` : 'Default'}\n` +
          `• Muted Channels: \`${(stateSnapshot.utility.aichat_muted || []).length}\` channel(s)\n` +
          `• Server-Wide Mute: \`${stateSnapshot.utility.aichat_muted_server ? 'Active (Silent)' : 'Disabled'}\`\n` +
          `• Stats Channels: ${stateSnapshot.utility.stats_channels ? 'Configured' : 'None'}`
        )
      // Clean up previous snapshot messages so #bot-memory stays completely clean and uncluttered
      if (memChan.messages && typeof memChan.messages.fetch === 'function') {
        try {
          const prevMessages = await memChan.messages.fetch({ limit: 15 }).catch(() => null);
          if (prevMessages && prevMessages.size > 0) {
            for (const m of prevMessages.values()) {
              if (m.author?.id === this.client.user?.id && m.content && m.content.includes('EDITX_STATE_SNAPSHOT_V1')) {
                if (typeof m.delete === 'function') {
                  await m.delete().catch(() => {});
                }
              }
            }
          }
        } catch (cleanErr) {}
      }

      const msg = await memChan.send({
        content: `📦 **EDITX_STATE_SNAPSHOT_V1** \`[${stateSnapshot.iso}]\``,
        embeds: [embed],
        files: [attachment]
      });

      return { success: true, channelId: memChan.id, messageId: msg.id };
    } catch (err) {
      console.error('[BOT MEMORY BACKUP ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Restores database state from latest #bot-memory backup
   */
  async restoreState(guild) {
    try {
      const memChan = await this.getMemoryChannel(guild);
      if (!memChan) return { success: false, error: 'Memory channel unavailable' };

      const messages = await memChan.messages.fetch({ limit: 15 }).catch(() => null);
      if (!messages || messages.size === 0) {
        return { success: false, error: 'No previous state snapshots found in channel' };
      }

      const snapshotMsg = Array.from(messages.values()).find(m =>
        m.content && m.content.includes('EDITX_STATE_SNAPSHOT_V1') && m.attachments?.size > 0
      );

      if (!snapshotMsg) {
        return { success: false, error: 'No valid snapshot file attached' };
      }

      const attachment = snapshotMsg.attachments.first();
      const res = await fetch(attachment.url);
      if (!res.ok) return { success: false, error: 'Could not download snapshot attachment' };

      const snapshot = await res.json();
      if (!snapshot || snapshot.guildId !== guild.id) {
        return { success: false, error: 'Snapshot guild mismatch or invalid format' };
      }

      let restoredCount = 0;

      // Restore utility DB entries
      if (snapshot.utility) {
        if (snapshot.utility.welcomer) {
          this.utilDb.set(`welcomer_${guild.id}`, snapshot.utility.welcomer);
          restoredCount++;
        }
        if (snapshot.utility.stats) {
          this.utilDb.set(`stats_${guild.id}`, snapshot.utility.stats);
          restoredCount++;
        }
        if (snapshot.utility.stats_channels) {
          this.utilDb.set(`stats_channels_${guild.id}`, snapshot.utility.stats_channels);
          restoredCount++;
        }
        if (snapshot.utility.aichat_cfg) {
          this.utilDb.set(`aichat_cfg_${guild.id}`, snapshot.utility.aichat_cfg);
          restoredCount++;
        }
        if (snapshot.utility.aichat_muted) {
          this.utilDb.set(`aichat_muted_${guild.id}`, snapshot.utility.aichat_muted);
          restoredCount++;
        }
        if (snapshot.utility.aichat_muted_server !== undefined) {
          this.utilDb.set(`aichat_muted_server_${guild.id}`, snapshot.utility.aichat_muted_server);
          restoredCount++;
        }
        if (snapshot.utility.server_context) {
          this.utilDb.set(`server_context_${guild.id}`, snapshot.utility.server_context);
          this.serverContextCache.set(guild.id, snapshot.utility.server_context);
          restoredCount++;
        }
        if (snapshot.utility.bump_cfg) {
          this.utilDb.set(`bump_cfg_${guild.id}`, snapshot.utility.bump_cfg);
          restoredCount++;
        }
        if (snapshot.utility.forhire_chan) {
          this.utilDb.set(`forhire_chan_${guild.id}`, snapshot.utility.forhire_chan);
          restoredCount++;
        }
      }

      // Restore config DB entries
      if (snapshot.config?.guildConfig) {
        this.configDb.set(guild.id, snapshot.config.guildConfig);
        restoredCount++;
      }

      // ── RESTORE NEWLY ADDED KEYS ────────────────────────────────────────────────
      // Security: honeypot, AI mod, mod report channel
      if (snapshot.security) {
        const secDb = this.db.security || this.db.config;
        if (snapshot.security.guildSecurity) {
          secDb.set(guild.id, snapshot.security.guildSecurity);
          restoredCount++;
        }
        if (snapshot.security.aimod) {
          secDb.set(`aimod_${guild.id}`, snapshot.security.aimod);
          restoredCount++;
        }
        if (snapshot.security.modReportChan) {
          secDb.set(`mod_report_chan_${guild.id}`, snapshot.security.modReportChan);
          restoredCount++;
        }
      }

      // Tickets: portal channel and category
      if (snapshot.tickets?.config) {
        const ticketDb = this.db.tickets;
        if (ticketDb) {
          ticketDb.set(`config_${guild.id}`, snapshot.tickets.config);
          restoredCount++;
        }
      }

      // Hiring: hiring and for-hire channel IDs
      if (snapshot.hiring) {
        const hiringDb = this.db.hiring;
        if (hiringDb) {
          if (snapshot.hiring.hiringChan) {
            hiringDb.set(`hiring_chan_${guild.id}`, snapshot.hiring.hiringChan);
            restoredCount++;
          }
          if (snapshot.hiring.forHireChan) {
            hiringDb.set(`forhire_chan_${guild.id}`, snapshot.hiring.forHireChan);
            // Also mirror to utility for FAQ copilot lookups
            this.utilDb.set(`forhire_chan_${guild.id}`, snapshot.hiring.forHireChan);
            restoredCount++;
          }
        }
      }
      // ────────────────────────────────────────────────────────────────────────────

      console.log(`[BOT MEMORY] Successfully restored ${restoredCount} database entries for ${guild.name} from #bot-memory!`);
      return { success: true, channelId: memChan.id, keysRestored: restoredCount };

    } catch (err) {
      console.error('[BOT MEMORY RESTORE ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Synchronizes and caches active rules from #bot-rules
   */
  async syncDirectives(guild) {
    try {
      const rulesChan = await this.getRulesChannel(guild);
      if (!rulesChan) return;

      const messages = await rulesChan.messages.fetch({ limit: 50 }).catch(() => null);
      if (!messages || messages.size === 0) {
        this.guildDirectives.set(guild.id, []);
        return;
      }

      const directives = [];
      // Chronological order (oldest to newest)
      const sorted = Array.from(messages.values()).reverse();

      for (const msg of sorted) {
        // Ignore bot's own instructional embeds
        if (msg.author.id === this.client.user?.id && msg.embeds?.length > 0) continue;
        if (!msg.content || !msg.content.trim()) continue;

        const cleanRule = msg.content.trim();
        directives.push(cleanRule);
      }

      this.guildDirectives.set(guild.id, directives);
      console.log(`[BOT RULES] Synced ${directives.length} active custom directives for ${guild.name}`);
    } catch (err) {
      console.warn(`[BOT RULES] Sync error for ${guild?.name}:`, err.message);
    }
  }

  /**
   * Handles messages created, edited, or deleted in #bot-rules
   */
  async handleRulesChannelEvent(message, action = 'create') {
    if (!message.guild || message.author?.bot) return;

    const rulesChanId = this.channelCache.get(message.guild.id)?.rulesChanId;
    if (message.channel.id !== rulesChanId) {
      // Check if channel name matches
      if (!message.channel.name.includes('bot-rules') && !message.channel.name.includes('bot-directives')) {
        return;
      }
      this.setChannelCache(message.guild.id, 'rulesChanId', message.channel.id);
    }

    // React with brain emoji to acknowledge rule ingestion
    if (action === 'create' || action === 'update') {
      await message.react('🧠').catch(() => {});
    }

    // Resync all directives
    await this.syncDirectives(message.guild);
  }

  /**
   * Formatted string of active directives for LLM system prompt injection
   */
  getDirectives(guildId) {
    const list = this.guildDirectives.get(guildId) || [];
    if (!list.length) return '';
    return list.map((rule, idx) => `${idx + 1}. ${rule}`).join('\n');
  }

  getDirectivesList(guildId) {
    return this.guildDirectives.get(guildId) || [];
  }

  /**
   * Retrieves cached or stored server knowledge manifest
   */
  getServerContext(guildId) {
    if (this.serverContextCache.has(guildId)) {
      return this.serverContextCache.get(guildId);
    }
    const saved = this.utilDb.get(`server_context_${guildId}`);
    if (saved) {
      this.serverContextCache.set(guildId, saved);
      return saved;
    }
    return '';
  }

  /**
   * Programmatically adds a directive, posts to #bot-rules, acknowledges with 🧠 and backs up state
   */
  async addDirective(guild, directiveText, author = null) {
    try {
      const rulesChan = await this.getRulesChannel(guild);
      let sentMsg = null;
      if (rulesChan) {
        const authorLabel = author ? (author.tag || author.username || author.displayName || 'Admin') : 'Admin';
        sentMsg = await rulesChan.send({
          content: `📌 **Directive [from ${authorLabel}]:** ${directiveText}`
        }).catch(() => null);

        if (sentMsg && typeof sentMsg.react === 'function') {
          await sentMsg.react('🧠').catch(() => {});
        }
      }

      // Add to cached list
      const list = this.guildDirectives.get(guild.id) || [];
      list.push(directiveText);
      this.guildDirectives.set(guild.id, list);

      // Trigger state backup to memory vault
      await this.backupState(guild);
      return { success: true, channelId: rulesChan ? rulesChan.id : null, messageId: sentMsg ? sentMsg.id : null };
    } catch (err) {
      console.error('[BOT MEMORY ADD DIRECTIVE ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Logs a directive update/unmute event to #bot-rules
   */
  async logDirectiveEvent(guild, eventText, author = null) {
    try {
      const rulesChan = await this.getRulesChannel(guild);
      if (rulesChan) {
        const authorLabel = author ? (author.tag || author.username || author.displayName || 'Admin') : 'Admin';
        const msg = await rulesChan.send({
          content: `⚡ **Directive Update [from ${authorLabel}]:** ${eventText}`
        }).catch(() => null);
        if (msg && typeof msg.react === 'function') {
          await msg.react('🔊').catch(() => {});
        }
      }
      await this.backupState(guild);
    } catch (e) {}
  }

  /**
   * Deep-scans the entire server: channels, categories, guidelines, roles, topics
   * Stores context in DB, RAM, and uploads Server Manifest to #bot-memory
   */
  async scanServer(guild, initiatedBy = null) {
    if (!guild) return { success: false, error: 'Guild unavailable' };
    try {
      // 1. Ensure private memory vault channels exist
      const memChan = await this.ensureMemoryChannel(guild);
      const rulesChan = await this.ensureRulesChannel(guild);

      // 2. Fetch all channels & categories
      let channels = guild.channels.cache ? Array.from(guild.channels.cache.values()) : [];
      if (guild.channels.fetch) {
        const fetched = await guild.channels.fetch().catch(() => null);
        if (fetched) channels = Array.from(fetched.values());
      }

      const categories = channels.filter(c => c && c.type === ChannelType.GuildCategory);
      const textChannels = channels.filter(c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement));
      const voiceChannels = channels.filter(c => c && (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice));

      // 3. Extract rules and server guidelines
      const ruleChannelCandidates = textChannels.filter(c =>
        c && /rules|guidelines|welcome-hub|about|info|faq|community-rules/i.test(c.name)
      );

      const extractedRules = [];
      for (const rc of ruleChannelCandidates) {
        if (rc.messages && rc.messages.fetch) {
          try {
            const msgs = await rc.messages.fetch({ limit: 10 }).catch(() => null);
            if (msgs && msgs.size > 0) {
              const ruleTexts = Array.from(msgs.values())
                .reverse()
                .filter(m => m.content && m.content.trim() && !m.author?.bot)
                .map(m => `[#${rc.name}] ${m.content.trim()}`);
              extractedRules.push(...ruleTexts);
            }
          } catch (e) {}
        }
      }

      // 4. Extract roles
      let roles = guild.roles.cache ? Array.from(guild.roles.cache.values()) : [];
      if (guild.roles.fetch) {
        const fetchedRoles = await guild.roles.fetch().catch(() => null);
        if (fetchedRoles) roles = Array.from(fetchedRoles.values());
      }
      const sortedRoles = roles
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .slice(0, 20)
        .map(r => r.name);

      // 5. Build Channel Structure Map
      const channelStructure = [];
      for (const cat of categories) {
        const childChannels = textChannels.filter(c => c.parentId === cat.id);
        const childrenSummary = childChannels.map(c => `  - #${c.name}${c.topic ? ` (${c.topic})` : ''}`).join('\n');
        channelStructure.push(`### Category: ${cat.name}\n${childrenSummary || '  (No text channels)'}`);
      }
      const uncategorized = textChannels.filter(c => !c.parentId);
      if (uncategorized.length > 0) {
        const uncatSummary = uncategorized.map(c => `  - #${c.name}${c.topic ? ` (${c.topic})` : ''}`).join('\n');
        channelStructure.push(`### Uncategorized Channels:\n${uncatSummary}`);
      }

      // 6. Build Comprehensive Server Knowledge Manifest
      const manifest = [
        `# SERVER KNOWLEDGE BASE & AUDIT: ${guild.name.toUpperCase()}`,
        `• Server ID: ${guild.id}`,
        `• Member Count: ${guild.memberCount || 'Unknown'}`,
        `• Owner ID: ${guild.ownerId || 'Unknown'}`,
        `• Scanned At: ${new Date().toISOString()}`,
        `• Initiated By: ${initiatedBy ? (initiatedBy.tag || initiatedBy.username || 'System') : 'Auto-Boot'}`,
        '',
        '## 1. SERVER ARCHITECTURE & CHANNELS',
        channelStructure.join('\n\n') || '(Default layout)',
        '',
        '## 2. VOICE & MEDIA CHANNELS',
        voiceChannels.map(v => `- 🔊 ${v.name}`).join('\n') || 'None',
        '',
        '## 3. KEY ROLES & HIERARCHY',
        sortedRoles.join(', ') || 'Default roles',
        '',
        '## 4. SERVER GUIDELINES & EXTRACTED RULES',
        extractedRules.length > 0
          ? extractedRules.slice(0, 10).map((r, i) => `${i + 1}. ${r}`).join('\n')
          : 'Standard community guidelines apply (Respect members, no spam, keep topics relevant).',
        '',
        '## 5. ACTIVE BOT CHANNELS',
        `• Memory Vault: ${memChan ? `#${memChan.name} (${memChan.id})` : 'Not bound'}`,
        `• Directives Desk: ${rulesChan ? `#${rulesChan.name} (${rulesChan.id})` : 'Not bound'}`
      ].join('\n');

      // 7. Save to DB & RAM Cache
      this.utilDb.set(`server_context_${guild.id}`, manifest);
      this.serverContextCache.set(guild.id, manifest);

      // 8. Upload Manifest and Embed to #bot-memory
      if (memChan) {
        const manifestBuffer = Buffer.from(manifest, 'utf-8');
        const manifestAttachment = new AttachmentBuilder(manifestBuffer, { name: `server_manifest_${guild.id}.md` });
        const scanEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🌐 Comprehensive Server Knowledge Base Updated')
          .setDescription(
            `EditX AI has completed a full deep-scan of **${guild.name}**.\n\n` +
            `• **Text/Announce Channels:** \`${textChannels.length}\`\n` +
            `• **Categories Mapped:** \`${categories.length}\`\n` +
            `• **Voice Channels:** \`${voiceChannels.length}\`\n` +
            `• **Server Rules Extracted:** \`${extractedRules.length}\`\n` +
            `• **Key Roles Synced:** \`${sortedRoles.length}\``
          )
          .setFooter({ text: 'EditX Autonomous Autopilot • Server Context Synced' })
          .setTimestamp();

        await memChan.send({
          content: `🧠 **SERVER_SCAN_COMPLETE** • Analyzed ${channels.length} channels & server structure`,
          embeds: [scanEmbed],
          files: [manifestAttachment]
        }).catch(err => console.warn('[BOT MEMORY SCAN UPLOAD ERROR]', err.message));
      }

      console.log(`[BOT SCAN] Deep server scan complete for ${guild.name}: ${channels.length} channels analyzed.`);
      return {
        success: true,
        channelCount: channels.length,
        textCount: textChannels.length,
        categoryCount: categories.length,
        roleCount: sortedRoles.length,
        rulesFound: extractedRules.length,
        manifest
      };
    } catch (err) {
      console.error('[BOT SCAN ERROR]', err);
      return { success: false, error: err.message };
    }
  }

  async runScheduledBackups() {
    if (!this.client?.guilds) return;
    for (const guild of this.client.guilds.cache.values()) {
      await this.backupState(guild).catch(() => {});
    }
  }
}

module.exports = BotMemoryModule;

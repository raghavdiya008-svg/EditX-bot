/**
 * PrefixCommandsModule - Dedicated Owner & Admin Plain-Text Command Dispatcher
 * Guarantees Bot Owner and Admins can run critical setup, management, and recovery commands
 * even if Discord hides or delays slash commands.
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class PrefixCommandsModule {
  constructor(client, options = {}) {
    this.client = client;
    this.quickSetup = options.quickSetup;
    this.botMemory = options.botMemory;
    this.decoration = options.decoration;
    this.botOwnerId = options.botOwnerId || process.env.BOT_OWNER_ID || '';
    this.port = options.port || process.env.PORT || 3005;
  }

  /**
   * Determine if a user is the bot owner
   */
  isBotOwner(userId) {
    if (!userId) return false;
    if (typeof this.client?.isOwner === 'function') {
      return this.client.isOwner(userId);
    }
    return userId === (this.client?.botOwnerId || this.botOwnerId || process.env.BOT_OWNER_ID);
  }

  /**
   * Dispatches plain-text prefix commands (!autopilot, !setup, !scan, !rules, etc.)
   * @param {import('discord.js').Message} message
   * @returns {Promise<boolean>} true if a command was handled, false otherwise
   */
  async handle(message) {
    if (!message || !message.guild || message.author.bot) return false;

    const isOwner = this.isBotOwner(message.author.id);
    const isServerAdmin = isOwner ||
      message.author.id === message.guild.ownerId ||
      Boolean(message.member?.permissions?.has(PermissionFlagsBits.Administrator));

    let text = (message.content || '').trim();
    let isPrefixCmd = false;

    if (text.startsWith('!')) {
      isPrefixCmd = true;
      text = text.slice(1).trim();
    } else if (this.client.user && (text.startsWith(`<@${this.client.user.id}>`) || text.startsWith(`<@!${this.client.user.id}>`))) {
      const afterMention = text.replace(new RegExp(`^<@!?${this.client.user.id}>\\s*`), '').trim();
      if (/^(autopilot|setup|scan|rules|memory|decorate|roles|help|dashboard|cockpit)/i.test(afterMention)) {
        isPrefixCmd = true;
        text = afterMention;
      }
    }

    if (!isPrefixCmd || !isServerAdmin) {
      return false;
    }

    try {
      const parts = text.split(/\s+/);
      const cmd = (parts[0] || '').toLowerCase();
      const sub = (parts[1] || '').toLowerCase();
      const args = parts.slice(1);

      const botOwnerDisplay = this.botOwnerId || process.env.BOT_OWNER_ID || 'Supreme Authority';

    // 1. !autopilot
    if (cmd === 'autopilot') {
      if (!this.quickSetup) return false;
      const waitMsg = await message.reply('⚡ **Activating 100% Autonomous Auto-Pilot...**').catch(() => null);
      const results = await this.quickSetup.runAutoPilot(message.guild, true);
      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle(`⚡・${message.guild.name} 100% Autonomous Auto-Pilot Online`)
        .setDescription(
          `Your server is operating on **complete autonomous auto-pilot**.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👋 **1. Welcomer & Canvas Cards**\n▸ ${results.welcomer}\n\n` +
          `🏷️ **2. Auto-Role On Arrival**\n▸ ${results.autorole}\n\n` +
          `📋 **3. Mod & Server Audit Logs**\n▸ ${results.logging}\n\n` +
          `💼 **4. Hiring & Freelance Desk**\n▸ ${results.hiring}\n\n` +
          `🎫 **5. Support Ticket Dispatch**\n▸ ${results.tickets}\n\n` +
          `🚀 **6. Bump Reminders**\n▸ ${results.bump}\n\n` +
          `🍯 **7. Honeypot Anti-Raid Shield**\n▸ ${results.honeypot}\n\n` +
          `🧠 **8. State Vault & Custom Rules**\n▸ ${results.memory}\n\n` +
          `🌐 **9. Server Knowledge & AI Context**\n▸ ${results.serverScan}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✨ *Autonomous operations are managing member arrivals, roles, tickets, hiring threads, and security 24/7.*`
        )
        .setFooter({ text: `${message.guild.name} • 100% Autonomous Auto-Pilot` })
        .setTimestamp();
      if (waitMsg) await waitMsg.edit({ content: null, embeds: [embed] }).catch(() => {});
      return true;
    }

    // 2. !setup
    if (cmd === 'setup') {
      if (!this.quickSetup) return false;
      if (sub === 'roles' || sub === 'reactionroles') {
        const waitMsg = await message.reply('🎭 **Deploying interactive reaction role panels & verifying roles...**').catch(() => null);
        const res = await this.quickSetup.deployReactionRoles(message.guild, message.channel);
        if (waitMsg) await waitMsg.edit({ content: res }).catch(() => {});
        return true;
      }
      if (sub === 'create-roles' || sub === 'createroles') {
        const waitMsg = await message.reply('👑 **Initializing complete server role hierarchy...**').catch(() => null);
        const created = await this.quickSetup.createDefaultRoles(message.guild);
        const textRes = `✅ **Role Hierarchy Initialized!**\nVerified/created ${created.length} roles:\n${created.map(r => `• <@&${r.id}>`).join('\n')}`;
        if (waitMsg) await waitMsg.edit({ content: textRes }).catch(() => {});
        return true;
      }
      if (sub === 'quick') {
        const waitMsg = await message.reply('⚡ **Running 1-Click Quick Setup...**').catch(() => null);
        const dashboardEmbed = await this.quickSetup.executeQuickSetup(message.guild, message.channel);
        if (waitMsg) await waitMsg.edit({ embeds: [dashboardEmbed] }).catch(() => {});
        return true;
      }
    }

    // 3. !scan
    if (cmd === 'scan') {
      if (!this.botMemory) return false;
      const waitMsg = await message.reply('🔍 **Deep-scanning channels, categories, roles & rules into bot memory...**').catch(() => null);
      await this.botMemory.scanServer(message.guild, message.author);
      if (waitMsg) await waitMsg.edit({ content: `✅ **Deep Server Scan Complete!**\nAI now has full knowledge of all channels, roles, and guidelines in **${message.guild.name}**.` }).catch(() => {});
      return true;
    }

    // 4. !rules
    if (cmd === 'rules') {
      if (!this.botMemory) return false;
      if (sub === 'update') {
        const waitMsg = await message.reply('📜 **Publishing and synchronizing community rules...**').catch(() => null);
        const res = await this.botMemory.publishCommunityRules(message.guild, message.channel);
        if (waitMsg) await waitMsg.edit(res).catch(() => {});
        return true;
      }
      if (sub === 'list') {
        const directives = this.botMemory.getDirectivesList(message.guild.id);
        if (!directives || directives.length === 0) {
          await message.reply('📭 **No custom rules currently active in server memory.**\nUse `!rules add <rule>` to add one.').catch(() => {});
          return true;
        }
        const formatted = directives.map((d, i) => `**${i + 1}.** ${d}`).join('\n\n');
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📋 Custom Bot Rules & Directives • ${message.guild.name} (${directives.length})`)
          .setDescription(formatted)
          .setFooter({ text: 'To delete a rule, use !rules remove <number> (e.g. !rules remove 1)' })
          .setTimestamp();
        await message.reply({ embeds: [embed] }).catch(() => {});
        return true;
      }
      if (sub === 'remove' || sub === 'delete' || sub === 'rm') {
        const target = args.slice(1).join(' ').trim();
        if (!target) {
          await message.reply('⚠️ Please specify rule number or keyword to remove. Example: `!rules remove 1`. Use `!rules list` to see rule numbers.').catch(() => {});
          return true;
        }
        const res = await this.botMemory.removeDirective(message.guild, target);
        if (res.success) {
          await message.reply(`✅ **Rule Removed!**\n• Removed: "${res.removed}"\n• Remaining Rules: \`${res.remainingCount}\``).catch(() => {});
        } else {
          await message.reply(`❌ **Failed to remove rule:** ${res.error}`).catch(() => {});
        }
        return true;
      }
      if (sub === 'clear') {
        const res = await this.botMemory.removeDirective(message.guild, 'all');
        if (res.success) {
          await message.reply(`✅ **All custom rules cleared from memory!**`).catch(() => {});
        } else {
          await message.reply(`❌ **Failed to clear directives:** ${res.error}`).catch(() => {});
        }
        return true;
      }
      if (sub === 'add') {
        const instruction = args.slice(1).join(' ').trim();
        if (!instruction) {
          await message.reply('⚠️ Please provide directive text. Example: `!rules add Always be friendly to newcomers`').catch(() => {});
          return true;
        }
        const res = await this.botMemory.addDirective(message.guild, instruction, message.author);
        if (res.success) {
          await message.reply(`🧠 **Directive Learned & Saved to Memory!**\n• **Rule:** "${instruction}"\n• **Vault Channel:** ${res.channelId ? `<#${res.channelId}>` : '`#bot-rules`'}`).catch(() => {});
        } else {
          await message.reply(`❌ **Failed to save directive:** ${res.error}`).catch(() => {});
        }
        return true;
      }
      if (sub === 'view' || !sub) {
        const secDb = this.botMemory?.db?.security || this.botMemory?.configDb;
        const storedRules = secDb ? (secDb.get(`rules_${message.guild.id}`) ||
          '1. Respect all members and maintain civil discussions.\n2. No spam, unsolicited promotion, or malicious links.\n3. Keep media in respective showcase channels.\n4. Follow all Discord Terms of Service.') : 'No rules recorded.';
        const viewEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📜 Active Community Rules • ${message.guild.name}`)
          .setDescription(storedRules)
          .setFooter({ text: 'Use !rules update to refresh and post to #rules' })
          .setTimestamp();
        await message.reply({ embeds: [viewEmbed] }).catch(() => {});
        return true;
      }
    }

    // 5. !memory
    if (cmd === 'memory') {
      if (!this.botMemory) return false;
      if (sub === 'status' || !sub) {
        const vaultChan = message.guild.channels.cache.find(c => c.name && c.name.includes('bot-memory'));
        const rulesChan = message.guild.channels.cache.find(c => c.name && c.name.includes('bot-rules'));
        const directives = this.botMemory.getDirectivesList(message.guild.id);
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🧠 ${message.guild.name} Memory Vault Health`)
          .setDescription(
            `• **Vault Channel**: ${vaultChan ? `<#${vaultChan.id}>` : '`#bot-memory`'}\n` +
            `• **Rules Channel**: ${rulesChan ? `<#${rulesChan.id}>` : '`#bot-rules`'}\n` +
            `• **Active Directives**: \`${directives.length}\`\n` +
            `• **Memory Isolation**: 🔒 Strictly isolated to Guild ID \`${message.guild.id}\`\n` +
            `• **Bot Owner**: <@${botOwnerDisplay}> (Supreme Authority)`
          )
          .setTimestamp();
        await message.reply({ embeds: [embed] }).catch(() => {});
        return true;
      }
      if (sub === 'backup') {
        const waitMsg = await message.reply('💾 **Backing up guild state to #bot-memory...**').catch(() => null);
        const success = await this.botMemory.backupState(message.guild);
        if (waitMsg) await waitMsg.edit({ content: success ? '✅ **State backup complete and recorded in #bot-memory!**' : '⚠️ Backup completed with warnings.' }).catch(() => {});
        return true;
      }
    }

    // 6. !decorate
    if (cmd === 'decorate') {
      if (!this.decoration) return false;
      if (sub === 'apply') {
        const waitMsg = await message.reply('✨ **Applying non-destructive aesthetic makeover...**').catch(() => null);
        const res = await this.decoration.applyStyling(message.guild);
        if (waitMsg) await waitMsg.edit({ content: `💎 **Makeover Applied!**\nStyled \`${res.styledCategories}\` categories and \`${res.styledChannels}\` channels with 0 deletions.` }).catch(() => {});
        return true;
      }
    }

    // 7. !help
    if (cmd === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`⚡ ${message.guild.name} Server Commands`)
        .setDescription(
          `**👑 Bot Owner (<@${botOwnerDisplay}>) & Server Admin Commands:**\n\n` +
          `• \`!autopilot\` — Activate 100% Autonomous Auto-Pilot across the server\n` +
          `• \`!setup quick\` — Run 1-click core setup (Welcomer, Tickets, Honeypot, Logging)\n` +
          `• \`!setup roles\` — Deploy interactive reaction role panels in #roles\n` +
          `• \`!setup create-roles\` — Create all standard server roles automatically\n` +
          `• \`!scan server\` — Deep-scan channels, categories, roles & rules into bot memory\n` +
          `• \`!rules update\` — Publish and synchronize official guidelines in #rules\n` +
          `• \`!rules add <rule>\` — Add a new live directive for the bot to strictly obey\n` +
          `• \`!rules view\` — View current server rules in memory\n` +
          `• \`!memory status\` — Inspect server memory vault and isolation status\n` +
          `• \`!memory backup\` — Force immediate backup to #bot-memory\n` +
          `• \`!decorate apply\` — Non-destructively style category & channel names\n\n` +
          `🔒 *All commands work unconditionally for the Bot Owner even without server Admin role.*`
        )
        .setFooter({ text: `${message.guild.name} • Supreme Command Engine` })
        .setTimestamp();
      await message.reply({ embeds: [helpEmbed] }).catch(() => {});
      return true;
    }

    // 8. !dashboard / !cockpit
    if (cmd === 'dashboard' || cmd === 'cockpit') {
      await message.reply(`🎮 **EditX Server Cockpit & Management Screen:**\nRun \`npm run dashboard\` in your terminal to open your screen popup, or visit: http://localhost:${this.port}`).catch(() => {});
      return true;
    }

    return false;
  } catch (err) {
    console.error('[PREFIX COMMAND ERROR]', err);
    await message.reply(`❌ An error occurred executing this command: ${err.message || err}`).catch(() => {});
    return true;
  }
  }
}

module.exports = PrefixCommandsModule;

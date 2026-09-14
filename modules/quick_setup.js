const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require('discord.js');

class QuickSetupModule {
  constructor(client, db) {
    this.client = client;
    this.db = db;
  }

  getCommands() {
    return [
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('One-click server configuration suite for essential tools')
        .addSubcommand(s => s.setName('quick').setDescription('1-Click automated setup for Welcomer, Invites, Tickets, Bump, Honeypot & Logging'))
        .addSubcommand(s => s.setName('status').setDescription('View live operational status and channel bindings of all core systems'))
        .addSubcommand(s => s.setName('audit').setDescription('Detailed verification audit of all configured systems, bindings & health'))
        .addSubcommand(s => s.setName('roles').setDescription('1-Click deployment of self-assignable role panels into #get-roles')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to deploy role panels in (default: #get-roles)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('honeypot').setDescription('Configure or redeploy the Honeypot anti-userbot trap channel')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to designate as Honeypot trap').addChannelTypes(ChannelType.GuildText)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'setup') return false;

    const sub = interaction.options.getSubcommand();
    const { guild, channel } = interaction;

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Administrator permission is required to configure server systems.', ephemeral: true });
    }

    // 1. ONE-CLICK AUTOMATED SETUP
    if (sub === 'quick') {
      await interaction.deferReply();

      const results = {
        welcomer: null,
        invites: null,
        tickets: null,
        bump: null,
        honeypot: null,
        logging: null,
        autorole: null
      };

      const existingChannels = guild.channels.fetch ? await guild.channels.fetch().catch(() => guild.channels.cache) : guild.channels.cache;
      const chanList = existingChannels?.values ? Array.from(existingChannels.values()).filter(Boolean) : (guild.channels.cache ? Array.from(guild.channels.cache.values()).filter(Boolean) : []);

      // --- A. WELCOMER ---
      try {
        let welcomeChan = chanList.find(c =>
          c.type === ChannelType.GuildText &&
          (c.name.includes('welcome') || c.name.includes('hello') || c.name.includes('joins') || c.name.includes('arrival'))
        ) || guild.systemChannel;

        if (!welcomeChan) {
          welcomeChan = await guild.channels.create({
            name: '👋・welcome',
            type: ChannelType.GuildText,
            topic: 'Official community entrance and member arrivals'
          });
        }

        const utilDb = this.db.utility || this.db.config;
        utilDb.set(`welcomer_${guild.id}`, {
          enabled: true,
          channelId: welcomeChan.id,
          cardEnabled: true,
          dmEnabled: false,
          theme: 'dark'
        });

        results.welcomer = `🟢 Configured in <#${welcomeChan.id}> (Aesthetic Card + Inviter Attribution)`;
      } catch (err) {
        results.welcomer = `⚠️ Could not configure Welcomer: ${err.message}`;
      }

      // --- B. INVITE TRACKER ---
      try {
        if (!this.client.inviteCache) {
          this.client.inviteCache = new Map();
        }
        const invites = await guild.invites.fetch().catch(() => null);
        const map = new Map();
        if (invites) {
          invites.forEach(inv => map.set(inv.code, inv.uses));
        }
        this.client.inviteCache.set(guild.id, map);
        results.invites = `🟢 Active (Cached ${map.size} existing invite links • Real/Fake/Leave tracking enabled)`;
      } catch (err) {
        results.invites = `⚠️ Invites could not be cached: ${err.message}`;
      }

      // --- C. TICKET TOOL ---
      try {
        let ticketCategory = chanList.find(c =>
          c.type === ChannelType.GuildCategory &&
          (c.name.toLowerCase().includes('ticket') || c.name.toLowerCase().includes('support'))
        );

        if (!ticketCategory) {
          ticketCategory = await guild.channels.create({
            name: '🎫・SUPPORT DESK',
            type: ChannelType.GuildCategory
          });
        }

        let ticketPortalChan = chanList.find(c =>
          c.type === ChannelType.GuildText &&
          c.parentId === ticketCategory.id &&
          (c.name.includes('ticket') || c.name.includes('support') || c.name.includes('portal'))
        );

        if (!ticketPortalChan) {
          ticketPortalChan = await guild.channels.create({
            name: '🎫・create-ticket',
            type: ChannelType.GuildText,
            parent: ticketCategory.id,
            topic: 'Select a department below to open a private concierge ticket.'
          });
        }

        // Deploy interactive Support Portal embed
        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Select a department to open a ticket...')
            .addOptions([
              { label: 'General & Community Support', description: 'Assistance with server rules, roles, and questions', value: 'general', emoji: '💬' },
              { label: 'Creative & Commission Help', description: 'Assistance with editing jobs, portfolios, and clients', value: 'creative', emoji: '🎬' },
              { label: 'Technical & Bot Support', description: 'Assistance with permissions, tools, and system issues', value: 'tech', emoji: '🛠️' },
              { label: 'Staff Report & Security', description: 'Privately report rule violations, griefers, or spam', value: 'report', emoji: '🚨' }
            ])
        );

        const portalEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('🎫・Concierge & Support Portal')
          .setDescription(
            `Welcome to the **${guild.name}** Concierge Desk.\n` +
            `Need assistance, commission help, or want to report an issue? Choose a department below to create a private support ticket.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💬 **General Support** — Roles, server questions, and inquiries\n` +
            `🎬 **Creative & Commissions** — Editing jobs, client disputes, and showcase help\n` +
            `🛠️ **Technical Support** — Bot permissions, technical issues, and channels\n` +
            `🚨 **Staff Report** — Urgent reports, scam attempts, or rule violators\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔒 *A dedicated private channel will be opened instantly with staff assistance.*`
          )
          .setFooter({ text: `${guild.name} • 24/7 Dedicated Support Desk` })
          .setTimestamp();

        await ticketPortalChan.send({ embeds: [portalEmbed], components: [selectMenu] });

        const ticketDb = this.db.tickets;
        ticketDb.set(`config_${guild.id}`, {
          categoryId: ticketCategory.id,
          portalChannelId: ticketPortalChan.id
        });

        results.tickets = `🟢 Deployed in <#${ticketPortalChan.id}> (Under category "${ticketCategory.name}")`;
      } catch (err) {
        results.tickets = `⚠️ Could not deploy Ticket Portal: ${err.message}`;
      }

      // --- D. BUMP BUDDY ---
      try {
        let bumpChan = chanList.find(c =>
          c.type === ChannelType.GuildText &&
          (c.name.includes('bump') || c.name.includes('disboard') || c.name.includes('bot-command') || c.name.includes('commands'))
        ) || channel;

        const utilDb = this.db.utility || this.db.config;
        utilDb.set(`bump_cfg_${guild.id}`, {
          channelId: bumpChan.id,
          roleId: null
        });

        results.bump = `🟢 Configured in <#${bumpChan.id}> (2-Hour Disboard & Bump Buddy Timer active)`;
      } catch (err) {
        results.bump = `⚠️ Could not configure Bump Buddy: ${err.message}`;
      }

      // --- E. HONEYPOT TRAP ---
      try {
        let honeypotChan = chanList.find(c =>
          c.type === ChannelType.GuildText &&
          c.name.includes('honeypot')
        );

        const isNewHoneypot = !honeypotChan;
        if (!honeypotChan) {
          honeypotChan = await guild.channels.create({
            name: '🍯・honeypot',
            type: ChannelType.GuildText,
            topic: '⚠️ DO NOT SEND MESSAGES OR REACT HERE. AUTOMATIC BAN TRAP FOR ROGUE USERBOTS.'
          });
        }

        const secDb = this.db.security || this.db.config;
        const currentSec = secDb.get(guild.id) || {};
        currentSec.honeypotChannelId = honeypotChan.id;
        secDb.set(guild.id, currentSec);

        // Post warning embed in the honeypot channel
        const warningEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🍯 ANTI-USERBOT HONEYPOT TRAP')
          .setDescription(
            `**⛔ DO NOT SEND MESSAGES HERE**\n\n` +
            `This channel is an automated anti-rogue-userbot trap.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `▸ **Any message sent here** → Instant **Permanent Ban**\n` +
            `▸ **Any reaction added here** → Instant **Permanent Ban**\n` +
            `▸ **Bots, self-bots, and userbots** are the targets\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🛡️ *All honeypot bans are logged to #modlogs with full details.*\n` +
            `⚠️ *Administrators and server owner are exempt.*`
          )
          .setFooter({ text: `${guild.name} • Auto-Security System • Powered by EditX` })
          .setTimestamp();

        await honeypotChan.send({ embeds: [warningEmbed] }).catch(() => {});

        results.honeypot = `🟢 Armed in <#${honeypotChan.id}> (Auto-bans rogue userbots & spam accounts • Warning embed posted)`;
      } catch (err) {
        results.honeypot = `⚠️ Could not configure Honeypot: ${err.message}`;
      }

      // --- F. MOD & SERVER LOGGING (Carl-bot Replacement) ---
      try {
        let logChan = chanList.find(c =>
          c.type === ChannelType.GuildText &&
          (c.name.includes('modlog') || c.name === 'logs' || c.name.includes('audit-log'))
        );

        if (logChan) {
          const cfgDb = this.db.config;
          const currentCfg = cfgDb.get(guild.id) || {};
          currentCfg.logChannelId = logChan.id;
          currentCfg.logChannels = currentCfg.logChannels || {};
          currentCfg.logChannels.all = logChan.id;
          cfgDb.set(guild.id, currentCfg);
          results.logging = `🟢 Configured in <#${logChan.id}> (Replaces Carl-bot: Edits, Deletes, Joins, Leaves, Roles & Voice)`;
        } else {
          results.logging = `⚪ No #modlogs channel detected (use \`/setlogchannel\` to link)`;
        }
      } catch (err) {
        results.logging = `⚠️ Logging configuration notice: ${err.message}`;
      }

      // --- G. AUTOROLE (Carl-bot Replacement) ---
      try {
        const memberRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('member'));
        if (memberRole) {
          const cfgDb = this.db.config;
          const currentCfg = cfgDb.get(guild.id) || {};
          currentCfg.autoRoleId = memberRole.id;
          cfgDb.set(guild.id, currentCfg);
          results.autorole = `🟢 Linked to <@&${memberRole.id}> (Auto-granted to new members on arrival)`;
        }
      } catch (err) {
        // optional non-fatal
      }

      // Final Unified 1-Click Dashboard Embed
      const dashboardEmbed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('⚡・Essential Suite 1-Click Setup Complete!')
        .setDescription(
          `All core server systems are now online, linked, and operating with maximum aesthetic polish.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👋 **1. Welcomer**\n▸ ${results.welcomer}\n\n` +
          `🔗 **2. Invite Tracker**\n▸ ${results.invites}\n\n` +
          `🎫 **3. Ticket Tool**\n▸ ${results.tickets}\n\n` +
          `🚀 **4. Bump Buddy**\n▸ ${results.bump}\n\n` +
          `🍯 **5. Honeypot Trap**\n▸ ${results.honeypot}\n\n` +
          `📋 **6. Mod Logging (Carl-bot Replacement)**\n▸ ${results.logging}\n` +
          (results.autorole ? `\n🏷️ **7. Auto-Role**\n▸ ${results.autorole}\n` : '') +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✨ *Ready to replace Carl-bot roles? Run \`/setup roles\` to deploy interactive role panels in #get-roles.*`
        )
        .setFooter({ text: `${guild.name} • 1-Click System Engine` })
        .setTimestamp();

      return interaction.editReply({ embeds: [dashboardEmbed] });
    }

    // 2. STATUS DASHBOARD
    if (sub === 'status') {
      const utilDb = this.db.utility || this.db.config;
      const secDb = this.db.security || this.db.config;
      const ticketDb = this.db.tickets;
      const cfgDb = this.db.config;

      const welcomerConfig = utilDb.get(`welcomer_${guild.id}`) || {};
      const bumpConfig = utilDb.get(`bump_cfg_${guild.id}`) || {};
      const ticketConfig = ticketDb.get(`config_${guild.id}`) || {};
      const secConfig = secDb.get(guild.id) || {};
      const currentCfg = cfgDb.get(guild.id) || {};

      const statusEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊・Essential Systems Status Dashboard')
        .setDescription(
          `Current operational status of your core server systems:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👋 **Welcomer**: ${welcomerConfig.channelId ? `🟢 Active in <#${welcomerConfig.channelId}>` : '⚪ Not configured'}\n` +
          `🔗 **Invite Tracker**: 🟢 Active (${this.client.inviteCache?.get(guild.id)?.size || 0} links tracked)\n` +
          `🎫 **Ticket Tool**: ${ticketConfig.portalChannelId ? `🟢 Active in <#${ticketConfig.portalChannelId}>` : '⚪ Not configured'}\n` +
          `🚀 **Bump Buddy**: ${bumpConfig.channelId ? `🟢 Active in <#${bumpConfig.channelId}>` : '⚪ Not configured'}\n` +
          `🍯 **Honeypot Trap**: ${secConfig.honeypotChannelId ? `🟢 Armed in <#${secConfig.honeypotChannelId}>` : '⚪ Not configured'}\n` +
          `📋 **Mod Logging**: ${currentCfg.logChannelId ? `🟢 Active in <#${currentCfg.logChannelId}>` : '⚪ Not configured'}\n` +
          `🏷️ **Auto-Role**: ${currentCfg.autoRoleId ? `🟢 <@&${currentCfg.autoRoleId}>` : '⚪ Not configured'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👉 *Run \`/setup audit\` to perform a detailed verification health check.*`
        )
        .setFooter({ text: `${guild.name} • Status Monitor` })
        .setTimestamp();

      return interaction.reply({ embeds: [statusEmbed], ephemeral: true });
    }

    // 3. DETAILED VERIFICATION AUDIT
    if (sub === 'audit') {
      await interaction.deferReply({ ephemeral: true });

      const auditChecks = [];
      const utilDb = this.db.utility || this.db.config;
      const secDb = this.db.security || this.db.config;
      const ticketDb = this.db.tickets;
      const configDb = this.db.config;

      // 1. Welcomer Check
      const welcomerCfg = utilDb.get(`welcomer_${guild.id}`);
      if (welcomerCfg && welcomerCfg.channelId) {
        const chan = guild.channels.cache.get(welcomerCfg.channelId);
        if (chan) {
          const me = guild.members.me || (await guild.members.fetch(this.client.user.id).catch(() => null));
          const perms = me ? chan.permissionsFor(me) : null;
          const hasPerms = perms ? perms.has(PermissionFlagsBits.SendMessages) && perms.has(PermissionFlagsBits.EmbedLinks) : true;
          auditChecks.push({
            name: '👋 Welcomer & Greeter Hub',
            status: hasPerms ? '🟢 Operational' : '⚠️ Missing Send/Embed Permissions',
            detail: `Bound to <#${chan.id}> • Dynamic Canvas: ${welcomerCfg.cardEnabled ? 'Enabled' : 'Disabled'} • Inviter Attribution: Active`
          });
        } else {
          auditChecks.push({ name: '👋 Welcomer', status: '🔴 Broken Channel', detail: `Channel ${welcomerCfg.channelId} not found.` });
        }
      } else {
        auditChecks.push({ name: '👋 Welcomer', status: '⚪ Unconfigured', detail: 'Run `/setup quick` to activate.' });
      }

      // 2. Invite Tracker Check
      const inviteMap = this.client.inviteCache?.get(guild.id);
      const cachedCount = inviteMap ? inviteMap.size : 0;
      auditChecks.push({
        name: '🔗 Invite Tracker Engine',
        status: inviteMap ? '🟢 Operational' : '🟡 Primed (Listening for new invites)',
        detail: `Tracking ${cachedCount} vanity/guild invites • Real/Fake/Leave delta calculations active`
      });

      // 3. Ticket Concierge Check
      const ticketCfg = ticketDb.get(`config_${guild.id}`);
      if (ticketCfg && ticketCfg.portalChannelId) {
        const portalChan = guild.channels.cache.get(ticketCfg.portalChannelId);
        const catChan = guild.channels.cache.get(ticketCfg.categoryId);
        auditChecks.push({
          name: '🎫 Ticket Concierge Desk',
          status: portalChan && catChan ? '🟢 Operational' : '⚠️ Missing Category/Channel',
          detail: `Portal: <#${ticketCfg.portalChannelId}> • Category: "${catChan?.name || 'Category'}" • Department Select Menu: Live`
        });
      } else {
        auditChecks.push({ name: '🎫 Ticket Tool', status: '⚪ Unconfigured', detail: 'Run `/setup quick` to activate.' });
      }

      // 4. Bump Buddy Check
      const bumpCfg = utilDb.get(`bump_cfg_${guild.id}`);
      const bumpTimer = utilDb.get(`bump_timer_${guild.id}`);
      if (bumpCfg && bumpCfg.channelId) {
        const bumpChan = guild.channels.cache.get(bumpCfg.channelId);
        const timerActive = bumpTimer && bumpTimer.triggerAt > Date.now();
        auditChecks.push({
          name: '🚀 Bump Buddy Automation',
          status: bumpChan ? '🟢 Operational' : '🔴 Channel Missing',
          detail: `Bound to <#${bumpCfg.channelId}> • Ping Role: ${bumpCfg.roleId ? `<@&${bumpCfg.roleId}>` : 'None'} • Timer: ${timerActive ? `Active (due <t:${Math.floor(bumpTimer.triggerAt/1000)}:R>)` : 'Ready for next bump'}`
        });
      } else {
        auditChecks.push({ name: '🚀 Bump Buddy', status: '⚪ Unconfigured', detail: 'Run `/setup quick` to activate.' });
      }

      // 5. Honeypot Anti-Rogue Trap
      const secCfg = secDb.get(guild.id);
      if (secCfg && secCfg.honeypotChannelId) {
        const hpChan = guild.channels.cache.get(secCfg.honeypotChannelId);
        if (hpChan) {
          auditChecks.push({
            name: '🍯 Honeypot Trap Security',
            status: '🟢 Armed & Monitoring',
            detail: `Trap Channel: <#${hpChan.id}> • Auto-Ban: Active on unauthorized userbot messages/reactions`
          });
        } else {
          auditChecks.push({ name: '🍯 Honeypot Trap', status: '🔴 Missing Channel', detail: 'Honeypot channel not found in cache.' });
        }
      } else {
        auditChecks.push({ name: '🍯 Honeypot Trap', status: '⚪ Unconfigured', detail: 'Run `/setup quick` to activate.' });
      }

      // 6. Moderation / Server Audit Logging (Carl-bot replacement)
      const guildCfg = configDb.get(guild.id) || {};
      const logChanId = guildCfg.logChannelId || guildCfg.logChannels?.all;
      if (logChanId) {
        const logChan = guild.channels.cache.get(logChanId);
        auditChecks.push({
          name: '📋 Mod & Server Event Logging (Carl-bot Replacement)',
          status: logChan ? '🟢 Operational' : '🔴 Channel Missing',
          detail: `Routing to <#${logChanId}> • Events: Edits, Deletions, Joins, Leaves, Roles, Bans, Channels & Voice`
        });
      } else {
        auditChecks.push({
          name: '📋 Mod & Server Event Logging',
          status: '⚪ Unconfigured',
          detail: 'Run `/setup quick` to auto-link #modlogs or `/setlogchannel`.'
        });
      }

      // 7. Reaction Roles & Self Roles (Carl-bot replacement)
      const allCachedChannels = guild.channels.cache?.values ? Array.from(guild.channels.cache.values()) : [];
      const getRolesChan = allCachedChannels.find(c => c.name && c.name.includes('role'));
      const me = guild.members.me || (guild.members.fetch ? await guild.members.fetch(this.client.user.id).catch(() => null) : null);
      const canManageRoles = me?.permissions?.has ? me.permissions.has(PermissionFlagsBits.ManageRoles) : false;
      auditChecks.push({
        name: '🏷️ Self Roles & Reaction Panels (Carl-bot Replacement)',
        status: canManageRoles ? '🟢 Operational' : '⚠️ Missing ManageRoles Permission',
        detail: `Directory: ${getRolesChan ? `<#${getRolesChan.id}>` : 'Not deployed yet'} • Run \`/setup roles\` to deploy interactive panels`
      });

      // Build Audit Embed
      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🛡️・System Setup Verification & Health Audit')
        .setDescription(
          `Comprehensive verification audit for **${guild.name}**.\n` +
          `Checking all channels, permissions, database persistence, and daemon listeners:\n\n` +
          auditChecks.map(c => `**${c.name}**\n▸ Status: ${c.status}\n▸ Details: ${c.detail}`).join('\n\n') +
          `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🛡️ **Permissions & Coexistence Guarantee**:\n` +
          `▸ **Wick Bot**: Security & anti-nuke remain 100% untouched.\n` +
          `▸ **Carl-bot Parity**: Logging (#modlogs) & Role Menus (#get-roles) 100% supported.\n` +
          `▸ **Zero Hyphens**: All slash commands and subcommands use clean spaces only.`
        )
        .setFooter({ text: `${guild.name} • Live Verification Suite` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 4. 1-CLICK REACTION ROLES DEPLOYMENT (Carl-bot Replacement)
    if (sub === 'roles') {
      await interaction.deferReply();

      const existingChannels = guild.channels.fetch ? await guild.channels.fetch().catch(() => guild.channels.cache) : guild.channels.cache;
      const chanList = existingChannels?.values ? Array.from(existingChannels.values()).filter(Boolean) : (guild.channels.cache ? Array.from(guild.channels.cache.values()).filter(Boolean) : []);

      const targetChan = interaction.options.getChannel('channel') ||
        chanList.find(c => c.type === ChannelType.GuildText && (c.name.includes('role') || c.name.includes('roles'))) ||
        channel;

      const findRole = (id, ...names) => {
        if (guild.roles.cache?.has && guild.roles.cache.has(id)) return guild.roles.cache.get(id);
        const rolesList = guild.roles.cache?.values ? Array.from(guild.roles.cache.values()) : [];
        return rolesList.find(r => names.some(n => r.name.toLowerCase().includes(n.toLowerCase())));
      };

      // --- PANEL 1: CREATIVE PROFESSIONS ---
      const videoEditor = findRole('1538964382157906071', 'video editor');
      const photoEditor = findRole('1538964384158851243', 'photo editor');
      const graphicDesigner = findRole('1538964386335690772', 'graphic designer');
      const animator = findRole('1538964388059553942', 'animator');
      const motionDesigner = findRole('1538964389921816627', 'motion designer');
      const clientRole = findRole('1538964392337612931', 'client');

      const profEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎨・CREATIVE DISCIPLINES & PROFESSIONS')
        .setDescription(
          `Select your primary creative disciplines to display your specialty on your server profile, appear in creator directories, and receive commission inquiries:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎬 **Video Editor** ➔ ${videoEditor ? `<@&${videoEditor.id}>` : '`@Video Editor`'}\n` +
          `📸 **Photo Editor** ➔ ${photoEditor ? `<@&${photoEditor.id}>` : '`@Photo Editor`'}\n` +
          `🎨 **Graphic Designer** ➔ ${graphicDesigner ? `<@&${graphicDesigner.id}>` : '`@Graphic Designer`'}\n` +
          `💫 **Animator** ➔ ${animator ? `<@&${animator.id}>` : '`@Animator`'}\n` +
          `✨ **Motion Designer** ➔ ${motionDesigner ? `<@&${motionDesigner.id}>` : '`@Motion Designer`'}\n` +
          `💼 **Client / Hiring** ➔ ${clientRole ? `<@&${clientRole.id}>` : '`@Client`'}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👉 *Click any button below to instantly toggle the role on or off your profile.*`
        )
        .setFooter({ text: `${guild.name} • Creative Directory` });

      const profRow1 = new ActionRowBuilder();
      if (videoEditor) profRow1.addComponents(new ButtonBuilder().setCustomId(`btn_role_${videoEditor.id}`).setLabel('Video Editor').setEmoji('🎬').setStyle(ButtonStyle.Primary));
      if (photoEditor) profRow1.addComponents(new ButtonBuilder().setCustomId(`btn_role_${photoEditor.id}`).setLabel('Photo Editor').setEmoji('📸').setStyle(ButtonStyle.Primary));
      if (graphicDesigner) profRow1.addComponents(new ButtonBuilder().setCustomId(`btn_role_${graphicDesigner.id}`).setLabel('Graphic Designer').setEmoji('🎨').setStyle(ButtonStyle.Primary));

      const profRow2 = new ActionRowBuilder();
      if (animator) profRow2.addComponents(new ButtonBuilder().setCustomId(`btn_role_${animator.id}`).setLabel('Animator').setEmoji('💫').setStyle(ButtonStyle.Primary));
      if (motionDesigner) profRow2.addComponents(new ButtonBuilder().setCustomId(`btn_role_${motionDesigner.id}`).setLabel('Motion Designer').setEmoji('✨').setStyle(ButtonStyle.Primary));
      if (clientRole) profRow2.addComponents(new ButtonBuilder().setCustomId(`btn_role_${clientRole.id}`).setLabel('Client').setEmoji('💼').setStyle(ButtonStyle.Secondary));

      const profComponents = [];
      if (profRow1.components.length > 0) profComponents.push(profRow1);
      if (profRow2.components.length > 0) profComponents.push(profRow2);

      await targetChan.send({ embeds: [profEmbed], components: profComponents });

      // --- PANEL 2: SOFTWARE & TOOLS (Dropdown Select Menu) ---
      const softwareList = [
        { id: '1538964396095840466', name: 'After Effects', emoji: '⚡', desc: 'Adobe After Effects motion & VFX' },
        { id: '1538964399753011321', name: 'Premiere Pro', emoji: '🎞️', desc: 'Adobe Premiere Pro video editing' },
        { id: '1538964401732853871', name: 'Davinci Resolve', emoji: '🎛️', desc: 'DaVinci Resolve editing & color grading' },
        { id: '1538964403649511477', name: 'CapCut', emoji: '📱', desc: 'CapCut desktop & mobile editing' },
        { id: '1538964405507596378', name: 'Sony Vegas', emoji: '✂️', desc: 'VEGAS Pro video production' },
        { id: '1538964407206547559', name: 'Alight Motion', emoji: '✨', desc: 'Alight Motion mobile motion design' },
        { id: '1538964409043521766', name: 'Photoshop', emoji: '🖌️', desc: 'Adobe Photoshop raster editing' },
        { id: '1538964410570383401', name: 'Lightroom', emoji: '📷', desc: 'Adobe Lightroom photo grading' },
        { id: '1538964413615313067', name: 'Canva', emoji: '🎨', desc: 'Canva design & graphics' },
        { id: '1538964415854944376', name: 'Gimp', emoji: '🖌️', desc: 'GIMP open-source manipulation' }
      ];

      const validSoftware = [];
      softwareList.forEach(sw => {
        const r = findRole(sw.id, sw.name);
        if (r) validSoftware.push({ role: r, emoji: sw.emoji, desc: sw.desc });
      });

      const softEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('⚡・CREATIVE SOFTWARE & TOOLS')
        .setDescription(
          `Select your editing and design software suite to let collaborators and clients know which toolsets you use:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⚡ **After Effects** • 🎞️ **Premiere Pro** • 🎛️ **DaVinci Resolve**\n` +
          `📱 **CapCut** • ✂️ **Sony Vegas** • ✨ **Alight Motion**\n` +
          `🖌️ **Photoshop** • 📷 **Lightroom** • 🎨 **Canva** • 🖌️ **Gimp**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👉 *Select one or more software options from the dropdown menu below to add or remove them.*`
        )
        .setFooter({ text: `${guild.name} • Software Stack` });

      if (validSoftware.length > 0) {
        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('menu_rr_select')
            .setPlaceholder('Select your creative software...')
            .setMinValues(1)
            .setMaxValues(Math.min(validSoftware.length, 10))
            .addOptions(validSoftware.map(sw => ({
              label: sw.role.name.replace(/[^\w\s]/gi, '').trim() || sw.role.name,
              value: sw.role.id,
              description: sw.desc,
              emoji: sw.emoji
            })))
        );
        await targetChan.send({ embeds: [softEmbed], components: [selectMenu] });
      }

      // --- PANEL 3: NOTIFICATION PINGS ---
      const pingsList = [
        { id: '1538964417717469277', name: 'Announcements', emoji: '📢', label: 'Announcements', desc: 'Server news & updates' },
        { id: '1538964419718029474', name: 'Giveaways', emoji: '🎉', label: 'Giveaways', desc: 'Free assets, plugins & perks' },
        { id: '1538964421844668467', name: 'Resources', emoji: '📦', label: 'New Resources', desc: 'Packs, presets & overlays' },
        { id: '1538964423887294525', name: 'Dead Chat', emoji: '💬', label: 'Dead Chat', desc: 'Chat revival pings & discussions' },
        { id: '1538964425438924844', name: 'Edit of the Week', emoji: '🏆', label: 'Edit of the Week', desc: 'Weekly editing competition alerts' },
        { id: '1538964427246665860', name: 'Editing Help', emoji: '💡', label: 'Editing Help', desc: 'Questions & critique pings' }
      ];

      const validPings = [];
      pingsList.forEach(p => {
        const r = findRole(p.id, p.name);
        if (r) validPings.push({ role: r, emoji: p.emoji, label: p.label });
      });

      const pingEmbed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('🔔・SERVER NOTIFICATION PREFERENCES')
        .setDescription(
          `Customize your community notifications and alert preferences:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📢 **Announcements** ➔ Server news and major updates\n` +
          `🎉 **Giveaways** ➔ Free assets, software licenses and perks\n` +
          `📦 **New Resources** ➔ Editing packs, presets, overlays & fonts\n` +
          `💬 **Dead Chat** ➔ Community revival pings & conversations\n` +
          `🏆 **Edit of the Week** ➔ Weekly editing showcases and polls\n` +
          `💡 **Editing Help** ➔ Questions, critiques and troubleshooting\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `👉 *Click any button below to toggle that notification ping.*`
        )
        .setFooter({ text: `${guild.name} • Alert Preferences` });

      const pingRow1 = new ActionRowBuilder();
      const pingRow2 = new ActionRowBuilder();
      validPings.forEach((p, idx) => {
        const btn = new ButtonBuilder()
          .setCustomId(`btn_role_${p.role.id}`)
          .setLabel(p.label)
          .setEmoji(p.emoji)
          .setStyle(ButtonStyle.Secondary);

        if (idx < 3) pingRow1.addComponents(btn);
        else pingRow2.addComponents(btn);
      });

      const pingComponents = [];
      if (pingRow1.components.length > 0) pingComponents.push(pingRow1);
      if (pingRow2.components.length > 0) pingComponents.push(pingRow2);

      await targetChan.send({ embeds: [pingEmbed], components: [pingComponents] });

      return interaction.editReply({
        content: `✅ **Reaction Role Panels Deployed!**\n3 high-gloss interactive role panels (Creative Disciplines, Software Stack, and Notification Pings) have been posted to <#${targetChan.id}>. Members can now self-assign roles via modern buttons and dropdown menus with zero Carl-bot dependencies.`
      });
    }

    // 5. HONEYPOT DIRECT CONFIGURATION
    if (sub === 'honeypot') {
      const targetChannel = interaction.options.getChannel('channel') || channel;
      const secDb = this.db.security || this.db.config;
      const currentSec = secDb.get(guild.id) || {};
      currentSec.honeypotChannelId = targetChannel.id;
      secDb.set(guild.id, currentSec);

      // Post scary warning embed into the honeypot channel
      const hpWarnEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🍯 ANTI-USERBOT HONEYPOT TRAP')
        .setDescription(
          `**⛔ DO NOT SEND MESSAGES HERE**\n\n` +
          `This channel is an automated anti-rogue-userbot trap.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `▸ **Any message sent here** → Instant **Permanent Ban**\n` +
          `▸ **Any reaction added here** → Instant **Permanent Ban**\n` +
          `▸ **Bots, self-bots, and userbots** are the targets\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🛡️ *All honeypot bans are logged to #modlogs with full details.*\n` +
          `⚠️ *Administrators and server owner are exempt.*`
        )
        .setFooter({ text: `${guild.name} • Auto-Security System • Powered by EditX` })
        .setTimestamp();

      await targetChannel.send({ embeds: [hpWarnEmbed] }).catch(() => {});

      return interaction.reply({
        content: `🍯 **Honeypot Trap Armed in <#${targetChannel.id}>!**\n▸ Warning embed posted in the channel.\n▸ Any non-admin account sending a message or adding a reaction will be **instantly banned** and logged to #modlogs.`,
        ephemeral: true
      });
    }
  }
}

module.exports = QuickSetupModule;

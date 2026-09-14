const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

class RolesModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.config;
    this.rolesDb = db.roles;

    // Check temporary roles every minute
    setInterval(() => this.checkTempRoles(), 60 * 1000);
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('autorole').setDescription('Configure auto-roles given to new members on join')
        .addSubcommand(s => s.setName('set').setDescription('Set auto-role')
          .addRoleOption(o => o.setName('role').setDescription('Role to automatically assign').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Disable auto-role'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false),

      new SlashCommandBuilder().setName('stickyroles').setDescription('Toggle sticky roles (restore roles when members rejoin)')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable sticky roles').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false),

      new SlashCommandBuilder().setName('reactionroles').setDescription('Create interactive self-assignable role panels')
        .addSubcommand(s => s.setName('buttons').setDescription('Create button-based toggle role panel')
          .addRoleOption(o => o.setName('role1').setDescription('First role').setRequired(true))
          .addStringOption(o => o.setName('label1').setDescription('Label for first role').setRequired(true))
          .addRoleOption(o => o.setName('role2').setDescription('Second role'))
          .addStringOption(o => o.setName('label2').setDescription('Label for second role'))
          .addRoleOption(o => o.setName('role3').setDescription('Third role'))
          .addStringOption(o => o.setName('label3').setDescription('Label for third role'))
          .addRoleOption(o => o.setName('role4').setDescription('Fourth role'))
          .addStringOption(o => o.setName('label4').setDescription('Label for fourth role'))
          .addStringOption(o => o.setName('title').setDescription('Panel title')))
        .addSubcommand(s => s.setName('unique').setDescription('Create single-choice role panel (choosing one removes others)')
          .addRoleOption(o => o.setName('role1').setDescription('First role').setRequired(true))
          .addStringOption(o => o.setName('label1').setDescription('Label for first role').setRequired(true))
          .addRoleOption(o => o.setName('role2').setDescription('Second role').setRequired(true))
          .addStringOption(o => o.setName('label2').setDescription('Label for second role').setRequired(true))
          .addRoleOption(o => o.setName('role3').setDescription('Third role'))
          .addStringOption(o => o.setName('label3').setDescription('Label for third role'))
          .addRoleOption(o => o.setName('role4').setDescription('Fourth role'))
          .addStringOption(o => o.setName('label4').setDescription('Label for fourth role'))
          .addStringOption(o => o.setName('title').setDescription('Panel title')))
        .addSubcommand(s => s.setName('menu').setDescription('Create dropdown select menu reaction role panel')
          .addRoleOption(o => o.setName('role1').setDescription('First role').setRequired(true))
          .addStringOption(o => o.setName('label1').setDescription('Label for first role').setRequired(true))
          .addRoleOption(o => o.setName('role2').setDescription('Second role').setRequired(true))
          .addStringOption(o => o.setName('label2').setDescription('Label for second role').setRequired(true))
          .addRoleOption(o => o.setName('role3').setDescription('Third role'))
          .addStringOption(o => o.setName('label3').setDescription('Label for third role'))
          .addRoleOption(o => o.setName('role4').setDescription('Fourth role'))
          .addStringOption(o => o.setName('label4').setDescription('Label for fourth role'))
          .addStringOption(o => o.setName('placeholder').setDescription('Dropdown placeholder text')))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false),

      new SlashCommandBuilder().setName('temprole').setDescription('Assign a temporary role to a member with auto-removal')
        .addUserOption(o => o.setName('target').setDescription('Target member').setRequired(true))
        .addRoleOption(o => o.setName('role').setDescription('Role to grant').setRequired(true))
        .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setMinValue(1).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false),

      new SlashCommandBuilder().setName('levelrole').setDescription('Configure automatic role rewards for leveling milestones')
        .addSubcommand(s => s.setName('add').setDescription('Add level reward role')
          .addIntegerOption(o => o.setName('level').setDescription('Target level').setMinValue(1).setRequired(true))
          .addRoleOption(o => o.setName('role').setDescription('Role rewarded').setRequired(true)))
        .addSubcommand(s => s.setName('remove').setDescription('Remove level reward')
          .addIntegerOption(o => o.setName('level').setDescription('Target level').setRequired(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all configured level role rewards'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    const { commandName, options, guild } = interaction;
    const guildId = guild.id;

    if (commandName === 'autorole') {
      const sub = options.getSubcommand();
      const config = this.db.get(guildId) || {};

      if (sub === 'set') {
        const role = options.getRole('role');
        config.autoRoleId = role.id;
        this.db.set(guildId, config);
        return interaction.reply({ content: `✅ Auto-role set to <@&${role.id}> for new members.`, ephemeral: true });
      }
      if (sub === 'remove') {
        delete config.autoRoleId;
        this.db.set(guildId, config);
        return interaction.reply({ content: '✅ Auto-role has been disabled.', ephemeral: true });
      }
    }

    if (commandName === 'stickyroles') {
      const enabled = options.getBoolean('enabled');
      const config = this.db.get(guildId) || {};
      config.stickyRoles = enabled;
      this.db.set(guildId, config);
      return interaction.reply({ content: `✅ Sticky roles are now **${enabled ? 'Enabled' : 'Disabled'}**.`, ephemeral: true });
    }

    if (commandName === 'reactionroles') {
      const sub = options.getSubcommand();
      const roles = [];
      for (let i = 1; i <= 4; i++) {
        const role = options.getRole(`role${i}`);
        const label = options.getString(`label${i}`);
        if (role && label) roles.push({ role, label });
      }

      if (roles.length === 0) return interaction.reply({ content: '❌ Must provide at least one role and label.', ephemeral: true });

      if (sub === 'buttons') {
        const rawTitle = options.getString('title') || 'Self-Assignable Roles';
        const title = rawTitle.replace(/^🎭[・\s]*/, '');
        const embed = new EmbedBuilder().setColor(0x2B2D31)
          .setTitle(`🎭・${title}`)
          .setDescription(
            `Click the buttons below to toggle roles on your profile:\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            roles.map(r => `▸ **${r.label}** ➔ <@&${r.role.id}>`).join('\n') +
            `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({
            text: `${guild.name} Role Directory • Instant Profile Sync`,
            iconURL: (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
          });

        if (guild.iconURL && typeof guild.iconURL === 'function') {
          const icon = guild.iconURL({ dynamic: true, size: 128 });
          if (icon) embed.setThumbnail(icon);
        }

        const row = new ActionRowBuilder();
        roles.forEach(r => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_role_${r.role.id}`)
              .setLabel(r.label)
              .setEmoji('🏷️')
              .setStyle(ButtonStyle.Secondary)
          );
        });

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Luxury reaction role panel deployed.', ephemeral: true });
      }

      if (sub === 'unique') {
        const rawTitle = options.getString('title') || 'Unique Role Selection (Single Choice)';
        const title = rawTitle.replace(/^🎭[・\s]*/, '');
        const roleIds = roles.map(r => r.role.id).join(',');
        const embed = new EmbedBuilder().setColor(0x2B2D31)
          .setTitle(`🎭・${title}`)
          .setDescription(
            `Select one role from the category below. Choosing a new role automatically replaces your previous role:\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            roles.map(r => `▸ **${r.label}** ➔ <@&${r.role.id}>`).join('\n') +
            `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({
            text: `${guild.name} Exclusive Roles • Auto-Replacement Active`,
            iconURL: (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
          });

        if (guild.iconURL && typeof guild.iconURL === 'function') {
          const icon = guild.iconURL({ dynamic: true, size: 128 });
          if (icon) embed.setThumbnail(icon);
        }

        const row = new ActionRowBuilder();
        roles.forEach(r => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_uniq_${r.role.id}_grp_${roleIds}`)
              .setLabel(r.label)
              .setEmoji('🔘')
              .setStyle(ButtonStyle.Secondary)
          );
        });

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Unique single-choice reaction role panel deployed.', ephemeral: true });
      }

      if (sub === 'menu') {
        const placeholder = options.getString('placeholder') || 'Choose a role...';
        const embed = new EmbedBuilder().setColor(0x2B2D31)
          .setTitle('🎭・Role Selection Menu')
          .setDescription(
            `Select an option from the dropdown menu below to assign roles to your profile:\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            roles.map(r => `▸ **${r.label}** ➔ <@&${r.role.id}>`).join('\n') +
            `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          )
          .setFooter({
            text: `${guild.name} Role Directory • Dropdown Selection`,
            iconURL: (guild.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined
          });

        if (guild.iconURL && typeof guild.iconURL === 'function') {
          const icon = guild.iconURL({ dynamic: true, size: 128 });
          if (icon) embed.setThumbnail(icon);
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('menu_rr_select')
          .setPlaceholder(placeholder)
          .addOptions(roles.map(r => ({
            label: r.label,
            value: r.role.id,
            description: `Toggle @${r.role.name}`,
            emoji: '🏷️'
          })));

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Dropdown menu reaction role panel deployed.', ephemeral: true });
      }
    }

    if (commandName === 'temprole') {
      await interaction.deferReply({ ephemeral: true });
      const targetUser = options.getUser('target');
      const role = options.getRole('role');
      const minutes = options.getInteger('minutes');
      const member = await guild.members.fetch(targetUser.id).catch(() => null);

      if (!member) return interaction.editReply('❌ Member not found.');

      try {
        await member.roles.add(role);
        const tempKey = `temp_${guildId}_${targetUser.id}_${role.id}`;
        this.rolesDb.set(tempKey, {
          guildId,
          userId: targetUser.id,
          roleId: role.id,
          expireAt: Date.now() + minutes * 60000
        });

        return interaction.editReply(`✅ Granted <@&${role.id}> to <@${targetUser.id}> for **${minutes}m**.`);
      } catch (err) {
        return interaction.editReply(`❌ Failed: ${err.message}`);
      }
    }

    if (commandName === 'levelrole') {
      const sub = options.getSubcommand();
      const levelRolesKey = `levelroles_${guildId}`;
      const rewards = this.rolesDb.get(levelRolesKey) || {};

      if (sub === 'add') {
        const level = options.getInteger('level');
        const role = options.getRole('role');
        rewards[level] = role.id;
        this.rolesDb.set(levelRolesKey, rewards);
        return interaction.reply({ content: `✅ Level **${level}** will now automatically grant <@&${role.id}>.`, ephemeral: true });
      }

      if (sub === 'remove') {
        const level = options.getInteger('level');
        delete rewards[level];
        this.rolesDb.set(levelRolesKey, rewards);
        return interaction.reply({ content: `✅ Removed reward role for level **${level}**.`, ephemeral: true });
      }

      if (sub === 'list') {
        const entries = Object.entries(rewards);
        if (entries.length === 0) return interaction.reply({ content: 'No level roles configured yet.', ephemeral: true });
        const desc = entries.sort((a, b) => Number(a[0]) - Number(b[0])).map(([lvl, rid]) => `• **Level ${lvl}** ➔ <@&${rid}>`).join('\n');
        const embed = new EmbedBuilder().setTitle('🏆 Level Role Rewards').setColor(0xFFD700).setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    return false;
  }

  async handleInteraction(interaction) {
    const sendResponse = async (payload) => {
      const data = typeof payload === 'string' ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        if (typeof interaction.editReply === 'function') return interaction.editReply(data);
        if (typeof interaction.reply === 'function') return interaction.reply(data);
      } else {
        if (typeof interaction.reply === 'function') return interaction.reply(data);
        if (typeof interaction.editReply === 'function') return interaction.editReply(data);
      }
    };

    if (interaction.isButton()) {
      // 1. Normal Toggle Button
      if (interaction.customId.startsWith('btn_role_')) {
        if (typeof interaction.deferReply === 'function') await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const roleId = interaction.customId.replace('btn_role_', '');
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return sendResponse('❌ Role no longer exists on server.');

        const member = interaction.member;
        try {
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            return sendResponse(`➖ Removed **${role.name}** from your profile.`);
          } else {
            await member.roles.add(roleId);
            return sendResponse(`➕ Added **${role.name}** to your profile.`);
          }
        } catch (err) {
          return sendResponse(`❌ Error toggling role: ${err.message}`);
        }
      }

      // 2. Unique Mode Button
      if (interaction.customId.startsWith('btn_uniq_')) {
        if (typeof interaction.deferReply === 'function') await interaction.deferReply({ ephemeral: true }).catch(() => {});
        const parts = interaction.customId.split('_grp_');
        const roleId = parts[0].replace('btn_uniq_', '');
        const allGroupIds = parts[1].split(',');

        const targetRole = interaction.guild.roles.cache.get(roleId);
        if (!targetRole) return sendResponse('❌ Role no longer exists.');

        const member = interaction.member;
        try {
          // Remove all other roles in the unique group
          const rolesToRemove = allGroupIds.filter(id => id !== roleId && member.roles.cache.has(id));
          if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
          }

          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            return sendResponse(`➖ Removed **${targetRole.name}**.`);
          } else {
            await member.roles.add(roleId);
            return sendResponse(`✅ Assigned unique role **${targetRole.name}** (other group roles removed).`);
          }
        } catch (err) {
          return sendResponse(`❌ Error updating unique role: ${err.message}`);
        }
      }

      // 3. Verification Gate Button
      if (interaction.customId.startsWith('verify_grant_') || interaction.customId.startsWith('verify_btn_')) {
        if (typeof interaction.deferReply === 'function') await interaction.deferReply({ ephemeral: true }).catch(() => {});
        let roleId = interaction.customId.replace('verify_grant_', '').replace('verify_btn_', '');
        let role = interaction.guild.roles.cache.get(roleId);
        if (!role || roleId === 'default') {
          role = interaction.guild.roles.cache.find(r => r.name.includes('Members')) || interaction.guild.roles.cache.get('1538971908530511873');
        }

        if (!role) {
          return sendResponse('❌ Verified member role not found. Please contact an administrator.');
        }

        const member = interaction.member;
        if (member.roles.cache.has(role.id)) {
          return sendResponse('ℹ️ You are already verified on this server!');
        }

        try {
          await member.roles.add(role.id);
          return sendResponse(`🎉 **Verification Complete!** You have been granted the **${role.name}** role. Welcome to **${interaction.guild.name}**!`);
        } catch (err) {
          return sendResponse(`❌ Could not assign verified role. Ensure the bot role is positioned higher than <@&${role.id}>.`);
        }
      }
    }

    // 4. Dropdown Menu Select (Supports all customIds: role_menu_*, menu_rr_*, roles_*)
    if (interaction.isStringSelectMenu() && (
      interaction.customId === 'menu_rr_select' ||
      interaction.customId.startsWith('menu_rr_') ||
      interaction.customId.startsWith('role_menu_') ||
      interaction.customId.startsWith('roles_')
    )) {
      if (typeof interaction.deferReply === 'function') await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const member = interaction.member;
      const added = [];
      const removed = [];

      // Get all possible selectable role IDs from this dropdown menu
      const allSelectableRoleIds = interaction.component?.options ? interaction.component.options.map(o => o.value) : interaction.values;

      for (const roleId of allSelectableRoleIds) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) continue;
        const isSelected = interaction.values.includes(roleId);
        const hasRole = member.roles.cache.has(roleId);

        try {
          if (isSelected && !hasRole) {
            await member.roles.add(roleId);
            added.push(role.name);
          } else if (!isSelected && hasRole) {
            await member.roles.remove(roleId);
            removed.push(role.name);
          }
        } catch (err) {
          console.error(`[ROLE TOGGLE ERROR]`, err);
        }
      }

      const feedback = [];
      if (added.length > 0) feedback.push(`➕ Added: **${added.join(', ')}**`);
      if (removed.length > 0) feedback.push(`➖ Removed: **${removed.join(', ')}**`);
      if (feedback.length === 0) feedback.push('ℹ️ Your roles remain unchanged.');

      return sendResponse(feedback.join('\n'));
    }

    return false;
  }

  async handleMemberJoin(member) {
    if (!member || !member.guild) return;
    const guildConfig = this.db.get(member.guild.id) || {};

    // 1. Auto-Role (configured or auto-detected default member role)
    let roleId = guildConfig.autoRoleId;
    if (!roleId && member.guild.roles?.cache) {
      const roleList = Array.from(member.guild.roles.cache.values());
      const defaultRole = roleList.find(r =>
        ['member', 'members', 'community', 'verified', 'editor'].some(n => (r.name || '').toLowerCase() === n)
      );
      if (defaultRole) {
        roleId = defaultRole.id;
        guildConfig.autoRoleId = roleId;
        this.db.set(member.guild.id, guildConfig);
        console.log(`[AUTOROLE] Auto-detected and linked member role: @${defaultRole.name} (${defaultRole.id})`);
      }
    }

    if (roleId) {
      member.roles.add(roleId).catch(() => {});
    }

    // 2. Sticky Roles Restore
    if (guildConfig.stickyRoles) {
      const savedRoles = this.rolesDb.get(`sticky_${member.guild.id}_${member.id}`);
      if (savedRoles && Array.isArray(savedRoles)) {
        member.roles.add(savedRoles).catch(() => {});
      }
    }
  }

  async handleMemberLeave(member) {
    const guildConfig = this.db.get(member.guild.id) || {};
    if (guildConfig.stickyRoles) {
      const roleIds = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.id);
      this.rolesDb.set(`sticky_${member.guild.id}_${member.id}`, roleIds);
    }
  }

  async checkLevelUpRewards(member, newLevel) {
    const rewards = this.rolesDb.get(`levelroles_${member.guild.id}`) || {};
    const roleId = rewards[newLevel];
    if (roleId) {
      member.roles.add(roleId).catch(() => {});
    }
  }

  async checkTempRoles() {
    const now = Date.now();
    for (const [key, data] of this.rolesDb.entries()) {
      if (key.startsWith('temp_') && data.expireAt && data.expireAt <= now) {
        try {
          const guild = this.client.guilds.cache.get(data.guildId);
          if (guild) {
            const member = await guild.members.fetch(data.userId).catch(() => null);
            if (member && member.roles.cache.has(data.roleId)) {
              await member.roles.remove(data.roleId);
            }
          }
        } catch (e) {}
        this.rolesDb.delete(key);
      }
    }
  }
}

module.exports = RolesModule;

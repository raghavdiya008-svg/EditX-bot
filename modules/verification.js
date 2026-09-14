const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

class VerificationModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.verification;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('verify').setDescription('Server entry verification portal management')
        .addSubcommand(sub => sub.setName('setup').setDescription('Deploy interactive server entry verification portal')
          .addRoleOption(o => o.setName('role').setDescription('The verified member role to assign').setRequired(true))
          .addChannelOption(o => o.setName('channel').setDescription('Channel to deploy portal (defaults to current channel)'))
          .addStringOption(o => o.setName('title').setDescription('Custom panel title'))
          .addStringOption(o => o.setName('description').setDescription('Custom instructions'))
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'verify') return false;
    const sub = interaction.options.getSubcommand();
    if (sub !== 'setup') return false;

    const role = interaction.options.getRole('role');
    const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
    const rawTitle = interaction.options.getString('title') || 'Security Verification Gate';
    const title = rawTitle.replace(/^🛡️[・\s]*/, '');
    const customDesc = interaction.options.getString('description');

    const defaultDesc =
      `Welcome to **${interaction.guild.name}**!\n` +
      `To protect our community from automated spam and raids, all members must complete identity verification.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `▸ 📜 **Community Standards**: Adhere to all server guidelines and policies.\n` +
      `▸ 🔓 **Unlocked Role**: Grants <@&${role.id}> and reveals all community channels.\n` +
      `▸ ⚡ **Instant Verification**: Click the button below to verify immediately.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const embed = new EmbedBuilder()
      .setColor(0x10B981)
      .setTitle(`🛡️・${title}`)
      .setDescription(customDesc ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${customDesc}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : defaultDesc)
      .setFooter({
        text: `${interaction.guild.name} Security System • Anti-Raid Active`,
        iconURL: (interaction.guild.iconURL && typeof interaction.guild.iconURL === 'function') ? interaction.guild.iconURL({ dynamic: true }) : undefined
      });

    if (interaction.guild.iconURL && typeof interaction.guild.iconURL === 'function') {
      const icon = interaction.guild.iconURL({ dynamic: true, size: 128 });
      if (icon) embed.setThumbnail(icon);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`verify_btn_${role.id}`)
        .setLabel('Complete Verification')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Success)
    );

    try {
      await targetChannel.send({ embeds: [embed], components: [row] });
      this.db.set(`config_${interaction.guild.id}`, {
        roleId: role.id,
        channelId: targetChannel.id,
        createdAt: Date.now()
      });

      return interaction.reply({ content: `✅ Verification panel successfully deployed to <#${targetChannel.id}>. Target role: <@&${role.id}>.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `❌ Failed to deploy verification panel: ${err.message}`, ephemeral: true });
    }
  }

  async handleInteraction(interaction) {
    if (!interaction.isButton()) return false;

    if (interaction.customId.startsWith('verify_btn_')) {
      const roleId = interaction.customId.replace('verify_btn_', '');
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) {
        return interaction.reply({ content: '❌ The verification role no longer exists. Please contact an administrator.', ephemeral: true });
      }

      const member = interaction.member;
      if (member.roles.cache.has(roleId)) {
        return interaction.reply({ content: 'ℹ️ You are already verified on this server!', ephemeral: true });
      }

      try {
        await member.roles.add(role);
        return interaction.reply({ content: `🎉 **Verification Complete!** You have been granted the <@&${role.id}> role. Welcome to **${interaction.guild.name}**!`, ephemeral: true });
      } catch (err) {
        console.error('[VERIFICATION ERROR]', err);
        return interaction.reply({ content: `❌ Could not assign verified role. Ensure the bot's highest role is positioned above the <@&${role.id}> role.`, ephemeral: true });
      }
    }

    return false;
  }
}

module.exports = VerificationModule;

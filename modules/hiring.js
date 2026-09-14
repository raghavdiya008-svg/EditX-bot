const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

class HiringModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.hiring || db.utility;
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('hiring').setDescription('Manage and deploy the professional hiring & freelance portal')
        .addSubcommand(s => s.setName('setup').setDescription('Deploy the interactive 1-click job & freelance posting portal')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to deploy the portal (defaults to current)')))
        .addSubcommand(s => s.setName('template').setDescription('Display the official hiring and freelance posting rules'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
    ];
  }

  buildPortalEmbed(guild) {
    const serverName = guild?.name || 'Community';
    const serverIcon = (guild?.iconURL && typeof guild.iconURL === 'function') ? guild.iconURL({ dynamic: true }) : undefined;

    const embed = new EmbedBuilder()
      .setColor(0x6366F1)
      .setAuthor({ name: `${serverName} • Hiring & Freelance Hub`, iconURL: serverIcon })
      .setTitle('💼・COMMUNITY RECRUITMENT & FREELANCE PORTAL')
      .setDescription(
        `Welcome to the **${serverName}** Hiring & Freelance Desk.\n\n` +
        `To ensure the highest quality, safety, and organization, **direct chatting is disabled in this channel**.\n` +
        `Click one of the buttons below to open our official in-server form and publish your listing:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💼 **Post a Job (Hiring)**\n` +
        `▸ Looking to hire video editors, thumbnail designers, 3D artists, sound designers, or moderators.\n\n` +
        `🎨 **Post Freelance Services (For Hire)**\n` +
        `▸ Showcase your creative skills, portfolio links, rates, and service offerings to the community.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *All listings must specify fair budgets or pricing. Spam, scam links, and zero-effort posts are automatically removed.*`
      )
      .setFooter({ text: `${serverName} • Verified Recruitment Portal`, iconURL: serverIcon });

    if (serverIcon) {
      embed.setThumbnail(serverIcon);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hiring_modal_hiring')
        .setLabel('Post a Job (Hiring)')
        .setEmoji('💼')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('hiring_modal_forhire')
        .setLabel('Post Services (For Hire)')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
  }

  async handleCommand(interaction) {
    const { commandName, options, channel, guild } = interaction;
    if (commandName !== 'hiring') return false;

    const sub = options.getSubcommand();

    if (sub === 'setup') {
      const isStaff = interaction.member.permissions?.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions?.has(PermissionFlagsBits.Administrator);
      if (!isStaff) return interaction.reply({ content: '❌ You need `Manage Server` permission to deploy the hiring portal.', ephemeral: true });

      const targetChannel = options.getChannel('channel') || channel;

      const payload = this.buildPortalEmbed(guild);
      await targetChannel.send(payload);

      // Save configured channel ID to DB
      this.db.set(`hiring_chan_${guild.id}`, targetChannel.id);

      return interaction.reply({
        content: `✅ Hiring & Freelance Portal successfully deployed to <#${targetChannel.id}>!\nDirect chatting in this channel is now guarded and routed through the 1-click modal forms.`,
        ephemeral: true
      });
    }

    if (sub === 'template') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Hiring & Freelance Listing Standards')
        .setDescription(
          `**For Employers (Hiring):**\n` +
          `• **Role / Title**: Clear job position (e.g. Short-Form Video Editor)\n` +
          `• **Budget**: Specific dollar amount or hourly rate (e.g. \`$30/video\` or \`$25/hr\`)\n` +
          `• **Scope**: Detailed description of workload, turnaround times, and software needed\n` +
          `• **Contact**: Where to submit portfolios (DMs, Discord, or Email)\n\n` +
          `**For Creators (For Hire):**\n` +
          `• **Services**: What you specialize in (e.g. VFX, 3D Thumbnails, Color Grading)\n` +
          `• **Rates**: Base starting prices\n` +
          `• **Portfolio**: Link to Behance, YouTube, Google Drive, or Bento\n` +
          `• **Turnaround**: Delivery speed and revision terms`
        )
        .setFooter({ text: `${guild.name} Standards` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return false;
  }

  async handleInteraction(interaction) {
    // 1. Button Clicks (Open Modal)
    if (interaction.isButton()) {
      if (interaction.customId === 'hiring_modal_hiring') {
        const modal = new ModalBuilder()
          .setCustomId('hiring_submit_hiring')
          .setTitle('💼 Post a Job (Hiring)');

        const roleInput = new TextInputBuilder()
          .setCustomId('role')
          .setLabel('Job Position / Role Needed')
          .setPlaceholder('e.g. YouTube Video Editor, VFX Artist, Thumbnail Designer')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        const budgetInput = new TextInputBuilder()
          .setCustomId('budget')
          .setLabel('Budget / Compensation Rate')
          .setPlaceholder('e.g. $40-$60 per video, $500 fixed project, $25/hr')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Project Scope, Workload & Requirements')
          .setPlaceholder('Describe the project details, required software, style, and expectations...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true);

        const timelineInput = new TextInputBuilder()
          .setCustomId('timeline')
          .setLabel('Deadline / Project Timeline')
          .setPlaceholder('e.g. Within 48 hours, Ongoing monthly contract')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false);

        const contactInput = new TextInputBuilder()
          .setCustomId('contact')
          .setLabel('How to Apply / Contact Info')
          .setPlaceholder('e.g. DM me on Discord with your portfolio, or Email: ...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(200)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(roleInput),
          new ActionRowBuilder().addComponents(budgetInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(timelineInput),
          new ActionRowBuilder().addComponents(contactInput)
        );

        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId === 'hiring_modal_forhire') {
        const modal = new ModalBuilder()
          .setCustomId('hiring_submit_forhire')
          .setTitle('🎨 Post Services (For Hire)');

        const titleInput = new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Service / Skill Specialty')
          .setPlaceholder('e.g. Pro Thumbnail Artist & High CTR Packaging')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        const ratesInput = new TextInputBuilder()
          .setCustomId('rates')
          .setLabel('Pricing & Starting Rates')
          .setPlaceholder('e.g. Thumbnails from $25, Short edits from $45')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

        const portfolioInput = new TextInputBuilder()
          .setCustomId('portfolio')
          .setLabel('Portfolio / Showcase Link')
          .setPlaceholder('e.g. https://behance.net/..., https://youtube.com/...')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(250)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('About Your Skills, Experience & Software')
          .setPlaceholder('Detail your experience, software proficiency (Premiere, AE, Blender), and turnaround...')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true);

        const contactInput = new TextInputBuilder()
          .setCustomId('contact')
          .setLabel('Availability & Contact Preference')
          .setPlaceholder('e.g. DMs open, Available 20 hrs/week, Timezone: EST')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(150)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(ratesInput),
          new ActionRowBuilder().addComponents(portfolioInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(contactInput)
        );

        await interaction.showModal(modal);
        return true;
      }

      if (interaction.customId.startsWith('hiring_dm_')) {
        const targetUserId = interaction.customId.replace('hiring_dm_', '');
        return interaction.reply({
          content: `✉️ **Contact Poster**: You can send a direct message to <@${targetUserId}> (\`${targetUserId}\`) or refer to the contact details on their listing.`,
          ephemeral: true
        });
      }
    }

    // 2. Modal Submissions (Publish Listing)
    if (interaction.isModalSubmit()) {
      const user = interaction.user;
      const guild = interaction.guild;

      if (interaction.customId === 'hiring_submit_hiring') {
        const role = interaction.fields.getTextInputValue('role');
        const budget = interaction.fields.getTextInputValue('budget');
        const description = interaction.fields.getTextInputValue('description');
        const timeline = interaction.fields.getTextInputValue('timeline') || 'Flexible / As Agreed';
        const contact = interaction.fields.getTextInputValue('contact');

        const hiringChanId = this.db.get(`hiring_chan_${guild.id}`) || interaction.channel.id;
        const targetChan = guild.channels.cache.get(hiringChanId) || interaction.channel;

        const embed = new EmbedBuilder()
          .setColor(0x10B981) // Emerald Green
          .setAuthor({
            name: `💼 [HIRING] ${role}`,
            iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined
          })
          .setTitle(role)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💰 **Budget / Rate:** **${budget}**\n` +
            `👤 **Posted By:** <@${user.id}> (\`${user.username}\`)\n` +
            `⏱️ **Timeline:** \`${timeline}\`\n` +
            `📅 **Published:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📌 **Project Requirements & Scope:**\n` +
            `${description}\n\n` +
            `📬 **How to Apply:**\n` +
            `${contact}`
          )
          .setFooter({ text: `${guild.name} • Job Board • Click below to contact poster` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`hiring_dm_${user.id}`)
            .setLabel('Message Poster')
            .setEmoji('✉️')
            .setStyle(ButtonStyle.Secondary)
        );

        const postMsg = await targetChan.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

        // Auto-create thread for applicant discussions
        if (targetChan.type === ChannelType.GuildText && targetChan.threads) {
          try {
            await postMsg.startThread({
              name: `💼 Inquiries • ${role.slice(0, 30)} (${user.username})`,
              autoArchiveDuration: 1440
            });
          } catch (tErr) {}
        }

        return interaction.reply({
          content: `✅ Your **[HIRING]** listing for **${role}** has been published to <#${targetChan.id}>!`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'hiring_submit_forhire') {
        const title = interaction.fields.getTextInputValue('title');
        const rates = interaction.fields.getTextInputValue('rates');
        const portfolio = interaction.fields.getTextInputValue('portfolio');
        const description = interaction.fields.getTextInputValue('description');
        const contact = interaction.fields.getTextInputValue('contact');

        const forHireChanId = this.db.get(`forhire_chan_${guild.id}`) || interaction.channel.id;
        const targetChan = guild.channels.cache.get(forHireChanId) || interaction.channel;

        const embed = new EmbedBuilder()
          .setColor(0x6366F1) // Cyber Indigo
          .setAuthor({
            name: `🎨 [FOR HIRE] ${title}`,
            iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined
          })
          .setTitle(title)
          .setDescription(
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💵 **Starting Rates:** **${rates}**\n` +
            `👤 **Creator:** <@${user.id}> (\`${user.username}\`)\n` +
            `🔗 **Portfolio:** ${portfolio}\n` +
            `📅 **Published:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🎨 **Services & Skills:**\n` +
            `${description}\n\n` +
            `📬 **Contact & Availability:**\n` +
            `${contact}`
          )
          .setFooter({ text: `${guild.name} • Freelance Showcase • Click below to contact` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`hiring_dm_${user.id}`)
            .setLabel('Message Creator')
            .setEmoji('✉️')
            .setStyle(ButtonStyle.Secondary)
        );

        const postMsg = await targetChan.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });

        // Auto-create thread for inquiries
        if (targetChan.type === ChannelType.GuildText && targetChan.threads) {
          try {
            await postMsg.startThread({
              name: `🎨 Showcase • ${title.slice(0, 30)} (${user.username})`,
              autoArchiveDuration: 1440
            });
          } catch (tErr) {}
        }

        return interaction.reply({
          content: `✅ Your **[FOR HIRE]** listing for **${title}** has been published to <#${targetChan.id}>!`,
          ephemeral: true
        });
      }
    }

    return false;
  }

  async checkMessage(message) {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const hiringChanId = this.db.get(`hiring_chan_${guildId}`);
    const forHireChanId = this.db.get(`forhire_chan_${guildId}`);

    const isHiringChannel = (hiringChanId && message.channel.id === hiringChanId) ||
      (forHireChanId && message.channel.id === forHireChanId) ||
      (message.channel.name && (
        message.channel.name.includes('hiring') ||
        message.channel.name.includes('for-hire') ||
        message.channel.name.includes('job-postings') ||
        message.channel.name.includes('freelance-board')
      ));

    if (!isHiringChannel) return;

    // Staff/Admin exempt
    const isStaff = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
      message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      message.author.id === message.guild.ownerId;

    if (isStaff) return;

    // If message is in a Thread under the post, allow normal discussions
    if (typeof message.channel.isThread === 'function' && message.channel.isThread()) return;

    // Direct message sent to main channel: Delete and prompt to use buttons
    try {
      await message.delete().catch(() => {});
      const alert = await message.channel.send({
        content: `⚠️ <@${message.author.id}>, direct chatting in this channel is disabled to keep listings organized. Please click the **Post a Job** or **Post Services** button at the top of <#${message.channel.id}> to submit your listing!`
      }).catch(() => null);

      if (alert) {
        setTimeout(() => alert.delete().catch(() => {}), 6000);
      }
    } catch (e) {}
  }
}

module.exports = HiringModule;

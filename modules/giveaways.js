const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

class GiveawaysModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.giveaways;

    setInterval(() => this.checkGiveaways(), 15 * 1000);
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('giveaway').setDescription('Host and manage server giveaways')
        .addSubcommand(s => s.setName('start').setDescription('Start a new giveaway')
          .addStringOption(o => o.setName('prize').setDescription('Giveaway prize').setRequired(true))
          .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setMinValue(1).setRequired(true))
          .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(10)))
        .addSubcommand(s => s.setName('end').setDescription('End a giveaway immediately')
          .addStringOption(o => o.setName('message_id').setDescription('ID of the giveaway message').setRequired(true)))
        .addSubcommand(s => s.setName('reroll').setDescription('Reroll new winners for a finished giveaway')
          .addStringOption(o => o.setName('message_id').setDescription('ID of the giveaway message').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (interaction.commandName !== 'giveaway') return false;
    const sub = interaction.options.getSubcommand();
    const { channel, guild, user } = interaction;

    if (sub === 'start') {
      const prize = interaction.options.getString('prize');
      const minutes = interaction.options.getInteger('minutes');
      const winnersCount = interaction.options.getInteger('winners') || 1;
      const endsAt = Date.now() + minutes * 60000;

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(`**Prize:** **${prize}**\n**Winners:** ${winnersCount}\n**Hosted by:** <@${user.id}>\n\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R> (<t:${Math.floor(endsAt / 1000)}:f>)`)
        .setFooter({ text: 'Click the button below to participate!' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gw_enter').setLabel('🎉 Enter Giveaway (0)').setStyle(ButtonStyle.Success)
      );

      const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      this.db.set(`gw_${msg.id}`, {
        messageId: msg.id,
        channelId: channel.id,
        guildId: guild.id,
        prize,
        winnersCount,
        endsAt,
        hostedBy: user.id,
        entrants: [],
        ended: false
      });

      return true;
    }

    if (sub === 'end') {
      const msgId = interaction.options.getString('message_id');
      const gw = this.db.get(`gw_${msgId}`);
      if (!gw) return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
      if (gw.ended) return interaction.reply({ content: '❌ Giveaway has already ended.', ephemeral: true });

      await this.endGiveaway(gw);
      return interaction.reply({ content: '✅ Giveaway ended.', ephemeral: true });
    }

    if (sub === 'reroll') {
      const msgId = interaction.options.getString('message_id');
      const gw = this.db.get(`gw_${msgId}`);
      if (!gw) return interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });

      if (gw.entrants.length === 0) {
        return interaction.reply({ content: '❌ No entrants in this giveaway.', ephemeral: true });
      }

      const winners = this.pickWinners(gw.entrants, gw.winnersCount);
      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

      const chan = await this.client.channels.fetch(gw.channelId).catch(() => null);
      if (chan) {
        chan.send(`🎉 **GIVEAWAY REROLL:** Congratulations ${winnerMentions}! You won **${gw.prize}**!`);
      }
      return interaction.reply({ content: `✅ Rerolled new winner(s): ${winnerMentions}`, ephemeral: true });
    }

    return false;
  }

  async handleInteraction(interaction) {
    if (!interaction.isButton()) return false;

    if (interaction.customId === 'gw_enter') {
      const msgId = interaction.message.id;
      const gw = this.db.get(`gw_${msgId}`);
      if (!gw) return interaction.reply({ content: '❌ Giveaway ended or not found.', ephemeral: true });
      if (gw.ended) return interaction.reply({ content: '❌ This giveaway has already ended.', ephemeral: true });

      const uid = interaction.user.id;
      if (gw.entrants.includes(uid)) {
        gw.entrants = gw.entrants.filter(id => id !== uid);
        this.db.set(`gw_${msgId}`, gw);
        await this.updateGiveawayButton(interaction.message, gw);
        return interaction.reply({ content: '❌ You left the giveaway.', ephemeral: true });
      } else {
        gw.entrants.push(uid);
        this.db.set(`gw_${msgId}`, gw);
        await this.updateGiveawayButton(interaction.message, gw);
        return interaction.reply({ content: '🎉 You successfully entered the giveaway!', ephemeral: true });
      }
    }
    return false;
  }

  async updateGiveawayButton(message, gw) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gw_enter').setLabel(`🎉 Enter Giveaway (${gw.entrants.length})`).setStyle(ButtonStyle.Success)
    );
    await message.edit({ components: [row] }).catch(() => {});
  }

  pickWinners(entrants, count) {
    const shuffled = [...entrants].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async endGiveaway(gw) {
    gw.ended = true;
    this.db.set(`gw_${gw.messageId}`, gw);

    const chan = await this.client.channels.fetch(gw.channelId).catch(() => null);
    if (!chan) return;
    const msg = await chan.messages.fetch(gw.messageId).catch(() => null);

    if (gw.entrants.length === 0) {
      if (msg) {
        const embed = EmbedBuilder.from(msg.embeds[0])
          .setColor(0xED4245)
          .setTitle('🎉 GIVEAWAY ENDED 🎉')
          .setDescription(`**Prize:** **${gw.prize}**\n**Winner:** No valid entrants.`);
        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      }
      chan.send(`❌ No one entered the giveaway for **${gw.prize}**.`);
      return;
    }

    const winners = this.pickWinners(gw.entrants, gw.winnersCount);
    const winnerMentions = winners.map(id => `<@${id}>`).join(', ');

    if (msg) {
      const embed = EmbedBuilder.from(msg.embeds[0])
        .setColor(0x57F287)
        .setTitle('🎉 GIVEAWAY ENDED 🎉')
        .setDescription(`**Prize:** **${gw.prize}**\n**Winner(s):** ${winnerMentions}\n**Hosted by:** <@${gw.hostedBy}>`);
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    await chan.send(`🎊 Congratulations ${winnerMentions}! You won the giveaway for **${gw.prize}**! 🎁`).catch(() => {});
  }

  async checkGiveaways() {
    try {
      if (!this.db || typeof this.db.entries !== 'function') return;
      const now = Date.now();
      for (const [key, gw] of this.db.entries()) {
        if (key.startsWith('gw_') && gw && !gw.ended && gw.endsAt && gw.endsAt <= now) {
          await this.endGiveaway(gw).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[GIVEAWAYS CHECK ERROR]', err.message);
    }
  }
}

module.exports = GiveawaysModule;

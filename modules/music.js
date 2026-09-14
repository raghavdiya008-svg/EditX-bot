const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

class MusicModule {
  constructor(client) {
    this.client = client;
    this.queues = new Map();
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('play').setDescription('Stream audio from YouTube, SoundCloud, or Spotify into voice')
        .addStringOption(o => o.setName('query').setDescription('Song name or direct URL').setRequired(true))
        .setDMPermission(false),
      new SlashCommandBuilder().setName('skip').setDescription('Skip the currently playing track')
        .setDMPermission(false),
      new SlashCommandBuilder().setName('pause').setDescription('Pause audio playback')
        .setDMPermission(false),
      new SlashCommandBuilder().setName('resume').setDescription('Resume audio playback')
        .setDMPermission(false),
      new SlashCommandBuilder().setName('stop').setDescription('Stop audio playback and clear queue')
        .setDMPermission(false),
      new SlashCommandBuilder().setName('queue').setDescription('View current song queue')
        .setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    if (!['play', 'skip', 'pause', 'resume', 'stop', 'queue'].includes(interaction.commandName)) return false;

    const guildId = interaction.guild.id;
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (interaction.commandName === 'play') {
      if (!voiceChannel) {
        return interaction.reply({ content: '❌ You must be in a voice channel to play music.', ephemeral: true });
      }

      const query = interaction.options.getString('query');
      await interaction.deferReply();

      try {
        const searchResult = await play.search(query, { limit: 1 });
        if (!searchResult || searchResult.length === 0) {
          return interaction.editReply('❌ No search results found.');
        }

        const songInfo = searchResult[0];
        const song = {
          title: songInfo.title,
          url: songInfo.url,
          duration: songInfo.durationRaw || 'Live',
          thumbnail: songInfo.thumbnails[0]?.url,
          requester: interaction.user
        };

        if (!this.queues.has(guildId)) {
          const queueConstruct = {
            textChannel: interaction.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            player: null,
            inactivityTimer: null
          };

          this.queues.set(guildId, queueConstruct);
          queueConstruct.songs.push(song);

          try {
            const connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            queueConstruct.connection = connection;

            connection.on(VoiceConnectionStatus.Disconnected, () => {
              try { connection.destroy(); } catch (e) {}
              this.queues.delete(guildId);
            });

            this.playSong(guildId, queueConstruct.songs[0]);

            const embed = new EmbedBuilder().setColor(0x57F287)
              .setTitle('🎶 Added to Queue')
              .setDescription(`[${song.title}](${song.url})`)
              .setThumbnail(song.thumbnail)
              .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true }
              );

            return interaction.editReply({ embeds: [embed] });
          } catch (err) {
            console.error('[VOICE JOIN ERROR]', err);
            this.queues.delete(guildId);
            return interaction.editReply('❌ Failed to join voice channel.');
          }
        } else {
          const queue = this.queues.get(guildId);
          queue.songs.push(song);

          // Clear inactivity timer if active
          if (queue.inactivityTimer) {
            clearTimeout(queue.inactivityTimer);
            queue.inactivityTimer = null;
          }

          const embed = new EmbedBuilder().setColor(0x5865F2)
            .setTitle('🎶 Queued Track')
            .setDescription(`[${song.title}](${song.url})`)
            .setThumbnail(song.thumbnail)
            .addFields(
              { name: 'Position', value: `${queue.songs.length}`, inline: true },
              { name: 'Duration', value: song.duration, inline: true }
            );

          return interaction.editReply({ embeds: [embed] });
        }
      } catch (error) {
        console.error('[PLAY ERROR]', error);
        return interaction.editReply('❌ An error occurred during audio stream retrieval.');
      }
    }

    if (interaction.commandName === 'skip') {
      const serverQueue = this.queues.get(guildId);
      if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply({ content: '❌ No songs currently in queue.', ephemeral: true });
      }
      if (!voiceChannel || voiceChannel.id !== serverQueue.voiceChannel.id) {
        return interaction.reply({ content: '❌ You must be in the same voice channel to control playback.', ephemeral: true });
      }

      serverQueue.player.stop();
      return interaction.reply('⏭️ Skipped current track.');
    }

    if (interaction.commandName === 'pause') {
      const serverQueue = this.queues.get(guildId);
      if (!serverQueue || !serverQueue.player) return interaction.reply({ content: '❌ Nothing is currently playing.', ephemeral: true });
      serverQueue.player.pause();
      return interaction.reply('⏸️ Audio playback paused.');
    }

    if (interaction.commandName === 'resume') {
      const serverQueue = this.queues.get(guildId);
      if (!serverQueue || !serverQueue.player) return interaction.reply({ content: '❌ Nothing is currently playing.', ephemeral: true });
      serverQueue.player.unpause();
      return interaction.reply('▶️ Audio playback resumed.');
    }

    if (interaction.commandName === 'stop') {
      const serverQueue = this.queues.get(guildId);
      if (!serverQueue) return interaction.reply({ content: '❌ No active music session.', ephemeral: true });

      serverQueue.songs = [];
      if (serverQueue.player) serverQueue.player.stop();
      if (serverQueue.connection) serverQueue.connection.destroy();
      this.queues.delete(guildId);

      return interaction.reply('🛑 Playback stopped and queue cleared.');
    }

    if (interaction.commandName === 'queue') {
      const serverQueue = this.queues.get(guildId);
      if (!serverQueue || serverQueue.songs.length === 0) {
        return interaction.reply('📭 The music queue is currently empty.');
      }

      const queueString = serverQueue.songs.slice(0, 10).map((song, i) => {
        return `**${i === 0 ? '▶️ Now Playing' : `${i}.`}** [${song.title}](${song.url}) | \`${song.duration}\` | <@${song.requester.id}>`;
      }).join('\n');

      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('📜 Server Audio Queue')
        .setDescription(queueString);

      if (serverQueue.songs.length > 10) {
        embed.setFooter({ text: `...and ${serverQueue.songs.length - 10} more songs in queue.` });
      }

      return interaction.reply({ embeds: [embed] });
    }

    return false;
  }

  async playSong(guildId, song) {
    const serverQueue = this.queues.get(guildId);
    if (!serverQueue) return;

    if (!song) {
      serverQueue.inactivityTimer = setTimeout(() => {
        const sq = this.queues.get(guildId);
        if (sq && sq.songs.length === 0) {
          try { sq.connection.destroy(); } catch (e) {}
          this.queues.delete(guildId);
        }
      }, 60000);
      return;
    }

    try {
      const stream = await play.stream(song.url);
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
      });

      player.play(resource);
      serverQueue.connection.subscribe(player);
      serverQueue.player = player;

      player.on(AudioPlayerStatus.Idle, () => {
        const sq = this.queues.get(guildId);
        if (!sq) return;
        sq.songs.shift();
        this.playSong(guildId, sq.songs[0]);
      });

      player.on('error', error => {
        console.error('[AUDIO PLAYER ERROR]', error);
        const sq = this.queues.get(guildId);
        if (!sq) return;
        sq.textChannel.send(`❌ Playback error on **${song.title}**. Skipping...`).catch(() => {});
        sq.songs.shift();
        this.playSong(guildId, sq.songs[0]);
      });

      const embed = new EmbedBuilder().setColor(0x57F287)
        .setTitle('🎶 Now Playing')
        .setDescription(`[${song.title}](${song.url})`)
        .setThumbnail(song.thumbnail)
        .addFields({ name: 'Duration', value: song.duration, inline: true });

      serverQueue.textChannel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.error('[STREAM ERROR]', err);
      const sq = this.queues.get(guildId);
      if (!sq) return;
      sq.songs.shift();
      this.playSong(guildId, sq.songs[0]);
    }
  }
}

module.exports = MusicModule;

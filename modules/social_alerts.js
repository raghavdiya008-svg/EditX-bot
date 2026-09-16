const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Parser = require('rss-parser');
const rssParser = new Parser({
  headers: { 'User-Agent': 'OmniBot/5.0 (Discord Bot)' }
});

class SocialAlertsModule {
  constructor(client, db) {
    this.client = client;
    this.db = db.social;

    // Check feeds every 5 minutes
    setInterval(() => this.checkFeeds(), 5 * 60 * 1000);
  }

  getCommands() {
    return [
      new SlashCommandBuilder().setName('alert').setDescription('Configure automated social media, stream, and RSS notifications')
        .addSubcommandGroup(g => g.setName('youtube').setDescription('Automated YouTube upload notifications')
          .addSubcommand(s => s.setName('add').setDescription('Add YouTube channel alert')
            .addStringOption(o => o.setName('channel_id').setDescription('YouTube Channel ID (e.g. UCxxxxxxxx)').setRequired(true))
            .addChannelOption(o => o.setName('discord_channel').setDescription('Discord channel to post notifications').addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName('custom_message').setDescription('Custom message (e.g. @everyone New video from {author}!)')))
          .addSubcommand(s => s.setName('remove').setDescription('Remove YouTube channel alert')
            .addStringOption(o => o.setName('channel_id').setDescription('YouTube Channel ID').setRequired(true)))
          .addSubcommand(s => s.setName('list').setDescription('List active YouTube alerts')))
        .addSubcommandGroup(g => g.setName('reddit').setDescription('Automated Reddit subreddit post alerts')
          .addSubcommand(s => s.setName('add').setDescription('Add Subreddit post alert')
            .addStringOption(o => o.setName('subreddit').setDescription('Subreddit name (e.g. gaming, news)').setRequired(true))
            .addChannelOption(o => o.setName('discord_channel').setDescription('Discord channel to post updates').addChannelTypes(ChannelType.GuildText).setRequired(true)))
          .addSubcommand(s => s.setName('remove').setDescription('Remove Subreddit alert')
            .addStringOption(o => o.setName('subreddit').setDescription('Subreddit name').setRequired(true)))
          .addSubcommand(s => s.setName('list').setDescription('List active Subreddit alerts')))
        .addSubcommandGroup(g => g.setName('twitch').setDescription('Automated Twitch streamer live alerts')
          .addSubcommand(s => s.setName('add').setDescription('Add Twitch stream alert')
            .addStringOption(o => o.setName('streamer').setDescription('Twitch streamer username').setRequired(true))
            .addChannelOption(o => o.setName('discord_channel').setDescription('Discord channel to post alerts').addChannelTypes(ChannelType.GuildText).setRequired(true))
            .addStringOption(o => o.setName('custom_message').setDescription('Custom message (e.g. @everyone {streamer} is live!)')))
          .addSubcommand(s => s.setName('remove').setDescription('Remove Twitch streamer alert')
            .addStringOption(o => o.setName('streamer').setDescription('Streamer username').setRequired(true)))
          .addSubcommand(s => s.setName('list').setDescription('List active Twitch streamer alerts')))
        .addSubcommandGroup(g => g.setName('rss').setDescription('Automated RSS feed notifications')
          .addSubcommand(s => s.setName('add').setDescription('Add RSS feed alert')
            .addStringOption(o => o.setName('feed_url').setDescription('Direct RSS/Atom feed URL').setRequired(true))
            .addChannelOption(o => o.setName('discord_channel').setDescription('Discord channel to post updates').addChannelTypes(ChannelType.GuildText).setRequired(true)))
          .addSubcommand(s => s.setName('remove').setDescription('Remove RSS feed alert')
            .addStringOption(o => o.setName('feed_url').setDescription('Feed URL').setRequired(true)))
          .addSubcommand(s => s.setName('list').setDescription('List active RSS alerts')))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    ];
  }

  async handleCommand(interaction) {
    const { commandName, options, guild } = interaction;
    const guildId = guild.id;
    let group = null;
    let sub = null;
    try { group = options.getSubcommandGroup(false); } catch (e) {}
    try { sub = options.getSubcommand(false); } catch (e) {}

    const isYoutube = commandName === 'youtube-alert' || (commandName === 'alert' && group === 'youtube');
    const isReddit = commandName === 'reddit-alert' || (commandName === 'alert' && group === 'reddit');
    const isTwitch = commandName === 'twitch-alert' || (commandName === 'alert' && group === 'twitch');
    const isRss = commandName === 'rss-alert' || (commandName === 'alert' && group === 'rss');

    if (isYoutube) {
      const sub = options.getSubcommand();
      const ytKey = `yt_${guildId}`;
      const alerts = this.db.get(ytKey) || [];

      if (sub === 'add') {
        const channelId = options.getString('channel_id').trim();
        const discordChannel = options.getChannel('discord_channel');
        const customMessage = options.getString('custom_message') || '📢 **{author}** just uploaded a new video!\n{url}';

        await interaction.deferReply({ ephemeral: true });

        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        try {
          const feed = await rssParser.parseURL(feedUrl);
          const authorName = feed.title || channelId;
          const latestId = feed.items[0]?.id || feed.items[0]?.link || '';

          const filtered = alerts.filter(a => a.channelId !== channelId);
          filtered.push({
            channelId,
            authorName,
            feedUrl,
            discordChannelId: discordChannel.id,
            customMessage,
            lastVideoId: latestId
          });

          this.db.set(ytKey, filtered);
          return interaction.editReply(`✅ Added YouTube notification for **${authorName}** in <#${discordChannel.id}>.`);
        } catch (err) {
          return interaction.editReply(`❌ Could not fetch YouTube feed for Channel ID \`${channelId}\`. Please check that the ID is valid.`);
        }
      }

      if (sub === 'remove') {
        const channelId = options.getString('channel_id').trim();
        const filtered = alerts.filter(a => a.channelId !== channelId);
        if (filtered.length === alerts.length) {
          return interaction.reply({ content: `❌ No alert found for YouTube Channel ID \`${channelId}\`.`, ephemeral: true });
        }
        this.db.set(ytKey, filtered);
        return interaction.reply({ content: `✅ Removed YouTube alert for ID \`${channelId}\`.`, ephemeral: true });
      }

      if (sub === 'list') {
        if (alerts.length === 0) return interaction.reply({ content: '📭 No YouTube alerts configured for this server.', ephemeral: true });

        const desc = alerts.map((a, i) => `**${i + 1}.** **${a.authorName}** (\`${a.channelId}\`) ➔ <#${a.discordChannelId}>`).join('\n');
        const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('📺 Active YouTube Alerts').setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (isReddit) {
      const sub = options.getSubcommand();
      const redKey = `reddit_${guildId}`;
      const alerts = this.db.get(redKey) || [];

      if (sub === 'add') {
        const subreddit = options.getString('subreddit').replace(/^r\//i, '').trim();
        const discordChannel = options.getChannel('discord_channel');
        const feedUrl = `https://www.reddit.com/r/${subreddit}/new/.rss`;

        await interaction.deferReply({ ephemeral: true });
        try {
          const feed = await rssParser.parseURL(feedUrl);
          const latestId = feed.items[0]?.link || feed.items[0]?.id || '';

          const filtered = alerts.filter(a => a.subreddit.toLowerCase() !== subreddit.toLowerCase());
          filtered.push({
            subreddit,
            feedUrl,
            discordChannelId: discordChannel.id,
            lastPostId: latestId
          });

          this.db.set(redKey, filtered);
          return interaction.editReply(`✅ Added Subreddit alert for **r/${subreddit}** in <#${discordChannel.id}>.`);
        } catch (err) {
          return interaction.editReply(`❌ Could not fetch posts from **r/${subreddit}**. Ensure the subreddit is public.`);
        }
      }

      if (sub === 'remove') {
        const subreddit = options.getString('subreddit').replace(/^r\//i, '').trim();
        const filtered = alerts.filter(a => a.subreddit.toLowerCase() !== subreddit.toLowerCase());
        if (filtered.length === alerts.length) {
          return interaction.reply({ content: `❌ No alert found for **r/${subreddit}**.`, ephemeral: true });
        }
        this.db.set(redKey, filtered);
        return interaction.reply({ content: `✅ Removed alert for **r/${subreddit}**.`, ephemeral: true });
      }

      if (sub === 'list') {
        if (alerts.length === 0) return interaction.reply({ content: '📭 No Subreddit alerts configured for this server.', ephemeral: true });
        const desc = alerts.map((a, i) => `**${i + 1}.** **r/${a.subreddit}** ➔ <#${a.discordChannelId}>`).join('\n');
        const embed = new EmbedBuilder().setColor(0xFF5700).setTitle('🤖 Active Reddit Subreddit Alerts').setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (isTwitch) {
      const sub = options.getSubcommand();
      const twKey = `twitch_${guildId}`;
      const alerts = this.db.get(twKey) || [];

      if (sub === 'add') {
        const streamer = options.getString('streamer').toLowerCase().trim();
        const discordChannel = options.getChannel('discord_channel');
        const customMessage = options.getString('custom_message') || '🟣 **{streamer}** is now LIVE on Twitch!\nhttps://twitch.tv/{streamer}';

        const filtered = alerts.filter(a => a.streamer !== streamer);
        filtered.push({
          streamer,
          discordChannelId: discordChannel.id,
          customMessage
        });

        const note = (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET)
          ? '\n\n*(Note: Live stream polling requires `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in your environment config).*'
          : '';
        return interaction.reply({ content: `✅ Added Twitch notification for **${streamer}** in <#${discordChannel.id}>.${note}`, ephemeral: true });
      }

      if (sub === 'remove') {
        const streamer = options.getString('streamer').toLowerCase().trim();
        const filtered = alerts.filter(a => a.streamer !== streamer);
        if (filtered.length === alerts.length) {
          return interaction.reply({ content: `❌ No alert found for Twitch streamer \`${streamer}\`.`, ephemeral: true });
        }
        this.db.set(twKey, filtered);
        return interaction.reply({ content: `✅ Removed Twitch alert for \`${streamer}\`.`, ephemeral: true });
      }

      if (sub === 'list') {
        if (alerts.length === 0) return interaction.reply({ content: '📭 No Twitch alerts configured for this server.', ephemeral: true });
        const desc = alerts.map((a, i) => `**${i + 1}.** **${a.streamer}** (https://twitch.tv/${a.streamer}) ➔ <#${a.discordChannelId}>`).join('\n');
        const embed = new EmbedBuilder().setColor(0x9146FF).setTitle('🟣 Active Twitch Alerts').setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    if (isRss) {
      const sub = options.getSubcommand();
      const rssKey = `rss_${guildId}`;
      const alerts = this.db.get(rssKey) || [];

      if (sub === 'add') {
        const feedUrl = options.getString('feed_url').trim();
        const discordChannel = options.getChannel('discord_channel');

        await interaction.deferReply({ ephemeral: true });
        try {
          const feed = await rssParser.parseURL(feedUrl);
          const feedTitle = feed.title || 'RSS Feed';
          const latestId = feed.items[0]?.guid || feed.items[0]?.link || feed.items[0]?.title || '';

          const filtered = alerts.filter(a => a.feedUrl !== feedUrl);
          filtered.push({
            feedUrl,
            feedTitle,
            discordChannelId: discordChannel.id,
            lastItemId: latestId
          });

          this.db.set(rssKey, filtered);
          return interaction.editReply(`✅ Added RSS feed alert for **${feedTitle}** in <#${discordChannel.id}>.`);
        } catch (err) {
          return interaction.editReply(`❌ Failed to parse RSS feed URL. Error: ${err.message}`);
        }
      }

      if (sub === 'remove') {
        const feedUrl = options.getString('feed_url').trim();
        const filtered = alerts.filter(a => a.feedUrl !== feedUrl);
        if (filtered.length === alerts.length) {
          return interaction.reply({ content: `❌ No alert found for feed URL \`${feedUrl}\`.`, ephemeral: true });
        }
        this.db.set(rssKey, filtered);
        return interaction.reply({ content: `✅ Removed RSS feed alert.`, ephemeral: true });
      }

      if (sub === 'list') {
        if (alerts.length === 0) return interaction.reply({ content: '📭 No RSS feed alerts configured for this server.', ephemeral: true });
        const desc = alerts.map((a, i) => `**${i + 1}.** [${a.feedTitle}](${a.feedUrl}) ➔ <#${a.discordChannelId}>`).join('\n');
        const embed = new EmbedBuilder().setColor(0xFFA500).setTitle('📰 Active RSS Alerts').setDescription(desc);
        return interaction.reply({ embeds: [embed] });
      }
    }

    return false;
  }

  async checkFeeds() {
    try {
      if (!this.db || typeof this.db.entries !== 'function') return;
      for (const [key, alerts] of this.db.entries()) {
      // 1. YouTube
      if (key.startsWith('yt_') && Array.isArray(alerts)) {
        let updated = false;
        for (const alert of alerts) {
          try {
            const feed = await rssParser.parseURL(alert.feedUrl);
            const latest = feed.items[0];
            if (latest && latest.id !== alert.lastVideoId && latest.link) {
              alert.lastVideoId = latest.id;
              updated = true;

              const chan = await this.client.channels.fetch(alert.discordChannelId).catch(() => null);
              if (chan) {
                const text = (alert.customMessage || '📢 **{author}** uploaded: {url}')
                  .replace('{author}', alert.authorName || feed.title)
                  .replace('{url}', latest.link)
                  .replace('{title}', latest.title);

                await chan.send(text).catch(() => {});
              }
            }
          } catch (e) {}
        }
        if (updated) this.db.set(key, alerts);
      }

      // 2. Reddit
      if (key.startsWith('reddit_') && Array.isArray(alerts)) {
        let updated = false;
        for (const alert of alerts) {
          try {
            const feed = await rssParser.parseURL(alert.feedUrl);
            const latest = feed.items[0];
            const currentId = latest?.link || latest?.id || '';
            if (latest && currentId && currentId !== alert.lastPostId) {
              alert.lastPostId = currentId;
              updated = true;

              const chan = await this.client.channels.fetch(alert.discordChannelId).catch(() => null);
              if (chan) {
                const embed = new EmbedBuilder()
                  .setColor(0xFF5700)
                  .setTitle(`r/${alert.subreddit}: ${latest.title.slice(0, 250)}`)
                  .setURL(latest.link)
                  .setDescription(`New post in **r/${alert.subreddit}** by **${latest.author || 'Anonymous'}**\n[Read on Reddit](${latest.link})`)
                  .setFooter({ text: `Reddit Alert • r/${alert.subreddit}` })
                  .setTimestamp(latest.pubDate ? new Date(latest.pubDate) : new Date());

                await chan.send({ embeds: [embed] }).catch(() => {});
              }
            }
          } catch (e) {}
        }
        if (updated) this.db.set(key, alerts);
      }

      // 3. RSS Feeds
      if (key.startsWith('rss_') && Array.isArray(alerts)) {
        let updated = false;
        for (const alert of alerts) {
          try {
            const feed = await rssParser.parseURL(alert.feedUrl);
            const latest = feed.items[0];
            const currentId = latest?.guid || latest?.link || latest?.title || '';
            if (latest && currentId && currentId !== alert.lastItemId) {
              alert.lastItemId = currentId;
              updated = true;

              const chan = await this.client.channels.fetch(alert.discordChannelId).catch(() => null);
              if (chan) {
                const embed = new EmbedBuilder()
                  .setColor(0x5865F2)
                  .setTitle(latest.title ? latest.title.slice(0, 250) : alert.feedTitle)
                  .setURL(latest.link || null)
                  .setDescription(latest.contentSnippet ? latest.contentSnippet.slice(0, 500) : latest.content ? latest.content.slice(0, 500) : '*[No summary]*')
                  .setFooter({ text: alert.feedTitle })
                  .setTimestamp(latest.pubDate ? new Date(latest.pubDate) : new Date());

                await chan.send({ embeds: [embed] }).catch(() => {});
              }
            }
          } catch (e) {}
        }
        if (updated) this.db.set(key, alerts);
      }

      // 4. Twitch Live Streamers
      if (key.startsWith('twitch_') && Array.isArray(alerts) && alerts.length > 0) {
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;
        if (clientId && clientSecret) {
          try {
            await this.checkTwitchStreams(key, alerts, clientId, clientSecret);
          } catch (tErr) {
            console.warn('[TWITCH POLLING WARNING]', tErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SOCIAL ALERTS ERROR]', err.message);
  }
}

  async checkTwitchStreams(key, alerts, clientId, clientSecret) {
    // 1. Get Twitch App Access Token
    if (!this.twitchToken || Date.now() > this.twitchTokenExpiry) {
      const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
      if (!tokenRes.ok) return;
      const tokenData = await tokenRes.json();
      this.twitchToken = tokenData.access_token;
      this.twitchTokenExpiry = Date.now() + ((tokenData.expires_in || 3600) - 60) * 1000;
    }

    const streamerLogins = alerts.map(a => `user_login=${encodeURIComponent(a.streamer)}`).join('&');
    if (!streamerLogins) return;

    const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?${streamerLogins}`, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${this.twitchToken}`
      }
    });

    if (!streamsRes.ok) return;
    const streamsData = await streamsRes.json();
    const liveStreams = new Map((streamsData.data || []).map(s => [s.user_login.toLowerCase(), s]));

    let updated = false;
    for (const alert of alerts) {
      const streamerKey = alert.streamer.toLowerCase();
      const liveInfo = liveStreams.get(streamerKey);
      if (liveInfo) {
        const streamId = liveInfo.id;
        if (alert.lastStreamId !== streamId) {
          alert.lastStreamId = streamId;
          updated = true;

          const chan = await this.client.channels.fetch(alert.discordChannelId).catch(() => null);
          if (chan) {
            const embed = new EmbedBuilder()
              .setColor(0x9146FF)
              .setTitle(`🟣 ${liveInfo.user_name} is now LIVE on Twitch!`)
              .setURL(`https://twitch.tv/${liveInfo.user_login}`)
              .setDescription(`**${liveInfo.title || 'Live Stream'}**\nPlaying: **${liveInfo.game_name || 'Just Chatting'}**`)
              .setThumbnail(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${liveInfo.user_login}-320x180.jpg`)
              .setFooter({ text: 'Twitch Live Notification' })
              .setTimestamp();

            const customText = (alert.customMessage || '🟣 **{streamer}** is now LIVE on Twitch!\nhttps://twitch.tv/{streamer}')
              .replace(/\{streamer\}/gi, liveInfo.user_name);

            await chan.send({ content: customText, embeds: [embed] }).catch(() => {});
          }
        }
      }
    }
    if (updated) this.db.set(key, alerts);
  }
}

module.exports = SocialAlertsModule;

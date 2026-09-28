/**
 * EDITX SERVER COCKPIT & LIVE TAKEOVER DASHBOARD MODULE
 * High-performance, zero-dependency server management screen.
 * Supports:
 *   1. Full multi-server switching (EDITX, Edit Hub, etc.)
 *   2. Direct Messaging (DM) engine to message any member as the bot
 *   3. Real-time chat & server control
 *   4. Seamless auto-recharge when screen is closed.
 */

const http = require('http');
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

class DashboardModule {
  constructor(client, db, botMemory = null) {
    this.client = client;
    this.db = db;
    this.botMemory = botMemory;
    this.activeGuildId = '1538957031455596544';

    // Takeover State
    this.takeoverActive = false;
    this.takeoverChannelId = 'all';
    this.lastHeartbeat = 0;
    this.heartbeatTimeoutMs = 12000;
    this.operatorConnected = false;

    // SSE Clients
    this.sseClients = new Set();

    // Cache of recent DM users
    this.recentDmUsers = new Map(); // userId -> { id, username, displayName, avatar, lastMessage, timestamp }

    this.startWatchdog();
  }

  setBotMemory(botMemory) {
    this.botMemory = botMemory;
  }

  startWatchdog() {
    setInterval(() => {
      if (this.takeoverActive) {
        const elapsed = Date.now() - this.lastHeartbeat;
        if (elapsed > this.heartbeatTimeoutMs) {
          this.releaseTakeover('Operator heartbeat lost (window closed)');
        }
      }
    }, 3000);
  }

  isTakeoverActive(channelId = null) {
    if (!this.takeoverActive) return false;
    if (this.takeoverChannelId === 'all') return true;
    return this.takeoverChannelId === channelId;
  }

  enableTakeover(channelId = 'all') {
    this.takeoverActive = true;
    this.takeoverChannelId = channelId;
    this.lastHeartbeat = Date.now();
    this.operatorConnected = true;
    console.log(`[TAKEOVER ENGAGED] 🎮 Manual operator takeover ACTIVE (Scope: ${channelId}). Autonomous AI responses paused.`);
    this.broadcastSSE('takeover_change', { active: true, channelId, timestamp: Date.now() });
    return { success: true, active: true, channelId };
  }

  releaseTakeover(reason = 'Operator manually released control') {
    if (!this.takeoverActive && !this.operatorConnected) return { success: true, active: false };
    this.takeoverActive = false;
    this.takeoverChannelId = 'all';
    this.operatorConnected = false;
    console.log(`[TAKEOVER RELEASED] 🤖 ${reason}. EditX Autonomous Bot has resumed full charge!`);
    this.broadcastSSE('takeover_change', { active: false, reason, timestamp: Date.now() });
    return { success: true, active: false, reason };
  }

  recordHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.operatorConnected = true;
    return { success: true, timestamp: this.lastHeartbeat };
  }

  broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.sseClients) {
      try {
        res.write(payload);
      } catch (err) {
        this.sseClients.delete(res);
      }
    }
  }

  broadcastMessage(message) {
    if (!message || !message.guild) return;
    this.broadcastSSE('new_message', {
      id: message.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      channelName: message.channel.name,
      author: {
        id: message.author.id,
        username: message.author.username,
        displayName: message.member?.displayName || message.author.displayName || message.author.username,
        avatar: message.author.displayAvatarURL({ size: 64 }),
        bot: message.author.bot,
        color: message.member?.displayHexColor || '#ffffff'
      },
      content: message.content,
      attachments: Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name })),
      embeds: message.embeds.map(e => e.toJSON()),
      createdAt: message.createdAt.toISOString()
    });
  }

  broadcastDirectMessage(message) {
    if (!message || message.guild) return;
    const author = message.author;
    this.recentDmUsers.set(author.id, {
      id: author.id,
      username: author.username,
      displayName: author.displayName || author.username,
      avatar: author.displayAvatarURL({ size: 64 }),
      lastMessage: message.content || '[Attachment]',
      timestamp: Date.now()
    });

    this.broadcastSSE('dm_message', {
      id: message.id,
      userId: author.id,
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName || author.username,
        avatar: author.displayAvatarURL({ size: 64 }),
        bot: author.bot
      },
      content: message.content,
      attachments: Array.from(message.attachments.values()).map(a => ({ url: a.url, name: a.name })),
      embeds: message.embeds.map(e => e.toJSON()),
      createdAt: message.createdAt.toISOString()
    });
  }

  async handleHttpRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const sendJson = (data, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const readBody = () => new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
    });

    // Determine current active guild (via query param or fallback)
    const targetGuildId = parsedUrl.searchParams.get('guildId') || this.activeGuildId;
    const guild = this.client.guilds.cache.get(targetGuildId) || this.client.guilds.cache.first();

    // 1. Health check
    if (pathname === '/health' || pathname === '/ping') {
      return sendJson({
        status: 'online',
        bot: 'EditX Discord Bot',
        uptime: process.uptime(),
        takeover: this.takeoverActive,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Real-time SSE Stream
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(': connected\n\n');
      this.sseClients.add(res);
      req.on('close', () => this.sseClients.delete(res));
      return;
    }

    // 3. API: List All Guilds (Server Switcher)
    if (pathname === '/api/guilds' && method === 'GET') {
      const guildsList = Array.from(this.client.guilds.cache.values()).map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL({ size: 128 }),
        memberCount: g.memberCount,
        boostTier: g.premiumTier,
        boostCount: g.premiumSubscriptionCount
      }));
      return sendJson({ guilds: guildsList, activeGuildId: guild?.id || this.activeGuildId });
    }

    // 4. API: Status & Active Guild
    if (pathname === '/api/status' && method === 'GET') {
      return sendJson({
        online: this.client.isReady(),
        botUser: this.client.user ? {
          id: this.client.user.id,
          tag: this.client.user.tag,
          avatar: this.client.user.displayAvatarURL({ size: 128 })
        } : null,
        guild: guild ? {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          memberCount: guild.memberCount,
          boostTier: guild.premiumTier,
          boostCount: guild.premiumSubscriptionCount,
          rolesCount: guild.roles.cache.size,
          channelsCount: guild.channels.cache.size
        } : null,
        takeover: {
          active: this.takeoverActive,
          channelId: this.takeoverChannelId,
          lastHeartbeat: this.lastHeartbeat,
          operatorConnected: this.operatorConnected
        }
      });
    }

    // 5. API: Heartbeat
    if (pathname === '/api/heartbeat' && method === 'POST') {
      return sendJson(this.recordHeartbeat());
    }

    // 6. API: Takeover Toggle & Release
    if (pathname === '/api/takeover/enable' && method === 'POST') {
      const body = await readBody();
      return sendJson(this.enableTakeover(body.channelId || 'all'));
    }

    if ((pathname === '/api/takeover/release' || pathname === '/api/takeover/disable') && method === 'POST') {
      return sendJson(this.releaseTakeover('Manual release from dashboard'));
    }

    // 7. API: Get Categories & Channels for Selected Guild
    if (pathname === '/api/channels' && method === 'GET') {
      if (!guild) return sendJson({ error: 'Guild not found' }, 404);

      const channels = Array.from(guild.channels.cache.values());
      const categories = channels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(cat => {
          const children = channels
            .filter(c => c.parentId === cat.id)
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .map(ch => ({
              id: ch.id,
              name: ch.name,
              type: ch.type,
              topic: ch.topic || '',
              position: ch.rawPosition,
              rateLimit: ch.rateLimitPerUser || 0
            }));
          return {
            id: cat.id,
            name: cat.name,
            position: cat.rawPosition,
            channels: children
          };
        });

      const uncategorized = channels
        .filter(c => !c.parentId && c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(ch => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          topic: ch.topic || '',
          position: ch.rawPosition
        }));

      return sendJson({ categories, uncategorized, guildId: guild.id });
    }

    // 8. API: Channel Messages
    const msgMatch = pathname.match(/^\/api\/channels\/([0-9]+)\/messages$/);
    if (msgMatch && method === 'GET') {
      const channelId = msgMatch[1];
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return sendJson({ error: 'Text channel not found' }, 404);

      try {
        const fetched = await channel.messages.fetch({ limit: 50 });
        const messages = Array.from(fetched.values()).reverse().map(m => ({
          id: m.id,
          author: {
            id: m.author.id,
            username: m.author.username,
            displayName: m.member?.displayName || m.author.displayName || m.author.username,
            avatar: m.author.displayAvatarURL({ size: 64 }),
            bot: m.author.bot,
            color: m.member?.displayHexColor || '#ffffff'
          },
          content: m.content,
          attachments: Array.from(m.attachments.values()).map(a => ({ url: a.url, name: a.name })),
          embeds: m.embeds.map(e => e.toJSON()),
          createdAt: m.createdAt.toISOString()
        }));
        return sendJson({ channelId, channelName: channel.name, messages });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 9. API: Send Channel Message / Embed as Bot
    const sendMatch = pathname.match(/^\/api\/channels\/([0-9]+)\/send$/);
    if (sendMatch && method === 'POST') {
      const channelId = sendMatch[1];
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return sendJson({ error: 'Text channel not found' }, 404);

      const body = await readBody();
      try {
        const payload = {};
        if (body.content && body.content.trim()) {
          payload.content = body.content.trim();
        }

        if (body.embed && (body.embed.title || body.embed.description)) {
          const emb = new EmbedBuilder();
          if (body.embed.title) emb.setTitle(body.embed.title);
          if (body.embed.description) emb.setDescription(body.embed.description);
          if (body.embed.color) {
            const hex = body.embed.color.replace('#', '');
            emb.setColor(parseInt(hex, 16) || 0x5865F2);
          } else {
            emb.setColor(0x5865F2);
          }
          if (body.embed.footer) emb.setFooter({ text: body.embed.footer });
          emb.setTimestamp();
          payload.embeds = [emb];
        }

        if (body.replyTo) {
          payload.reply = { messageReference: body.replyTo, failIfNotExists: false };
        }

        const sent = await channel.send(payload);
        return sendJson({ success: true, messageId: sent.id });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 10. API: Direct Messages (DM) - List Conversations
    if (pathname === '/api/dm/list' && method === 'GET') {
      const list = Array.from(this.recentDmUsers.values()).sort((a, b) => b.timestamp - a.timestamp);
      return sendJson({ dmUsers: list });
    }

    // 11. API: Direct Messages (DM) - Fetch Messages
    const dmFetchMatch = pathname.match(/^\/api\/dm\/([0-9]+)\/messages$/);
    if (dmFetchMatch && method === 'GET') {
      const userId = dmFetchMatch[1];
      try {
        const user = await this.client.users.fetch(userId);
        const dmChannel = await user.createDM();
        const fetched = await dmChannel.messages.fetch({ limit: 50 });
        const messages = Array.from(fetched.values()).reverse().map(m => ({
          id: m.id,
          author: {
            id: m.author.id,
            username: m.author.username,
            displayName: m.author.displayName || m.author.username,
            avatar: m.author.displayAvatarURL({ size: 64 }),
            bot: m.author.bot,
            color: m.author.bot ? '#5865f2' : '#ffffff'
          },
          content: m.content,
          attachments: Array.from(m.attachments.values()).map(a => ({ url: a.url, name: a.name })),
          embeds: m.embeds.map(e => e.toJSON()),
          createdAt: m.createdAt.toISOString()
        }));
        return sendJson({ userId, user: { id: user.id, username: user.username, displayName: user.displayName || user.username, avatar: user.displayAvatarURL({ size: 64 }) }, messages });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 12. API: Direct Messages (DM) - Send Message as Bot
    const dmSendMatch = pathname.match(/^\/api\/dm\/([0-9]+)\/send$/);
    if (dmSendMatch && method === 'POST') {
      const userId = dmSendMatch[1];
      const body = await readBody();
      try {
        const user = await this.client.users.fetch(userId);
        const payload = {};
        if (body.content && body.content.trim()) {
          payload.content = body.content.trim();
        }
        if (body.embed && (body.embed.title || body.embed.description)) {
          const emb = new EmbedBuilder();
          if (body.embed.title) emb.setTitle(body.embed.title);
          if (body.embed.description) emb.setDescription(body.embed.description);
          if (body.embed.color) {
            const hex = body.embed.color.replace('#', '');
            emb.setColor(parseInt(hex, 16) || 0x5865F2);
          } else {
            emb.setColor(0x5865F2);
          }
          if (body.embed.footer) emb.setFooter({ text: body.embed.footer });
          emb.setTimestamp();
          payload.embeds = [emb];
        }

        const sent = await user.send(payload);
        this.recentDmUsers.set(user.id, {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatar: user.displayAvatarURL({ size: 64 }),
          lastMessage: body.content || '[Embed]',
          timestamp: Date.now()
        });

        return sendJson({ success: true, messageId: sent.id });
      } catch (err) {
        return sendJson({ error: 'Could not send DM: ' + err.message }, 500);
      }
    }

    // 13. API: Delete Message
    const delMatch = pathname.match(/^\/api\/channels\/([0-9]+)\/delete\/([0-9]+)$/);
    if (delMatch && method === 'DELETE') {
      const [, channelId, messageId] = delMatch;
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return sendJson({ error: 'Channel not found' }, 404);

      try {
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
        return sendJson({ success: true, deleted: messageId });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 14. API: Purge Messages
    const purgeMatch = pathname.match(/^\/api\/channels\/([0-9]+)\/purge$/);
    if (purgeMatch && method === 'POST') {
      const channelId = purgeMatch[1];
      const channel = this.client.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) return sendJson({ error: 'Channel not found' }, 404);

      const body = await readBody();
      const amount = Math.min(Math.max(parseInt(body.amount) || 10, 1), 100);
      try {
        const deleted = await channel.bulkDelete(amount, true);
        return sendJson({ success: true, purged: deleted.size });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 15. API: List / Search Members for Active Guild
    if (pathname === '/api/members' && method === 'GET') {
      if (!guild) return sendJson({ error: 'Guild not found' }, 404);

      const query = (parsedUrl.searchParams.get('q') || '').toLowerCase();
      try {
        const members = await guild.members.fetch({ limit: 100 });
        const list = Array.from(members.values())
          .filter(m => !query || m.user.username.toLowerCase().includes(query) || m.displayName.toLowerCase().includes(query) || m.id.includes(query))
          .slice(0, 50)
          .map(m => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            avatar: m.user.displayAvatarURL({ size: 64 }),
            bot: m.user.bot,
            roles: Array.from(m.roles.cache.values()).filter(r => r.name !== '@everyone').map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
            joinedAt: m.joinedAt?.toISOString()
          }));
        return sendJson({ members: list });
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 16. API: Member Actions
    const memActionMatch = pathname.match(/^\/api\/members\/([0-9]+)\/action$/);
    if (memActionMatch && method === 'POST') {
      if (!guild) return sendJson({ error: 'Guild not found' }, 404);

      const memberId = memActionMatch[1];
      const member = await guild.members.fetch(memberId).catch(() => null);
      if (!member) return sendJson({ error: 'Member not found' }, 404);

      const body = await readBody();
      const action = body.action;
      const reason = body.reason || 'Executed via EditX Management Cockpit';

      try {
        if (action === 'kick') {
          await member.kick(reason);
          return sendJson({ success: true, action: 'kicked', memberId });
        }
        if (action === 'ban') {
          await member.ban({ reason });
          return sendJson({ success: true, action: 'banned', memberId });
        }
        if (action === 'timeout') {
          const duration = parseInt(body.duration) || (10 * 60 * 1000);
          await member.timeout(duration, reason);
          return sendJson({ success: true, action: 'timed_out', memberId, duration });
        }
        return sendJson({ error: 'Invalid action' }, 400);
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 17. API: Directives
    if (pathname === '/api/directives' && method === 'GET') {
      const directives = this.botMemory && guild ? this.botMemory.getDirectivesList(guild.id) : [];
      return sendJson({ directives });
    }

    if (pathname === '/api/directives/add' && method === 'POST') {
      const body = await readBody();
      if (!this.botMemory || !guild || !body.directive) return sendJson({ error: 'Cannot add directive' }, 400);

      const resObj = await this.botMemory.addDirective(guild, body.directive, { id: 'DASHBOARD_OPERATOR', tag: 'Server Owner' });
      return sendJson(resObj);
    }

    if (pathname === '/api/directives/remove' && method === 'POST') {
      const body = await readBody();
      if (!this.botMemory || !guild || body.target === undefined) return sendJson({ error: 'Cannot remove directive' }, 400);

      const resObj = await this.botMemory.removeDirective(guild, body.target);
      return sendJson(resObj);
    }

    // 18. Serve Reactive HTML Dashboard
    if (pathname === '/' || pathname === '/cockpit') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderDashboardHtml());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  renderDashboardHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EDITX Server Cockpit & Bot Takeover</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0a0b0e;
      --bg-surface: #12141a;
      --bg-elevated: #181b24;
      --bg-card: #1f232f;
      --border-subtle: #272c3b;
      --border-focus: #5865f2;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent-purple: #7c3aed;
      --accent-blurple: #5865f2;
      --accent-emerald: #10b981;
      --accent-ruby: #ef4444;
      --accent-amber: #f59e0b;
      --font-sans: 'Plus Jakarta Sans', -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      width: 100%;
      overflow: hidden;
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      display: flex;
      flex-direction: column;
    }

    /* SCROLLBAR CUSTOM STYLING */
    ::-webkit-scrollbar {
      width: 7px;
      height: 7px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.15);
    }
    ::-webkit-scrollbar-thumb {
      background: #2b3142;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--accent-blurple);
    }

    /* HEADER */
    header {
      height: 56px;
      flex-shrink: 0;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 100;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid var(--accent-blurple);
    }
    .guild-select {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      font-weight: 700;
      font-size: 0.92rem;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      outline: none;
      max-width: 260px;
    }
    .stats-pills {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pill {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pill.online {
      color: var(--accent-emerald);
      border-color: rgba(16, 185, 129, 0.3);
    }
    .takeover-box {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .takeover-btn {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.82rem;
      border: none;
      transition: all 0.2s;
    }
    .takeover-btn.bot-mode {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .takeover-btn.takeover-mode {
      background: var(--accent-ruby);
      color: #fff;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.6);
      animation: pulse-red 2s infinite;
    }
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
      50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
    }
    .close-btn {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 7px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .close-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      color: var(--accent-ruby);
      border-color: var(--accent-ruby);
    }

    /* 3-PANE WORKSPACE */
    .app-workspace {
      display: grid;
      grid-template-columns: 270px 1fr 320px;
      flex: 1;
      height: calc(100vh - 56px);
      max-height: calc(100vh - 56px);
      overflow: hidden;
      min-height: 0;
    }

    /* LEFT: CHANNELS PANE */
    .channels-pane {
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .pane-header {
      padding: 12px 16px 8px;
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .channel-tree {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 0 10px 20px;
    }
    .cat-block {
      margin-bottom: 10px;
    }
    .cat-title {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--text-dim);
      padding: 6px 8px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .channel-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      margin: 2px 0;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 500;
      transition: background 0.15s, color 0.15s;
    }
    .channel-item:hover {
      background: var(--bg-elevated);
      color: var(--text-main);
    }
    .channel-item.active {
      background: var(--bg-card);
      color: #fff;
      font-weight: 700;
      border-left: 3px solid var(--accent-blurple);
    }

    /* CENTER: CHAT PANE */
    .chat-pane {
      background: var(--bg-base);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }
    .chat-header {
      height: 50px;
      flex-shrink: 0;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
    }
    .channel-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .channel-title {
      font-size: 0.95rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .channel-desc {
      font-size: 0.78rem;
      color: var(--text-dim);
      border-left: 1px solid var(--border-subtle);
      padding-left: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 450px;
    }
    .chat-actions {
      display: flex;
      gap: 6px;
    }
    .action-btn {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .action-btn:hover {
      color: #fff;
      background: var(--bg-card);
    }

    /* MESSAGES STREAM */
    .messages-stream {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg-card {
      display: flex;
      gap: 12px;
      padding: 4px 10px;
      border-radius: 6px;
    }
    .msg-card:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .msg-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      flex-shrink: 0;
      object-fit: cover;
    }
    .msg-content-wrap {
      flex: 1;
      min-width: 0;
    }
    .msg-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 2px;
    }
    .msg-author {
      font-size: 0.88rem;
      font-weight: 700;
    }
    .bot-tag {
      background: var(--accent-blurple);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
    }
    .msg-time {
      font-size: 0.7rem;
      color: var(--text-dim);
    }
    .msg-text {
      font-size: 0.88rem;
      line-height: 1.4;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-embed {
      margin-top: 6px;
      background: var(--bg-surface);
      border-left: 3px solid var(--accent-blurple);
      border-radius: 4px;
      padding: 10px 12px;
      max-width: 500px;
    }
    .embed-title {
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 4px;
    }
    .embed-desc {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.35;
    }

    /* INPUT BAR */
    .chat-input-bar {
      flex-shrink: 0;
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
      padding: 12px 16px;
      z-index: 10;
    }
    .takeover-badge-indicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 0.75rem;
    }
    .bot-speaking-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: var(--accent-blurple);
    }
    .input-box-wrap {
      display: flex;
      gap: 8px;
    }
    .chat-input {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.88rem;
      outline: none;
    }
    .chat-input:focus {
      border-color: var(--border-focus);
    }
    .send-btn {
      background: var(--accent-blurple);
      color: #fff;
      border: none;
      padding: 0 16px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .send-btn:hover {
      background: #4752c4;
    }
    .embed-modal-trigger {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 0 12px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.8rem;
    }

    /* RIGHT: TOOLS PANE */
    .tools-pane {
      background: var(--bg-surface);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    .tab-bar {
      display: flex;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .tab-item {
      flex: 1;
      padding: 10px 0;
      text-align: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-dim);
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab-item.active {
      color: var(--accent-blurple);
      border-bottom-color: var(--accent-blurple);
      background: rgba(88, 101, 242, 0.05);
    }
    .tab-content {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding: 12px;
    }
    .tab-panel {
      display: none;
    }
    .tab-panel.active {
      display: block;
    }
    .search-input {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      margin-bottom: 10px;
      outline: none;
    }
    .member-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      margin-bottom: 6px;
      border-radius: 6px;
      background: var(--bg-elevated);
      border: 1px solid rgba(255, 255, 255, 0.02);
    }
    .member-info {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .member-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
    }
    .member-name {
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 130px;
    }
    .member-actions {
      display: flex;
      gap: 4px;
    }
    .mini-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 0.68rem;
      cursor: pointer;
      font-weight: 600;
    }
    .mini-btn.dm {
      color: var(--accent-blurple);
      border-color: rgba(88, 101, 242, 0.4);
    }
    .mini-btn.dm:hover {
      background: var(--accent-blurple);
      color: #fff;
    }
    .mini-btn:hover {
      color: #fff;
      border-color: var(--border-focus);
    }

    /* MODAL */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-card {
      width: 480px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .field-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .field-input, .field-textarea {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 8px 10px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.85rem;
      outline: none;
    }
    .field-textarea {
      height: 70px;
      resize: vertical;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  </style>
</head>
<body>

  <!-- TOP BAR -->
  <header>
    <div class="brand-group">
      <img id="botAvatar" class="brand-img" src="https://cdn.discordapp.com/embed/avatars/0.png" alt="Bot">
      <select id="guildSelector" class="guild-select" onchange="switchGuild(this.value)">
        <option value="1538957031455596544">EDITX | The Creative Network</option>
      </select>
    </div>

    <div class="stats-pills">
      <div class="pill online"><span>●</span> Online</div>
      <div class="pill" id="memberCountPill">👥 238 Members</div>
      <div class="pill" id="boostTierPill">🚀 Boost Level 2</div>
    </div>

    <div class="takeover-box">
      <button id="takeoverBtn" class="takeover-btn bot-mode" onclick="toggleTakeover()">
        <span id="takeoverIcon">🤖</span>
        <span id="takeoverLabel">Bot Auto-Pilot: ONLINE</span>
      </button>
      <button class="close-btn" onclick="exitAndResumeBot()">✖ Release & Exit</button>
    </div>
  </header>

  <!-- 3-PANE WORKSPACE -->
  <div class="app-workspace">

    <!-- LEFT PANE -->
    <div class="channels-pane">
      <div class="pane-header">
        <span>Channels & Categories</span>
        <button class="action-btn" onclick="loadChannels()" style="padding:2px 6px;">↻</button>
      </div>
      <div class="channel-tree" id="channelTree">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- CENTER PANE -->
    <div class="chat-pane">
      <div class="chat-header">
        <div class="channel-meta">
          <div class="channel-title" id="activeChatTitle">#💬・general-chat</div>
          <div class="channel-desc" id="activeChatTopic">The central hub for the EDITX community.</div>
        </div>
        <div class="chat-actions">
          <button class="action-btn" id="purgeBtn" onclick="purgeChannel(10)">🧹 Purge 10</button>
          <button class="action-btn" onclick="refreshMessages()">🔄 Refresh</button>
        </div>
      </div>

      <!-- MESSAGES -->
      <div class="messages-stream" id="messagesStream">
        <!-- Messages rendered dynamically -->
      </div>

      <!-- INPUT BAR -->
      <div class="chat-input-bar">
        <div class="takeover-badge-indicator">
          <div class="bot-speaking-badge">
            <span id="speakingModeIcon">🎭</span> Speaking as <strong id="speakingAsLabel">EditX#0799 (Verified Bot)</strong>
          </div>
          <div id="replyingNotice" style="display:none; color:var(--accent-amber);">
            Replying to <span id="replyUser"></span> • <a href="#" onclick="cancelReply()" style="color:var(--accent-ruby)">Cancel</a>
          </div>
        </div>
        <div class="input-box-wrap">
          <input type="text" id="chatInput" class="chat-input" placeholder="Type a message as EditX Bot... (Press Enter to send)" onkeydown="handleInputKey(event)">
          <button class="embed-modal-trigger" onclick="openEmbedModal()">📢 Embed</button>
          <button class="send-btn" onclick="sendChatMessage()">Send</button>
        </div>
      </div>
    </div>

    <!-- RIGHT PANE -->
    <div class="tools-pane">
      <div class="tab-bar">
        <div class="tab-item active" onclick="switchTab('members')">Members</div>
        <div class="tab-item" onclick="switchTab('dms')">Direct Msgs</div>
        <div class="tab-item" onclick="switchTab('rules')">Directives</div>
      </div>

      <div class="tab-content">
        <!-- MEMBERS TAB -->
        <div class="tab-panel active" id="tab-members">
          <input type="text" id="memberSearch" class="search-input" placeholder="Search members by name..." oninput="searchMembers(this.value)">
          <div id="membersList">Loading members...</div>
        </div>

        <!-- DMS TAB -->
        <div class="tab-panel" id="tab-dms">
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
            Recent Direct Message Conversations:
          </div>
          <div id="dmConversationsList">Loading DMs...</div>
        </div>

        <!-- DIRECTIVES TAB -->
        <div class="tab-panel" id="tab-rules">
          <div id="directivesList">Loading directives...</div>
          <div style="margin-top:10px; display:flex; gap:6px;">
            <input type="text" id="newDirectiveInput" class="search-input" placeholder="Add new rule..." style="margin-bottom:0;">
            <button class="send-btn" style="padding:0 10px; font-size:0.75rem;" onclick="addDirective()">Add</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- EMBED MODAL -->
  <div class="modal-overlay" id="embedModal">
    <div class="modal-card">
      <div style="font-size:1rem; font-weight:800;">📢 Send Discord Embed as EditX Bot</div>
      <div class="field-row">
        <label class="field-label">Title</label>
        <input type="text" id="embedTitle" class="field-input" placeholder="Announcement title">
      </div>
      <div class="field-row">
        <label class="field-label">Description</label>
        <textarea id="embedDesc" class="field-textarea" placeholder="Message content, markdown supported..."></textarea>
      </div>
      <div class="field-row">
        <label class="field-label">Color (Hex)</label>
        <input type="text" id="embedColor" class="field-input" value="#5865F2">
      </div>
      <div class="field-row">
        <label class="field-label">Footer</label>
        <input type="text" id="embedFooter" class="field-input" placeholder="Footer text">
      </div>
      <div class="modal-actions">
        <button class="action-btn" onclick="closeEmbedModal()">Cancel</button>
        <button class="send-btn" onclick="dispatchEmbed()">Send</button>
      </div>
    </div>
  </div>

  <script>
    let currentGuildId = '1538957031455596544';
    let currentMode = 'channel'; // 'channel' or 'dm'
    let activeTargetId = '1554151421056647290'; // channelId or userId
    let takeoverEnabled = false;
    let replyTargetId = null;

    document.addEventListener('DOMContentLoaded', () => {
      loadGuilds();
      loadChannels();
      connectSSE();
      setInterval(sendHeartbeat, 3000);
      searchMembers('');
      loadDmList();
      loadDirectives();
    });

    window.addEventListener('beforeunload', () => {
      navigator.sendBeacon('/api/takeover/release');
    });

    function sendHeartbeat() {
      if (takeoverEnabled) {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
      }
    }

    async function loadGuilds() {
      try {
        const res = await fetch('/api/guilds');
        const data = await res.json();
        const sel = document.getElementById('guildSelector');
        sel.innerHTML = '';
        for (const g of data.guilds || []) {
          const opt = document.createElement('option');
          opt.value = g.id;
          opt.textContent = g.name;
          if (g.id === currentGuildId) opt.selected = true;
          sel.appendChild(opt);
        }
        updateGuildStatus();
      } catch (e) {}
    }

    function switchGuild(guildId) {
      currentGuildId = guildId;
      loadChannels();
      updateGuildStatus();
      searchMembers('');
      loadDirectives();
    }

    async function updateGuildStatus() {
      try {
        const res = await fetch('/api/status?guildId=' + currentGuildId);
        const data = await res.json();
        if (data.botUser) {
          document.getElementById('botAvatar').src = data.botUser.avatar;
        }
        if (data.guild) {
          document.getElementById('memberCountPill').textContent = '👥 ' + data.guild.memberCount + ' Members';
          document.getElementById('boostTierPill').textContent = '🚀 Boost Level ' + data.guild.boostTier + ' (' + data.guild.boostCount + ')';
        }
        if (data.takeover.active) {
          setTakeoverUI(true);
        }
      } catch (e) {}
    }

    function toggleTakeover() {
      takeoverEnabled = !takeoverEnabled;
      setTakeoverUI(takeoverEnabled);
      if (takeoverEnabled) {
        fetch('/api/takeover/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: activeTargetId })
        });
      } else {
        fetch('/api/takeover/release', { method: 'POST' });
      }
    }

    function setTakeoverUI(active) {
      takeoverEnabled = active;
      const btn = document.getElementById('takeoverBtn');
      const icon = document.getElementById('takeoverIcon');
      const label = document.getElementById('takeoverLabel');
      if (active) {
        btn.className = 'takeover-btn takeover-mode';
        icon.textContent = '🔴';
        label.textContent = 'MANUAL OVERRIDE: ACTIVE';
      } else {
        btn.className = 'takeover-btn bot-mode';
        icon.textContent = '🤖';
        label.textContent = 'Bot Auto-Pilot: ONLINE';
      }
    }

    function exitAndResumeBot() {
      fetch('/api/takeover/release', { method: 'POST' }).then(() => {
        setTakeoverUI(false);
        window.close();
      });
    }

    async function loadChannels() {
      try {
        const res = await fetch('/api/channels?guildId=' + currentGuildId);
        const data = await res.json();
        const tree = document.getElementById('channelTree');
        tree.innerHTML = '';

        let firstTextChannel = null;

        for (const cat of data.categories || []) {
          const block = document.createElement('div');
          block.className = 'cat-block';
          block.innerHTML = '<div class="cat-title">' + cat.name + '</div>';

          for (const ch of cat.channels) {
            if (!firstTextChannel && ch.type === 0) firstTextChannel = ch;
            const item = document.createElement('div');
            item.className = 'channel-item' + (ch.id === activeTargetId ? ' active' : '');
            item.innerHTML = (ch.type === 2 ? '🔊 ' : '# ') + ch.name;
            item.onclick = () => selectChannel(ch.id, ch.name, ch.topic);
            block.appendChild(item);
          }
          tree.appendChild(block);
        }

        // If active target not in this guild, auto-select first text channel
        if (firstTextChannel && currentMode === 'channel') {
          selectChannel(firstTextChannel.id, firstTextChannel.name, firstTextChannel.topic);
        }
      } catch (e) {}
    }

    function selectChannel(id, name, topic) {
      currentMode = 'channel';
      activeTargetId = id;
      document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
      const activeEl = Array.from(document.querySelectorAll('.channel-item')).find(el => el.textContent.includes(name));
      if (activeEl) activeEl.classList.add('active');

      document.getElementById('activeChatTitle').textContent = '#' + name;
      document.getElementById('activeChatTopic').textContent = topic || 'No topic set.';
      document.getElementById('chatInput').placeholder = 'Type a message as EditX Bot in #' + name + '... (Press Enter to send)';
      document.getElementById('purgeBtn').style.display = 'block';

      loadMessages();
    }

    function selectDM(userId, displayName, avatar) {
      currentMode = 'dm';
      activeTargetId = userId;
      document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));

      document.getElementById('activeChatTitle').textContent = '💬 DM: @' + displayName;
      document.getElementById('activeChatTopic').textContent = 'Direct Message conversation with User ID: ' + userId;
      document.getElementById('chatInput').placeholder = 'Send a direct message to @' + displayName + ' as EditX Bot...';
      document.getElementById('purgeBtn').style.display = 'none';

      loadDmMessages(userId);
    }

    async function loadMessages() {
      if (currentMode !== 'channel') return;
      try {
        const res = await fetch('/api/channels/' + activeTargetId + '/messages');
        const data = await res.json();
        renderMessages(data.messages || []);
      } catch (e) {}
    }

    async function loadDmMessages(userId) {
      try {
        const res = await fetch('/api/dm/' + userId + '/messages');
        const data = await res.json();
        renderMessages(data.messages || []);
      } catch (e) {}
    }

    function refreshMessages() {
      if (currentMode === 'channel') loadMessages();
      else loadDmMessages(activeTargetId);
    }

    function renderMessages(messages) {
      const stream = document.getElementById('messagesStream');
      stream.innerHTML = '';
      for (const m of messages) {
        appendMessageElement(m);
      }
      stream.scrollTop = stream.scrollHeight;
    }

    function appendMessageElement(m) {
      const stream = document.getElementById('messagesStream');
      const card = document.createElement('div');
      card.className = 'msg-card';
      card.id = 'msg-' + m.id;

      let embedsHtml = '';
      if (m.embeds && m.embeds.length > 0) {
        for (const emb of m.embeds) {
          embedsHtml += '<div class="msg-embed">' +
            (emb.title ? '<div class="embed-title">' + escapeHtml(emb.title) + '</div>' : '') +
            (emb.description ? '<div class="embed-desc">' + escapeHtml(emb.description) + '</div>' : '') +
            '</div>';
        }
      }

      let attachmentsHtml = '';
      if (m.attachments && m.attachments.length > 0) {
        for (const att of m.attachments) {
          if (/\\.(png|jpg|jpeg|gif|webp)$/i.test(att.url)) {
            attachmentsHtml += '<img src="' + att.url + '" style="max-width:300px; border-radius:6px; margin-top:6px; display:block;">';
          }
        }
      }

      card.innerHTML = 
        '<img class="msg-avatar" src="' + m.author.avatar + '">' +
        '<div class="msg-content-wrap">' +
          '<div class="msg-meta">' +
            '<span class="msg-author" style="color:' + (m.author.color || '#fff') + '">' + escapeHtml(m.author.displayName) + '</span>' +
            (m.author.bot ? '<span class="bot-tag">BOT</span>' : '') +
            '<span class="msg-time">' + new Date(m.createdAt).toLocaleTimeString() + '</span>' +
          '</div>' +
          (m.content ? '<div class="msg-text">' + escapeHtml(m.content) + '</div>' : '') +
          attachmentsHtml +
          embedsHtml +
        '</div>';

      stream.appendChild(card);
    }

    function handleInputKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    }

    async function sendChatMessage() {
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      try {
        if (currentMode === 'channel') {
          await fetch('/api/channels/' + activeTargetId + '/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, replyTo: replyTargetId })
          });
          cancelReply();
          setTimeout(loadMessages, 300);
        } else {
          await fetch('/api/dm/' + activeTargetId + '/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text })
          });
          setTimeout(() => loadDmMessages(activeTargetId), 300);
          loadDmList();
        }
      } catch (e) {}
    }

    function cancelReply() {
      replyTargetId = null;
      document.getElementById('replyingNotice').style.display = 'none';
    }

    async function purgeChannel(amount) {
      if (currentMode !== 'channel') return;
      if (!confirm('Purge last ' + amount + ' messages in #' + document.getElementById('activeChatTitle').textContent + '?')) return;
      try {
        await fetch('/api/channels/' + activeTargetId + '/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount })
        });
        setTimeout(loadMessages, 500);
      } catch (e) {}
    }

    function openEmbedModal() {
      document.getElementById('embedModal').style.display = 'flex';
    }
    function closeEmbedModal() {
      document.getElementById('embedModal').style.display = 'none';
    }
    async function dispatchEmbed() {
      const title = document.getElementById('embedTitle').value.trim();
      const description = document.getElementById('embedDesc').value.trim();
      const color = document.getElementById('embedColor').value.trim();
      const footer = document.getElementById('embedFooter').value.trim();

      if (!title && !description) return alert('Enter title or description');

      try {
        if (currentMode === 'channel') {
          await fetch('/api/channels/' + activeTargetId + '/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embed: { title, description, color, footer } })
          });
          setTimeout(loadMessages, 300);
        } else {
          await fetch('/api/dm/' + activeTargetId + '/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embed: { title, description, color, footer } })
          });
          setTimeout(() => loadDmMessages(activeTargetId), 300);
        }
        closeEmbedModal();
        document.getElementById('embedTitle').value = '';
        document.getElementById('embedDesc').value = '';
      } catch (e) {}
    }

    function connectSSE() {
      const es = new EventSource('/api/events');
      es.addEventListener('new_message', (e) => {
        const msg = JSON.parse(e.data);
        if (currentMode === 'channel' && msg.channelId === activeTargetId) {
          appendMessageElement(msg);
          const stream = document.getElementById('messagesStream');
          stream.scrollTop = stream.scrollHeight;
        }
      });
      es.addEventListener('dm_message', (e) => {
        const msg = JSON.parse(e.data);
        if (currentMode === 'dm' && msg.userId === activeTargetId) {
          appendMessageElement(msg);
          const stream = document.getElementById('messagesStream');
          stream.scrollTop = stream.scrollHeight;
        }
        loadDmList();
      });
      es.addEventListener('takeover_change', (e) => {
        const d = JSON.parse(e.data);
        setTakeoverUI(d.active);
      });
    }

    function switchTab(name) {
      document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
    }

    async function searchMembers(query) {
      try {
        const res = await fetch('/api/members?guildId=' + currentGuildId + '&q=' + encodeURIComponent(query));
        const data = await res.json();
        const list = document.getElementById('membersList');
        list.innerHTML = '';
        for (const m of data.members || []) {
          const row = document.createElement('div');
          row.className = 'member-item';
          row.innerHTML = 
            '<div class="member-info">' +
              '<img class="member-avatar" src="' + m.avatar + '">' +
              '<span class="member-name">' + escapeHtml(m.displayName) + '</span>' +
            '</div>' +
            '<div class="member-actions">' +
              '<button class="mini-btn dm" onclick="selectDM(\\'' + m.id + '\\', \\'' + escapeHtml(m.displayName) + '\\', \\'' + m.avatar + '\\')">💬 DM</button>' +
              '<button class="mini-btn" onclick="memberAction(\\'' + m.id + '\\', \\'kick\\')">Kick</button>' +
            '</div>';
          list.appendChild(row);
        }
      } catch (e) {}
    }

    async function loadDmList() {
      try {
        const res = await fetch('/api/dm/list');
        const data = await res.json();
        const list = document.getElementById('dmConversationsList');
        list.innerHTML = '';
        if (!data.dmUsers || data.dmUsers.length === 0) {
          list.innerHTML = '<div style="font-size:0.75rem; color:var(--text-dim);">No active DMs yet. Click 💬 DM on any member to start chatting!</div>';
          return;
        }
        for (const u of data.dmUsers) {
          const item = document.createElement('div');
          item.className = 'member-item';
          item.style.cursor = 'pointer';
          item.onclick = () => selectDM(u.id, u.displayName, u.avatar);
          item.innerHTML = 
            '<div class="member-info">' +
              '<img class="member-avatar" src="' + u.avatar + '">' +
              '<div>' +
                '<div class="member-name">' + escapeHtml(u.displayName) + '</div>' +
                '<div style="font-size:0.7rem; color:var(--text-dim);">' + escapeHtml(u.lastMessage) + '</div>' +
              '</div>' +
            '</div>';
          list.appendChild(item);
        }
      } catch (e) {}
    }

    async function memberAction(memberId, action) {
      if (!confirm('Execute ' + action + ' on member ID ' + memberId + '?')) return;
      try {
        await fetch('/api/members/' + memberId + '/action?guildId=' + currentGuildId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        alert('Action ' + action + ' executed.');
      } catch (e) {}
    }

    async function loadDirectives() {
      try {
        const res = await fetch('/api/directives?guildId=' + currentGuildId);
        const data = await res.json();
        const list = document.getElementById('directivesList');
        list.innerHTML = '';
        (data.directives || []).forEach((d, idx) => {
          const card = document.createElement('div');
          card.className = 'member-item';
          card.innerHTML = 
            '<div style="font-size:0.75rem; line-height:1.4;">' + escapeHtml(d) + '</div>' +
            '<button class="mini-btn" onclick="removeDirective(' + (idx + 1) + ')">✖</button>';
          list.appendChild(card);
        });
      } catch (e) {}
    }

    async function addDirective() {
      const input = document.getElementById('newDirectiveInput');
      const text = input.value.trim();
      if (!text) return;
      try {
        await fetch('/api/directives/add?guildId=' + currentGuildId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directive: text })
        });
        input.value = '';
        loadDirectives();
      } catch (e) {}
    }

    async function removeDirective(target) {
      try {
        await fetch('/api/directives/remove?guildId=' + currentGuildId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target })
        });
        loadDirectives();
      } catch (e) {}
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
  }
}

module.exports = DashboardModule;

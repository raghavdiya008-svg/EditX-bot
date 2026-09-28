/**
 * EDITX SERVER COCKPIT & LIVE TAKEOVER DASHBOARD MODULE
 * Allows the server owner to open a GUI screen, manage the entire server
 * in real-time as the bot (Ghost / Puppet mode), and automatically
 * restores 100% autonomous bot operations as soon as the screen is closed.
 */

const http = require('http');
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

class DashboardModule {
  constructor(client, db, botMemory = null) {
    this.client = client;
    this.db = db;
    this.botMemory = botMemory;
    this.targetGuildId = '1538957031455596544';

    // Takeover State
    this.takeoverActive = false;
    this.takeoverChannelId = 'all'; // 'all' or specific channel ID
    this.lastHeartbeat = 0;
    this.heartbeatTimeoutMs = 12000; // 12 seconds fail-safe watchdog
    this.operatorConnected = false;

    // SSE Clients for real-time events
    this.sseClients = new Set();

    // Start Watchdog Timer
    this.startWatchdog();
  }

  setBotMemory(botMemory) {
    this.botMemory = botMemory;
  }

  /**
   * Fail-safe watchdog: If operator closes screen without explicit release,
   * automatically restore bot charge after heartbeatTimeoutMs.
   */
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

  /**
   * Dispatches incoming HTTP requests from the built-in HTTP server.
   */
  async handleHttpRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // CORS Headers for local development & API access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Helper for JSON response
    const sendJson = (data, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    // Helper to read JSON body
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

    // 1. Health check endpoint (Preserves 24/7 ping support)
    if (pathname === '/health' || pathname === '/ping') {
      return sendJson({
        status: 'online',
        bot: 'EditX Discord Bot',
        uptime: process.uptime(),
        takeover: this.takeoverActive,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Server-Sent Events stream for real-time live events
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

    // 3. API: Status & Guild Overview
    if (pathname === '/api/status' && method === 'GET') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
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

    // 4. API: Heartbeat
    if (pathname === '/api/heartbeat' && method === 'POST') {
      return sendJson(this.recordHeartbeat());
    }

    // 5. API: Takeover Toggle & Release
    if (pathname === '/api/takeover/enable' && method === 'POST') {
      const body = await readBody();
      return sendJson(this.enableTakeover(body.channelId || 'all'));
    }

    if ((pathname === '/api/takeover/release' || pathname === '/api/takeover/disable') && method === 'POST') {
      return sendJson(this.releaseTakeover('Manual release from dashboard'));
    }

    // 6. API: Get Categories & Channels
    if (pathname === '/api/channels' && method === 'GET') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
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

      return sendJson({ categories, uncategorized });
    }

    // 7. API: Fetch Messages for Channel
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

    // 8. API: Send Message / Embed as Bot
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
          if (body.embed.thumbnail) emb.setThumbnail(body.embed.thumbnail);
          if (body.embed.image) emb.setImage(body.embed.image);
          if (Array.isArray(body.embed.fields)) {
            for (const f of body.embed.fields) {
              if (f.name && f.value) emb.addFields({ name: f.name, value: f.value, inline: Boolean(f.inline) });
            }
          }
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

    // 9. API: Delete Message
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

    // 10. API: Purge Messages in Channel
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

    // 11. API: List / Search Members
    if (pathname === '/api/members' && method === 'GET') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
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

    // 12. API: Member Actions (Kick, Ban, Timeout, Role)
    const memActionMatch = pathname.match(/^\/api\/members\/([0-9]+)\/action$/);
    if (memActionMatch && method === 'POST') {
      const memberId = memActionMatch[1];
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
      if (!guild) return sendJson({ error: 'Guild not found' }, 404);

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
          const duration = parseInt(body.duration) || (10 * 60 * 1000); // 10 mins
          await member.timeout(duration, reason);
          return sendJson({ success: true, action: 'timed_out', memberId, duration });
        }
        if (action === 'quarantine') {
          const quarantineRole = guild.roles.cache.get('1546811342369984652');
          if (quarantineRole) {
            await member.roles.add(quarantineRole, reason);
            return sendJson({ success: true, action: 'quarantined', memberId });
          } else {
            return sendJson({ error: 'Quarantine role not found' }, 404);
          }
        }
        if (action === 'addRole' && body.roleId) {
          await member.roles.add(body.roleId, reason);
          return sendJson({ success: true, action: 'role_added', memberId, roleId: body.roleId });
        }
        if (action === 'removeRole' && body.roleId) {
          await member.roles.remove(body.roleId, reason);
          return sendJson({ success: true, action: 'role_removed', memberId, roleId: body.roleId });
        }
        return sendJson({ error: 'Invalid action' }, 400);
      } catch (err) {
        return sendJson({ error: err.message }, 500);
      }
    }

    // 13. API: Get Directives & Bot Memory
    if (pathname === '/api/directives' && method === 'GET') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
      const directives = this.botMemory && guild ? this.botMemory.getDirectivesList(guild.id) : [];
      return sendJson({ directives });
    }

    if (pathname === '/api/directives/add' && method === 'POST') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
      const body = await readBody();
      if (!this.botMemory || !guild || !body.directive) return sendJson({ error: 'Cannot add directive' }, 400);

      const resObj = await this.botMemory.addDirective(guild, body.directive, { id: 'DASHBOARD_OPERATOR', tag: 'Server Owner' });
      return sendJson(resObj);
    }

    if (pathname === '/api/directives/remove' && method === 'POST') {
      const guild = this.client.guilds.cache.get(this.targetGuildId) || this.client.guilds.cache.first();
      const body = await readBody();
      if (!this.botMemory || !guild || body.target === undefined) return sendJson({ error: 'Cannot remove directive' }, 400);

      const resObj = await this.botMemory.removeDirective(guild, body.target);
      return sendJson(resObj);
    }

    // 14. Serve Web Dashboard HTML Page on '/' or '/cockpit'
    if (pathname === '/' || pathname === '/cockpit') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderDashboardHtml());
      return;
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  /**
   * Generates the self-contained, reactive Cyberpunk/Obsidian Studio Dashboard UI.
   */
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
    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* TOP BAR */
    header {
      height: 60px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 100;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 1.1rem;
      letter-spacing: 0.5px;
    }
    .brand img {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid var(--accent-blurple);
    }
    .stats-pills {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pill {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
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

    /* TAKEOVER MASTER SWITCH */
    .takeover-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .takeover-btn {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
      border: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .takeover-btn.bot-mode {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .takeover-btn.bot-mode:hover {
      background: rgba(16, 185, 129, 0.25);
    }
    .takeover-btn.takeover-mode {
      background: var(--accent-ruby);
      color: #fff;
      box-shadow: 0 0 15px rgba(239, 68, 68, 0.5);
      animation: pulse-red 2s infinite;
    }
    @keyframes pulse-red {
      0%, 100% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 24px rgba(239, 68, 68, 0.8); }
    }
    .close-btn {
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .close-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      color: var(--accent-ruby);
      border-color: var(--accent-ruby);
    }

    /* MAIN APP WORKSPACE (3-PANE LAYOUT) */
    .app-workspace {
      display: grid;
      grid-template-columns: 280px 1fr 340px;
      flex: 1;
      height: calc(100vh - 60px);
      overflow: hidden;
    }

    /* LEFT PANE: CHANNEL HIERARCHY */
    .channels-pane {
      background: var(--bg-surface);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .pane-header {
      padding: 16px 20px 10px;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .channel-tree {
      flex: 1;
      overflow-y: auto;
      padding: 0 10px 20px;
    }
    .cat-block {
      margin-bottom: 12px;
    }
    .cat-title {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-dim);
      padding: 6px 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .channel-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      margin: 2px 0;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.88rem;
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
      font-weight: 600;
      border-left: 3px solid var(--accent-blurple);
    }

    /* CENTER PANE: CHAT COCKPIT */
    .chat-pane {
      background: var(--bg-base);
      display: flex;
      flex-direction: column;
      height: 100%;
      position: relative;
    }
    .chat-header {
      height: 54px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
    }
    .channel-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .channel-title {
      font-size: 1.05rem;
      font-weight: 700;
    }
    .channel-desc {
      font-size: 0.8rem;
      color: var(--text-dim);
      border-left: 1px solid var(--border-subtle);
      padding-left: 12px;
      max-width: 400px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chat-actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .action-btn:hover {
      color: var(--text-main);
      background: var(--bg-card);
    }

    /* MESSAGE STREAM */
    .messages-stream {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .msg-card {
      display: flex;
      gap: 14px;
      padding: 6px 12px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .msg-card:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .msg-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--bg-card);
      object-fit: cover;
    }
    .msg-content-wrap {
      flex: 1;
    }
    .msg-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .msg-author {
      font-size: 0.92rem;
      font-weight: 700;
    }
    .bot-tag {
      background: var(--accent-blurple);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .msg-time {
      font-size: 0.72rem;
      color: var(--text-dim);
    }
    .msg-text {
      font-size: 0.92rem;
      line-height: 1.45;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg-embed {
      margin-top: 8px;
      background: var(--bg-surface);
      border-left: 4px solid var(--accent-blurple);
      border-radius: 4px;
      padding: 12px 14px;
      max-width: 520px;
    }
    .embed-title {
      font-weight: 700;
      font-size: 0.95rem;
      margin-bottom: 6px;
      color: #fff;
    }
    .embed-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .msg-actions {
      display: none;
      align-self: flex-start;
      gap: 4px;
    }
    .msg-card:hover .msg-actions {
      display: flex;
    }
    .msg-act-btn {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.72rem;
    }
    .msg-act-btn:hover {
      color: #fff;
      background: var(--bg-elevated);
    }
    .msg-act-btn.del:hover {
      color: var(--accent-ruby);
      border-color: var(--accent-ruby);
    }

    /* INPUT BAR */
    .chat-input-bar {
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
      padding: 14px 20px;
    }
    .takeover-badge-indicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 0.78rem;
      color: var(--text-dim);
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
      gap: 10px;
    }
    .chat-input {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.92rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .chat-input:focus {
      border-color: var(--border-focus);
    }
    .send-btn {
      background: var(--accent-blurple);
      color: #fff;
      border: none;
      padding: 0 20px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .send-btn:hover {
      background: #4752c4;
    }
    .embed-modal-trigger {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      padding: 0 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.82rem;
    }
    .embed-modal-trigger:hover {
      color: #fff;
      border-color: var(--border-focus);
    }

    /* RIGHT PANE: SERVER CONTROLS & TABS */
    .tools-pane {
      background: var(--bg-surface);
      border-left: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border-subtle);
    }
    .tab-item {
      flex: 1;
      padding: 12px 0;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-dim);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .tab-item:hover {
      color: var(--text-main);
    }
    .tab-item.active {
      color: var(--accent-blurple);
      border-bottom-color: var(--accent-blurple);
      background: rgba(88, 101, 242, 0.05);
    }
    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .tab-panel {
      display: none;
    }
    .tab-panel.active {
      display: block;
    }

    /* MEMBERS LIST */
    .search-input {
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.82rem;
      margin-bottom: 12px;
      outline: none;
    }
    .member-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      margin-bottom: 6px;
      border-radius: 6px;
      background: var(--bg-elevated);
      border: 1px solid rgba(255, 255, 255, 0.03);
    }
    .member-info {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .member-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
    }
    .member-name {
      font-size: 0.84rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      font-size: 0.7rem;
      cursor: pointer;
    }
    .mini-btn:hover {
      color: #fff;
      border-color: var(--accent-ruby);
    }

    /* DIRECTIVES TAB */
    .directive-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      padding: 10px 12px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 0.82rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }
    .directive-text {
      color: var(--text-main);
      line-height: 1.4;
    }

    /* EMBED MODAL */
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
      width: 500px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .modal-title {
      font-size: 1.1rem;
      font-weight: 800;
    }
    .field-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .field-input, .field-textarea {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.88rem;
      outline: none;
    }
    .field-textarea {
      height: 80px;
      resize: vertical;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 10px;
    }
  </style>
</head>
<body>

  <!-- HEADER -->
  <header>
    <div class="brand">
      <img id="botAvatar" src="https://cdn.discordapp.com/embed/avatars/0.png" alt="EditX Bot">
      <span id="guildName">EDITX | The Creative Network</span>
    </div>

    <div class="stats-pills">
      <div class="pill online"><span style="color:var(--accent-emerald)">●</span> Gateway Online</div>
      <div class="pill" id="memberCountPill">👥 238 Members</div>
      <div class="pill" id="boostTierPill">🚀 Boost Level 2 (7)</div>
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

    <!-- 1. LEFT PANE: CHANNELS HIERARCHY -->
    <div class="channels-pane">
      <div class="pane-header">Server Channels & Categories</div>
      <div class="channel-tree" id="channelTree">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- 2. CENTER PANE: CHAT COCKPIT -->
    <div class="chat-pane">
      <div class="chat-header">
        <div class="channel-meta">
          <div class="channel-title" id="activeChannelTitle">#💬・general-chat</div>
          <div class="channel-desc" id="activeChannelTopic">The central hub for the EDITX community.</div>
        </div>
        <div class="chat-actions">
          <button class="action-btn" onclick="purgeChannel(10)">🧹 Purge 10</button>
          <button class="action-btn" onclick="refreshMessages()">🔄 Refresh</button>
        </div>
      </div>

      <!-- MESSAGES STREAM -->
      <div class="messages-stream" id="messagesStream">
        <!-- Rendered dynamically -->
      </div>

      <!-- INPUT BAR -->
      <div class="chat-input-bar">
        <div class="takeover-badge-indicator">
          <div class="bot-speaking-badge">
            <span>🎭</span> Speaking directly as <strong>EditX#0799 (Verified Bot)</strong>
          </div>
          <div id="replyingNotice" style="display:none; color:var(--accent-amber);">
            Replying to <span id="replyUser"></span> • <a href="#" onclick="cancelReply()" style="color:var(--accent-ruby)">Cancel</a>
          </div>
        </div>
        <div class="input-box-wrap">
          <input type="text" id="chatInput" class="chat-input" placeholder="Type a message as EditX Bot... (Press Enter to send)" onkeydown="handleInputKey(event)">
          <button class="embed-modal-trigger" onclick="openEmbedModal()">📢 Embed</button>
          <button class="send-btn" onclick="sendTextMessage()">Send</button>
        </div>
      </div>
    </div>

    <!-- 3. RIGHT PANE: TOOLS & MODERATION -->
    <div class="tools-pane">
      <div class="tab-bar">
        <div class="tab-item active" onclick="switchTab('members')">Members</div>
        <div class="tab-item" onclick="switchTab('rules')">Directives</div>
        <div class="tab-item" onclick="switchTab('telemetry')">Telemetry</div>
      </div>

      <div class="tab-content">
        <!-- MEMBERS TAB -->
        <div class="tab-panel active" id="tab-members">
          <input type="text" id="memberSearch" class="search-input" placeholder="Search members by name or ID..." oninput="searchMembers(this.value)">
          <div id="membersList">Loading members...</div>
        </div>

        <!-- DIRECTIVES TAB -->
        <div class="tab-panel" id="tab-rules">
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">
            Active rules EditX Bot is instructed to strictly obey:
          </div>
          <div id="directivesList">Loading directives...</div>
          <div style="margin-top:14px; display:flex; gap:6px;">
            <input type="text" id="newDirectiveInput" class="search-input" placeholder="Add new rule..." style="margin-bottom:0;">
            <button class="send-btn" style="padding:0 12px; font-size:0.8rem;" onclick="addDirective()">Add</button>
          </div>
        </div>

        <!-- TELEMETRY TAB -->
        <div class="tab-panel" id="tab-telemetry">
          <div style="font-size:0.82rem; line-height:1.6; color:var(--text-muted);">
            <p><strong>Operator Status:</strong> <span id="telemetryStatus" style="color:var(--accent-emerald)">Connected</span></p>
            <p><strong>Heartbeat Watchdog:</strong> 12s Auto-Release Active</p>
            <p><strong>AI Autopilot Suppression:</strong> <span id="telemetryScope">Channel-Specific</span></p>
            <p style="margin-top:12px; font-size:0.75rem; color:var(--text-dim);">
              Closing this browser window or running release will immediately hand full autonomous control back to EditX Bot.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- EMBED BUILDER MODAL -->
  <div class="modal-overlay" id="embedModal">
    <div class="modal-card">
      <div class="modal-title">📢 Send Rich Discord Embed as EditX Bot</div>
      <div class="field-row">
        <label class="field-label">Title</label>
        <input type="text" id="embedTitle" class="field-input" placeholder="e.g. Server Announcement or Notice">
      </div>
      <div class="field-row">
        <label class="field-label">Description</label>
        <textarea id="embedDesc" class="field-textarea" placeholder="Embed content text, markdown supported..."></textarea>
      </div>
      <div class="field-row">
        <label class="field-label">Color (Hex)</label>
        <input type="text" id="embedColor" class="field-input" value="#5865F2">
      </div>
      <div class="field-row">
        <label class="field-label">Footer</label>
        <input type="text" id="embedFooter" class="field-input" placeholder="e.g. EDITX | Official Support Dispatch">
      </div>
      <div class="modal-actions">
        <button class="action-btn" onclick="closeEmbedModal()">Cancel</button>
        <button class="send-btn" onclick="dispatchEmbed()">Send Embed</button>
      </div>
    </div>
  </div>

  <script>
    let activeChannelId = '1554151421056647290'; // default #general-chat
    let takeoverEnabled = false;
    let replyTargetId = null;

    // Initial Boot
    document.addEventListener('DOMContentLoaded', () => {
      fetchStatus();
      loadChannels();
      connectSSE();
      setInterval(sendHeartbeat, 3000);
      searchMembers('');
      loadDirectives();
    });

    // Auto-Release on Window Unload / Close
    window.addEventListener('beforeunload', () => {
      navigator.sendBeacon('/api/takeover/release');
    });

    function sendHeartbeat() {
      if (takeoverEnabled) {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
      }
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.botUser) {
          document.getElementById('botAvatar').src = data.botUser.avatar;
        }
        if (data.guild) {
          document.getElementById('guildName').textContent = data.guild.name;
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
          body: JSON.stringify({ channelId: activeChannelId })
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
        document.getElementById('telemetryScope').textContent = 'Paused (You are in control)';
      } else {
        btn.className = 'takeover-btn bot-mode';
        icon.textContent = '🤖';
        label.textContent = 'Bot Auto-Pilot: ONLINE';
        document.getElementById('telemetryScope').textContent = 'Active (Autonomous)';
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
        const res = await fetch('/api/channels');
        const data = await res.json();
        const tree = document.getElementById('channelTree');
        tree.innerHTML = '';

        for (const cat of data.categories) {
          const block = document.createElement('div');
          block.className = 'cat-block';
          block.innerHTML = '<div class="cat-title">' + cat.name + '</div>';

          for (const ch of cat.channels) {
            const item = document.createElement('div');
            item.className = 'channel-item' + (ch.id === activeChannelId ? ' active' : '');
            item.innerHTML = (ch.type === 2 ? '🔊 ' : '# ') + ch.name;
            item.onclick = () => selectChannel(ch.id, ch.name, ch.topic);
            block.appendChild(item);
          }
          tree.appendChild(block);
        }

        // Auto-select general-chat if active
        selectChannel(activeChannelId, '💬・general-chat', 'The central hub for the EDITX community.');
      } catch (e) {}
    }

    function selectChannel(id, name, topic) {
      activeChannelId = id;
      document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
      const activeEl = Array.from(document.querySelectorAll('.channel-item')).find(el => el.textContent.includes(name));
      if (activeEl) activeEl.classList.add('active');

      document.getElementById('activeChannelTitle').textContent = '#' + name;
      document.getElementById('activeChannelTopic').textContent = topic || 'No topic set.';
      loadMessages(id);
    }

    async function loadMessages(channelId) {
      try {
        const res = await fetch('/api/channels/' + channelId + '/messages');
        const data = await res.json();
        renderMessages(data.messages || []);
      } catch (e) {}
    }

    function refreshMessages() {
      loadMessages(activeChannelId);
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
            attachmentsHtml += '<img src="' + att.url + '" style="max-width:320px; border-radius:6px; margin-top:8px; display:block;">';
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
        '</div>' +
        '<div class="msg-actions">' +
          '<button class="msg-act-btn" onclick="prepareReply(\\'' + m.id + '\\', \\'' + escapeHtml(m.author.displayName) + '\\')">Reply</button>' +
          '<button class="msg-act-btn del" onclick="deleteMessage(\\'' + m.id + '\\')">🗑️</button>' +
        '</div>';

      stream.appendChild(card);
    }

    function handleInputKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    }

    async function sendTextMessage() {
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      try {
        await fetch('/api/channels/' + activeChannelId + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: text,
            replyTo: replyTargetId
          })
        });
        cancelReply();
        setTimeout(() => loadMessages(activeChannelId), 300);
      } catch (e) {}
    }

    function prepareReply(msgId, authorName) {
      replyTargetId = msgId;
      document.getElementById('replyingNotice').style.display = 'block';
      document.getElementById('replyUser').textContent = authorName;
      document.getElementById('chatInput').focus();
    }

    function cancelReply() {
      replyTargetId = null;
      document.getElementById('replyingNotice').style.display = 'none';
    }

    async function deleteMessage(msgId) {
      if (!confirm('Delete this message from Discord?')) return;
      try {
        await fetch('/api/channels/' + activeChannelId + '/delete/' + msgId, { method: 'DELETE' });
        const el = document.getElementById('msg-' + msgId);
        if (el) el.remove();
      } catch (e) {}
    }

    async function purgeChannel(amount) {
      if (!confirm('Purge last ' + amount + ' messages in #' + document.getElementById('activeChannelTitle').textContent + '?')) return;
      try {
        await fetch('/api/channels/' + activeChannelId + '/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount })
        });
        setTimeout(() => loadMessages(activeChannelId), 500);
      } catch (e) {}
    }

    /* EMBED MODAL */
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

      if (!title && !description) return alert('Please enter at least a title or description');

      try {
        await fetch('/api/channels/' + activeChannelId + '/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embed: { title, description, color, footer }
          })
        });
        closeEmbedModal();
        document.getElementById('embedTitle').value = '';
        document.getElementById('embedDesc').value = '';
        setTimeout(() => loadMessages(activeChannelId), 300);
      } catch (e) {}
    }

    /* SSE STREAM */
    function connectSSE() {
      const es = new EventSource('/api/events');
      es.addEventListener('new_message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.channelId === activeChannelId) {
          appendMessageElement(msg);
          const stream = document.getElementById('messagesStream');
          stream.scrollTop = stream.scrollHeight;
        }
      });
      es.addEventListener('takeover_change', (e) => {
        const d = JSON.parse(e.data);
        setTakeoverUI(d.active);
      });
    }

    /* RIGHT TABS */
    function switchTab(name) {
      document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
    }

    async function searchMembers(query) {
      try {
        const res = await fetch('/api/members?q=' + encodeURIComponent(query));
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
              '<button class="mini-btn" onclick="memberAction(\\'' + m.id + '\\', \\'timeout\\')">Mute</button>' +
              '<button class="mini-btn" onclick="memberAction(\\'' + m.id + '\\', \\'kick\\')">Kick</button>' +
            '</div>';
          list.appendChild(row);
        }
      } catch (e) {}
    }

    async function memberAction(memberId, action) {
      if (!confirm('Execute ' + action + ' on member ID ' + memberId + '?')) return;
      try {
        await fetch('/api/members/' + memberId + '/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        alert('Action ' + action + ' executed successfully.');
      } catch (e) {}
    }

    async function loadDirectives() {
      try {
        const res = await fetch('/api/directives');
        const data = await res.json();
        const list = document.getElementById('directivesList');
        list.innerHTML = '';
        (data.directives || []).forEach((d, idx) => {
          const card = document.createElement('div');
          card.className = 'directive-card';
          card.innerHTML = 
            '<div class="directive-text">' + escapeHtml(d) + '</div>' +
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
        await fetch('/api/directives/add', {
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
        await fetch('/api/directives/remove', {
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

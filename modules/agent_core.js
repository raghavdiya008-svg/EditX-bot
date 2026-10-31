/**
 * EditX Autonomous Server Agent Core
 * 
 * Transforms the bot from a scripted regex matcher into a true Autonomous AI Agent.
 * Powers natural language reasoning with real Discord function calling / tools:
 * - moderate_user (kick, ban, timeout, warn, softban)
 * - purge_messages (bulk delete with filters)
 * - manage_channel (slowmode, lock, unlock)
 * - manage_role (grant, revoke roles)
 * - inspect_user (account age, join date, warning count, roles)
 * - read_channel_messages (investigate context/disputes in any channel)
 * - get_server_status (real telemetry, health, metrics)
 * - create_announcement (formatted luxury embeds)
 * - save_directive (persistent custom rules in #bot-rules)
 * - toggle_ai_silence (mute/unmute channels)
 */

const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { GoogleGenAI, Type } = require('@google/genai');

class AgentCore {
  constructor(client, db, botMemory = null) {
    this.client = client;
    this.db = db;
    this.botMemory = botMemory;
    this.geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.groqKey = process.env.GROQ_API_KEY;

    this.gemini = this.geminiKey ? new GoogleGenAI({ apiKey: this.geminiKey }) : null;
    this.botOwnerId = this.client?.botOwnerId || process.env.BOT_OWNER_ID || '';
  }

  setBotMemory(botMemory) {
    this.botMemory = botMemory;
  }

  /**
   * Tool declarations for OpenAI/Groq compatible function calling
   */
  getGroqTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'moderate_user',
          description: 'Take moderation action on a user (warn, timeout, untimeout, kick, ban, or softban). Staff/Admin only.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'User ID or @mention of target' },
              action: { type: 'string', enum: ['warn', 'timeout', 'untimeout', 'kick', 'ban', 'softban'], description: 'Action to execute' },
              duration_minutes: { type: 'number', description: 'Duration in minutes (required for timeout, e.g. 10, 60, 1440)' },
              reason: { type: 'string', description: 'Reason for the moderation action' }
            },
            required: ['target', 'action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'purge_messages',
          description: 'Delete recent messages in a channel in bulk OR delete a specific referenced message by message_id. Staff only.',
          parameters: {
            type: 'object',
            properties: {
              count: { type: 'number', description: 'Number of messages to delete (1-100)' },
              message_id: { type: 'string', description: 'Specific message ID to delete (e.g. when instructed to "remove this" or delete a reply)' },
              channel: { type: 'string', description: 'Channel name, ID or mention (defaults to current channel)' },
              user_filter: { type: 'string', description: 'Optional: only delete messages sent by this user ID or mention' },
              keyword: { type: 'string', description: 'Optional: only delete messages containing this text' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'manage_channel',
          description: 'Control channel slowmode cooldown or lock/unlock the channel against active raids. Staff only.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['slowmode', 'lock', 'unlock'], description: 'Action to perform' },
              seconds: { type: 'number', description: 'Seconds of slowmode (0 to disable, up to 21600)' },
              channel: { type: 'string', description: 'Target channel name, ID, or mention (defaults to current)' },
              reason: { type: 'string', description: 'Optional reason for the lock or slowmode' }
            },
            required: ['action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'manage_role',
          description: 'Assign or remove a role from a member. Staff only.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'User ID or @mention' },
              role_name_or_id: { type: 'string', description: 'Name or ID of the role to give or take' },
              action: { type: 'string', enum: ['add', 'remove'], description: 'Add or remove role' }
            },
            required: ['target', 'role_name_or_id', 'action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'inspect_user',
          description: 'Perform a background check on a member: account age, server join date, roles, active warnings, and invite stats.',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'User ID or @mention of member' }
            },
            required: ['target']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'read_channel_messages',
          description: 'Read the recent messages in a channel to understand a dispute, investigate an issue, or catch up on context.',
          parameters: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'Channel name, ID or mention' },
              limit: { type: 'number', description: 'Number of messages to inspect (5 to 30, default 15)' }
            },
            required: ['channel']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_server_status',
          description: 'Retrieve real-time server telemetry: member count, active support tickets, recent incident logs, and bot health.',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'save_directive',
          description: 'Add, remove, or list persistent directives/rules for the bot to strictly obey (saved to #bot-rules). Admins only.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'remove', 'list', 'clear'], description: 'Action to take' },
              directive_text: { type: 'string', description: 'Instruction or rule text (for add/remove)' }
            },
            required: ['action']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_announcement',
          description: 'Post a polished, formatted announcement embed into a designated announcement or showcase channel. Staff only.',
          parameters: {
            type: 'object',
            properties: {
              channel: { type: 'string', description: 'Target channel name, ID, or mention' },
              title: { type: 'string', description: 'Announcement title' },
              content: { type: 'string', description: 'Announcement content text' },
              color: { type: 'string', description: 'Hex color code (e.g. #00F0FF or #5865F2)' }
            },
            required: ['channel', 'title', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'toggle_ai_silence',
          description: 'Mute or unmute the AI assistant from replying in a specific channel or across the entire server. Staff only.',
          parameters: {
            type: 'object',
            properties: {
              scope: { type: 'string', enum: ['channel', 'server'], description: 'Channel-only or server-wide' },
              silence: { type: 'boolean', description: 'True to mute/be quiet, False to unmute/resume' },
              channel: { type: 'string', description: 'Channel name or mention (for channel scope)' }
            },
            required: ['scope', 'silence']
          }
        }
      }
    ];
  }

  /**
   * Tool declarations for Google Gemini (@google/genai)
   */
  getGeminiTools() {
    return [
      {
        name: 'moderate_user',
        description: 'Take moderation action on a user (warn, timeout, untimeout, kick, ban, or softban). Staff/Admin only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: { type: Type.STRING, description: 'User ID or @mention of target' },
            action: { type: Type.STRING, description: 'warn, timeout, untimeout, kick, ban, or softban' },
            duration_minutes: { type: Type.NUMBER, description: 'Duration in minutes (required for timeout, e.g. 10, 60, 1440)' },
            reason: { type: Type.STRING, description: 'Reason for the moderation action' }
          },
          required: ['target', 'action']
        }
      },
      {
        name: 'purge_messages',
        description: 'Delete recent messages in a channel in bulk OR delete a specific referenced message by message_id. Staff only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            count: { type: Type.NUMBER, description: 'Number of messages to delete (1-100)' },
            message_id: { type: Type.STRING, description: 'Specific message ID to delete' },
            channel: { type: Type.STRING, description: 'Channel name, ID or mention (defaults to current channel)' },
            user_filter: { type: Type.STRING, description: 'Optional: only delete messages sent by this user ID or mention' },
            keyword: { type: Type.STRING, description: 'Optional: only delete messages containing this text' }
          }
        }
      },
      {
        name: 'manage_channel',
        description: 'Control channel slowmode cooldown or lock/unlock the channel against active raids. Staff only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, description: 'slowmode, lock, or unlock' },
            seconds: { type: Type.NUMBER, description: 'Seconds of slowmode (0 to disable, up to 21600)' },
            channel: { type: Type.STRING, description: 'Target channel name, ID, or mention (defaults to current)' },
            reason: { type: Type.STRING, description: 'Optional reason for the lock or slowmode' }
          },
          required: ['action']
        }
      },
      {
        name: 'manage_role',
        description: 'Assign or remove a role from a member. Staff only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: { type: Type.STRING, description: 'User ID or @mention' },
            role_name_or_id: { type: Type.STRING, description: 'Name or ID of the role to give or take' },
            action: { type: Type.STRING, description: 'add or remove' }
          },
          required: ['target', 'role_name_or_id', 'action']
        }
      },
      {
        name: 'inspect_user',
        description: 'Perform a background check on a member: account age, server join date, roles, active warnings, and invite stats.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            target: { type: Type.STRING, description: 'User ID or @mention of member' }
          },
          required: ['target']
        }
      },
      {
        name: 'read_channel_messages',
        description: 'Read the recent messages in a channel to understand a dispute, investigate an issue, or catch up on context.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            channel: { type: Type.STRING, description: 'Channel name, ID or mention' },
            limit: { type: Type.NUMBER, description: 'Number of messages to inspect (5 to 30, default 15)' }
          },
          required: ['channel']
        }
      },
      {
        name: 'get_server_status',
        description: 'Retrieve real-time server telemetry: member count, active support tickets, recent incident logs, and bot health.',
        parameters: {
          type: Type.OBJECT,
          properties: {}
        }
      },
      {
        name: 'save_directive',
        description: 'Add, remove, or list persistent directives/rules for the bot to strictly obey (saved to #bot-rules). Admins only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, description: 'add, remove, list, or clear' },
            directive_text: { type: Type.STRING, description: 'Instruction or rule text (for add/remove)' }
          },
          required: ['action']
        }
      },
      {
        name: 'create_announcement',
        description: 'Post a polished, formatted announcement embed into a designated announcement or showcase channel. Staff only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            channel: { type: Type.STRING, description: 'Target channel name, ID, or mention' },
            title: { type: Type.STRING, description: 'Announcement title' },
            content: { type: Type.STRING, description: 'Announcement content text' },
            color: { type: Type.STRING, description: 'Hex color code (e.g. #00F0FF or #5865F2)' }
          },
          required: ['channel', 'title', 'content']
        }
      },
      {
        name: 'toggle_ai_silence',
        description: 'Mute or unmute the AI assistant from replying in a specific channel or across the entire server. Staff only.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            scope: { type: Type.STRING, description: 'channel or server' },
            silence: { type: Type.BOOLEAN, description: 'True to mute/be quiet, False to unmute/resume' },
            channel: { type: Type.STRING, description: 'Channel name or mention (for channel scope)' }
          },
          required: ['scope', 'silence']
        }
      }
    ];
  }

  /**
   * Resolves a target user or member from ID, mention, or username
   */
  async resolveMember(guild, rawTarget) {
    if (!guild || !rawTarget) return null;
    const cleanId = rawTarget.replace(/[<@!>]/g, '').trim();
    if (guild.members?.cache?.has(cleanId)) {
      return guild.members.cache.get(cleanId);
    }
    if (/^\d{17,20}$/.test(cleanId) && typeof guild.members?.fetch === 'function') {
      const fetched = await guild.members.fetch(cleanId).catch(() => null);
      if (fetched) return fetched;
    }
    // Search cache by username/display name
    const lower = rawTarget.toLowerCase().replace(/^@/, '');
    const cache = guild.members?.cache;
    if (!cache) return null;
    if (typeof cache.find === 'function') {
      return cache.find(m =>
        m.user?.username?.toLowerCase() === lower ||
        (m.displayName && m.displayName.toLowerCase() === lower)
      ) || null;
    }
    for (const m of cache.values()) {
      if (m.user?.username?.toLowerCase() === lower || (m.displayName && m.displayName.toLowerCase() === lower)) {
        return m;
      }
    }
    return null;
  }

  /**
   * Resolves a channel from ID, mention, or name
   */
  resolveChannel(guild, rawChannel, defaultChannel = null) {
    if (!rawChannel) return defaultChannel;
    const cleanId = rawChannel.replace(/[<#>]/g, '').trim();
    if (cleanId && guild.channels?.cache?.has(cleanId)) {
      return guild.channels.cache.get(cleanId);
    }
    const cleanName = rawChannel.toLowerCase().replace(/^[#・\s]+/, '');
    const cache = guild.channels?.cache;
    if (!cache) return defaultChannel;
    if (typeof cache.find === 'function') {
      return cache.find(c =>
        c.name.toLowerCase().includes(cleanName) ||
        cleanName.includes(c.name.toLowerCase())
      ) || defaultChannel;
    }
    for (const c of cache.values()) {
      if (c.name.toLowerCase().includes(cleanName) || cleanName.includes(c.name.toLowerCase())) {
        return c;
      }
    }
    return defaultChannel;
  }

  /**
   * Permission Gatekeeper for Agent Tools
   */
  sanitizeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff]/g, '');
  }

  hasPermission(author, member, requiredPerm) {
    if (author.id === this.botOwnerId) return true;
    if (member?.guild && author.id === member.guild.ownerId) return true;
    if (member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (!requiredPerm) return true;
    return Boolean(member?.permissions?.has(requiredPerm));
  }

  /**
   * Executes a tool called by the Agent model
   */
  async executeTool(name, args, context) {
    const { guild, channel, author, member } = context;

    try {
      switch (name) {
        case 'moderate_user': {
          const action = (args.action || '').toLowerCase();
          const reason = args.reason || `Action executed via AI Copilot by ${author.username}`;

          // Permission Check
          if (action === 'warn') {
            if (!this.hasPermission(author, member, PermissionFlagsBits.ModerateMembers)) {
              return { error: 'Permission Denied: You need the Moderate Members permission to issue warnings.' };
            }
          } else if (action === 'timeout' || action === 'untimeout') {
            if (!this.hasPermission(author, member, PermissionFlagsBits.ModerateMembers)) {
              return { error: 'Permission Denied: You need the Moderate Members permission to manage timeouts.' };
            }
          } else if (action === 'kick') {
            if (!this.hasPermission(author, member, PermissionFlagsBits.KickMembers)) {
              return { error: 'Permission Denied: You need the Kick Members permission.' };
            }
          } else if (action === 'ban' || action === 'softban') {
            if (!this.hasPermission(author, member, PermissionFlagsBits.BanMembers)) {
              return { error: 'Permission Denied: You need the Ban Members permission.' };
            }
          }

          const targetMember = await this.resolveMember(guild, args.target);
          if (!targetMember) {
            return { error: `Could not find member "${args.target}" in this server.` };
          }
          if (targetMember.id === this.client.user.id) {
            return { error: 'I cannot take moderation action against myself.' };
          }
          if (targetMember.id === guild.ownerId || targetMember.id === this.botOwnerId) {
            return { error: 'Cannot moderate the Server Owner or Supreme Bot Owner.' };
          }

          // Strict Hierarchy Check: Caller cannot moderate equal or higher role
          if (member?.roles?.highest && targetMember.roles?.highest) {
            if (targetMember.roles.highest.position >= member.roles.highest.position &&
                author.id !== guild.ownerId &&
                author.id !== this.botOwnerId) {
              return { error: `Hierarchy Violation: ${targetMember.user.username} has an equal or higher role than you.` };
            }
          }

          const casesDb = this.db.cases;
          const caseCounterKey = `counter_${guild.id}`;
          const nextCaseId = (casesDb?.get ? (casesDb.get(caseCounterKey) || 0) : 0) + 1;
          if (casesDb?.set) {
            casesDb.set(caseCounterKey, nextCaseId);
            casesDb.set(`case_${guild.id}_${nextCaseId}`, {
              id: nextCaseId,
              guildId: guild.id,
              action: action.toUpperCase(),
              targetId: targetMember.id,
              targetTag: targetMember.user.tag || targetMember.user.username,
              moderatorId: author.id,
              moderatorTag: author.tag || author.username,
              reason,
              timestamp: Date.now()
            });
          }

          if (action === 'warn') {
            const secDb = this.db.security || this.db.config;
            const warnKey = `warns_${guild.id}_${targetMember.id}`;
            const warns = secDb?.get ? (secDb.get(warnKey) || []) : [];
            warns.push({ caseId: nextCaseId, reason, by: author.id, timestamp: Date.now() });
            if (secDb?.set) secDb.set(warnKey, warns);

            let qNotice = '';
            if (warns.length >= 7) {
              const qKey = `quarantine_${guild.id}_${targetMember.id}`;
              const jailKey = `jail_roles_${guild.id}_${targetMember.id}`;
              const config = secDb?.get ? (secDb.get(guild.id) || {}) : {};
              const qRoleId = config.quarantineRole || '1546811342369984652';
              const qRole = guild.roles?.cache?.get(qRoleId) ||
                (guild.roles?.cache ? Array.from(guild.roles.cache.values()).find(r => r.name.toLowerCase() === 'quarantine') : null);

              if (qRole) {
                const oldRoles = targetMember.roles?.cache
                  ? Array.from(targetMember.roles.cache.values()).filter(r => r.id !== guild.id && r.id !== qRole.id && !r.managed).map(r => r.id)
                  : [];
                if (oldRoles.length > 0 && secDb?.set) secDb.set(jailKey, oldRoles);
                if (secDb?.set) {
                  secDb.set(qKey, {
                    active: true,
                    userId: targetMember.id,
                    userTag: targetMember.user?.tag || targetMember.user?.username,
                    reason: `Accumulated ${warns.length} warnings (7+ threshold reached)`,
                    type: 'EXCESSIVE_WARNINGS',
                    timestamp: Date.now(),
                    moderatorId: author.id
                  });
                }
                if (typeof targetMember.roles?.set === 'function') {
                  await targetMember.roles.set([qRole.id], 'Quarantine: 7+ warnings reached').catch(() => {});
                }
                qNotice = ` 🚨 **NOTICE:** ${targetMember.user.username} has reached **${warns.length} warnings** and was automatically placed into **Quarantine/Observation**. All roles stripped; they must appeal and be approved by Staff or the Owner to be released.`;
              }
            }

            return { success: true, message: `Warned ${targetMember.user.username} for "${reason}". (Case #${nextCaseId}, Total Warns: ${warns.length})${qNotice}` };
          }

          if (action === 'timeout') {
            const mins = args.duration_minutes ? Math.min(Math.max(1, args.duration_minutes), 40320) : 60;
            if (!targetMember.moderatable) {
              return { error: `Cannot timeout ${targetMember.user.username} (target has equal or higher role than bot).` };
            }
            await targetMember.timeout(mins * 60000, reason);
            return { success: true, message: `Timed out ${targetMember.user.username} for ${mins} minute(s). Reason: ${reason} (Case #${nextCaseId})` };
          }

          if (action === 'untimeout') {
            if (!targetMember.moderatable) {
              return { error: `Cannot modify timeout for ${targetMember.user.username}.` };
            }
            await targetMember.timeout(null, reason);
            return { success: true, message: `Removed timeout from ${targetMember.user.username}. (Case #${nextCaseId})` };
          }

          if (action === 'kick') {
            if (!targetMember.kickable) {
              return { error: `Cannot kick ${targetMember.user.username} (higher role hierarchy).` };
            }
            await targetMember.kick(reason);
            return { success: true, message: `Kicked ${targetMember.user.username} from server. Reason: ${reason} (Case #${nextCaseId})` };
          }

          if (action === 'ban') {
            if (!targetMember.bannable) {
              return { error: `Cannot ban ${targetMember.user.username} (higher role hierarchy).` };
            }
            await guild.members.ban(targetMember.id, { reason });
            return { success: true, message: `Permanently banned ${targetMember.user.username}. Reason: ${reason} (Case #${nextCaseId})` };
          }

          if (action === 'softban') {
            if (!targetMember.bannable) {
              return { error: `Cannot softban ${targetMember.user.username}.` };
            }
            await guild.members.ban(targetMember.id, { reason: `Softban: ${reason}`, deleteMessageSeconds: 86400 * 7 });
            await guild.members.unban(targetMember.id, 'Softban complete');
            return { success: true, message: `Softbanned ${targetMember.user.username} and purged their past 7 days of messages. (Case #${nextCaseId})` };
          }
          break;
        }

        case 'purge_messages': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.ManageMessages)) {
            return { error: 'Permission Denied: You need Manage Messages permission to purge messages.' };
          }
          const targetChan = this.resolveChannel(guild, args.channel, channel);
          if (!targetChan || !targetChan.bulkDelete) {
            return { error: 'Invalid text channel for purge.' };
          }

          // Case 1: Specific single message deletion (e.g. from reply or explicit message_id)
          const singleTargetId = args.message_id || (!args.count && context.referencedMessage ? context.referencedMessage.id : null);
          if (singleTargetId) {
            const singleMsg = await targetChan.messages.fetch(singleTargetId).catch(() => null);
            if (singleMsg && typeof singleMsg.delete === 'function') {
              await singleMsg.delete().catch(() => {});
              if (context.message && typeof context.message.delete === 'function') {
                await context.message.delete().catch(() => {});
              }
              return { success: true, message: `Successfully deleted the target message.` };
            }
          }

          // Case 2: Accurate bulk purge count
          const count = Math.min(Math.max(1, parseInt(args.count) || 10), 100);
          // Fetch count + 5 to ensure we fetch enough messages excluding the caller's command message
          const fetchLimit = Math.min(count + 5, 100);
          const messages = await targetChan.messages.fetch({ limit: fetchLimit }).catch(() => null);
          if (!messages || messages.size === 0) {
            return { error: 'No recent messages found to purge.' };
          }

          let toDelete = Array.from(messages.values());

          // Identify and separate caller command message so it doesn't count against the user's requested amount
          const callerMsgId = context.message?.id;
          let callerMsg = null;
          if (callerMsgId) {
            callerMsg = toDelete.find(m => m.id === callerMsgId);
            toDelete = toDelete.filter(m => m.id !== callerMsgId);
          }

          if (args.user_filter) {
            const cleanUid = args.user_filter.replace(/[<@!>]/g, '').trim();
            toDelete = toDelete.filter(m => m.author.id === cleanUid || m.author.username.toLowerCase() === args.user_filter.toLowerCase());
          }
          if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            toDelete = toDelete.filter(m => (m.content || '').toLowerCase().includes(kw));
          }

          // Take EXACTLY 'count' target messages that were sent before the command
          toDelete = toDelete.slice(0, count);

          // Add caller message back so the command message is also cleaned up
          if (callerMsg) {
            toDelete.push(callerMsg);
          }

          // Do not delete messages older than 14 days (Discord API limit)
          const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          toDelete = toDelete.filter(m => m.createdTimestamp > fourteenDaysAgo);

          if (toDelete.length === 0) {
            return { message: 'No messages matched the specified filter criteria within the last 14 days.' };
          }

          await targetChan.bulkDelete(toDelete).catch(() => {});
          const actualTargetCount = callerMsg ? toDelete.length - 1 : toDelete.length;
          return { success: true, message: `Successfully purged ${actualTargetCount} message(s) in #${targetChan.name}.` };
        }

        case 'manage_channel': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.ManageChannels)) {
            return { error: 'Permission Denied: You need Manage Channels permission.' };
          }
          const targetChan = this.resolveChannel(guild, args.channel, channel);
          if (!targetChan) return { error: 'Channel not found.' };

          if (args.action === 'slowmode') {
            const seconds = Math.min(Math.max(0, parseInt(args.seconds) || 0), 21600);
            await targetChan.setRateLimitPerUser(seconds, args.reason || 'Set by AI Copilot');
            return { success: true, message: `Set slowmode cooldown to ${seconds}s in #${targetChan.name}${seconds === 0 ? ' (disabled)' : ''}.` };
          }

          if (args.action === 'lock') {
            await targetChan.permissionOverwrites.edit(guild.roles.everyone, {
              SendMessages: false
            }, { reason: args.reason || 'Locked by AI Copilot' });
            return { success: true, message: `Locked #${targetChan.name} against regular member messages.` };
          }

          if (args.action === 'unlock') {
            await targetChan.permissionOverwrites.edit(guild.roles.everyone, {
              SendMessages: null
            }, { reason: args.reason || 'Unlocked by AI Copilot' });
            return { success: true, message: `Unlocked #${targetChan.name}. Members can send messages again.` };
          }
          break;
        }

        case 'manage_role': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.ManageRoles)) {
            return { error: 'Permission Denied: You need Manage Roles permission.' };
          }
          const targetMember = await this.resolveMember(guild, args.target);
          if (!targetMember) return { error: `Could not find member "${args.target}".` };

          const roleQuery = (args.role_name_or_id || '').toLowerCase().trim();
          const roleCache = guild.roles?.cache;
          let role = roleCache?.get(roleQuery);
          if (!role && roleCache) {
            if (typeof roleCache.find === 'function') {
              role = roleCache.find(r => r.name.toLowerCase() === roleQuery || r.name.toLowerCase().includes(roleQuery));
            } else {
              for (const r of roleCache.values()) {
                if (r.name.toLowerCase() === roleQuery || r.name.toLowerCase().includes(roleQuery)) {
                  role = r;
                  break;
                }
              }
            }
          }

          if (!role) {
            return { error: `Role "${args.role_name_or_id}" not found on server.` };
          }
          if (role.managed) {
            return { error: `Role "${role.name}" is managed by an integration and cannot be assigned manually.` };
          }

          const botMember = guild.members.me;
          if (botMember && role.position >= botMember.roles.highest.position) {
            return { error: `Cannot manage role "${role.name}" because it is equal to or higher than my highest role.` };
          }

          if (args.action === 'add') {
            await targetMember.roles.add(role);
            return { success: true, message: `Granted role @${role.name} to ${targetMember.user.username}.` };
          } else {
            await targetMember.roles.remove(role);
            return { success: true, message: `Removed role @${role.name} from ${targetMember.user.username}.` };
          }
        }

        case 'inspect_user': {
          const targetMember = await this.resolveMember(guild, args.target);
          if (!targetMember) return { error: `Member "${args.target}" not found.` };

          const user = targetMember.user;
          const accountAgeDays = Math.floor((Date.now() - user.createdTimestamp) / (24 * 60 * 60 * 1000));
          const joinedDays = targetMember.joinedTimestamp ? Math.floor((Date.now() - targetMember.joinedTimestamp) / (24 * 60 * 60 * 1000)) : 0;
          let roles = 'No roles';
          const rCache = targetMember.roles?.cache;
          if (rCache) {
            const roleList = typeof rCache.filter === 'function' 
              ? Array.from(rCache.filter(r => r.id !== guild.id).values())
              : Array.from(rCache.values()).filter(r => r.id !== guild.id);
            roles = roleList.map(r => r.name).join(', ') || 'No roles';
          }

          const secDb = this.db.security || this.db.config;
          const warns = secDb?.get ? (secDb.get(`warns_${guild.id}_${user.id}`) || []) : [];

          const invDb = this.db.invites;
          const invKey = `${guild.id}_${user.id}`;
          const invData = invDb?.get ? (invDb.get(invKey) || {}) : {};
          const realInvites = (invData.regular || 0) - (invData.leaves || 0) - (invData.fake || 0) + (invData.bonus || 0);

          return {
            username: user.tag || user.username,
            id: user.id,
            account_age: `${accountAgeDays} days ago`,
            joined_server: `${joinedDays} days ago`,
            roles,
            active_warnings: warns.length,
            recent_warning_reasons: warns.slice(-3).map(w => w.reason),
            real_invites: realInvites,
            is_suspicious_new_account: accountAgeDays < 3
          };
        }

        case 'read_channel_messages': {
          const targetChan = this.resolveChannel(guild, args.channel, channel);
          if (!targetChan || !targetChan.messages) return { error: 'Channel not found or cannot read messages.' };

          const limit = Math.min(Math.max(5, parseInt(args.limit) || 15), 30);
          const messages = await targetChan.messages.fetch({ limit }).catch(() => null);
          if (!messages || messages.size === 0) {
            return { messages: [] };
          }

          const parsed = Array.from(messages.values()).reverse().map(m => ({
            id: m.id,
            author: m.author?.username || 'Unknown',
            author_id: m.author?.id,
            content: this.sanitizeText(m.cleanContent || m.content || '').slice(0, 300),
            has_attachments: Boolean(m.attachments?.size > 0),
            timestamp: new Date(m.createdTimestamp || Date.now()).toLocaleTimeString()
          }));

          return { channel: targetChan.name, message_count: parsed.length, messages: parsed };
        }

        case 'get_server_status': {
          const totalMembers = guild.memberCount || 1;
          const cList = Array.from(guild.channels?.cache?.values() || []);
          const textChannels = cList.filter(c => c.type === ChannelType.GuildText || c.type === 0).length;
          const voiceChannels = cList.filter(c => typeof c.isVoiceBased === 'function' ? c.isVoiceBased() : (c.type === 2 || c.type === 13)).length;
          const rolesCount = guild.roles?.cache?.size || 0;

          const secDb = this.db.security || this.db.config;
          const secCfg = secDb?.get ? (secDb.get(guild.id) || {}) : {};

          return {
            server_name: guild.name,
            total_members: totalMembers,
            text_channels: textChannels,
            voice_channels: voiceChannels,
            roles: rolesCount,
            honeypot_armed: Boolean(secCfg.honeypotChannelId),
            automod_active: Boolean(secCfg.automod !== false),
            verification_level: guild.verificationLevel
          };
        }

        case 'save_directive': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.Administrator)) {
            return { error: 'Permission Denied: Only Administrators can set bot directives.' };
          }
          if (!this.botMemory) return { error: 'BotMemory module not attached.' };

          const action = (args.action || '').toLowerCase();
          if (action === 'add') {
            if (!args.directive_text) return { error: 'Directive text is required.' };
            const res = await this.botMemory.addDirective(guild, args.directive_text, author);
            return res.success ? { success: true, message: `Saved directive: "${args.directive_text}"` } : { error: res.error };
          }
          if (action === 'remove') {
            const res = await this.botMemory.removeDirective(guild, args.directive_text);
            return res.success ? { success: true, message: `Removed directive: "${res.removed}"` } : { error: res.error };
          }
          if (action === 'list') {
            const list = this.botMemory.getDirectivesList(guild.id);
            return { directives: list };
          }
          if (action === 'clear') {
            await this.botMemory.removeDirective(guild, 'all');
            return { success: true, message: 'All custom directives cleared.' };
          }
          break;
        }

        case 'create_announcement': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.ManageMessages)) {
            return { error: 'Permission Denied: You need Manage Messages permission to post announcements.' };
          }
          const targetChan = this.resolveChannel(guild, args.channel, channel);
          if (!targetChan || typeof targetChan.send !== 'function') return { error: 'Invalid channel for announcement.' };

          const embed = new EmbedBuilder()
            .setColor(args.color ? parseInt(args.color.replace('#', ''), 16) : 0x00F0FF)
            .setTitle(args.title)
            .setDescription(args.content)
            .setFooter({ text: `${guild.name} Official Announcement`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
            .setTimestamp();

          await targetChan.send({ embeds: [embed] });
          return { success: true, message: `Announcement successfully published to #${targetChan.name}.` };
        }

        case 'toggle_ai_silence': {
          if (!this.hasPermission(author, member, PermissionFlagsBits.ManageChannels)) {
            return { error: 'Permission Denied: You need Manage Channels permission to toggle AI status.' };
          }
          const utilDb = this.db.utility || this.db.config;
          const guildId = guild.id;

          if (args.scope === 'server') {
            utilDb.set(`aichat_muted_server_${guildId}`, args.silence);
            return { success: true, message: args.silence ? 'AI has been silenced server-wide.' : 'AI replies have been resumed server-wide.' };
          } else {
            const targetChan = this.resolveChannel(guild, args.channel, channel);
            const mutedKey = `aichat_muted_${guildId}`;
            let mutedChannels = utilDb.get ? (utilDb.get(mutedKey) || []) : [];
            if (args.silence) {
              if (!mutedChannels.includes(targetChan.id)) mutedChannels.push(targetChan.id);
            } else {
              mutedChannels = mutedChannels.filter(id => id !== targetChan.id);
            }
            utilDb.set(mutedKey, mutedChannels);
            return { success: true, message: args.silence ? `AI silenced in #${targetChan.name}.` : `AI unmuted in #${targetChan.name}.` };
          }
        }

        default:
          return { error: `Unknown tool "${name}".` };
      }
    } catch (err) {
      console.error(`[AGENT TOOL ERROR: ${name}]`, err);
      return { error: err.message || 'Tool execution encountered an internal error.' };
    }

    return { error: 'Unrecognized action.' };
  }

  /**
   * Main Autonomous Agent Execution Loop
   */
  async processAgentRequest(prompt, context) {
    const { guild, channel, author, member } = context;

    // Load Live Server Directives from BotMemory
    let customDirectives = '';
    if (this.botMemory && guild?.id) {
      customDirectives = this.botMemory.getDirectives(guild.id);
    }
    const serverContext = this.botMemory && guild?.id ? this.botMemory.getServerContext(guild.id) : '';

    const isStaff = this.hasPermission(author, member, PermissionFlagsBits.ManageMessages);
    const isOwner = author.id === this.botOwnerId || author.id === guild?.ownerId;

    const systemPrompt = `You are EditX Agent, an intelligent, highly capable, autonomous AI operations manager for the Discord server "${guild?.name || 'Server'}".
You are NOT a scripted bot or a generic customer service chatbot. You are an expert peer, autonomous mod copilot, and community guardian.

CURRENT USER:
- Name: ${author.username} (${member?.displayName || author.username})
- Role Status: ${isOwner ? '👑 SERVER OWNER / CREATOR' : isStaff ? '🛡️ STAFF / MODERATOR' : '👤 COMMUNITY MEMBER'}
- Permissions: ${isOwner ? 'Full Unrestricted System Authority' : isStaff ? 'Staff Moderation Access' : 'Standard Member Access'}

SERVER KNOWLEDGE:
${serverContext ? serverContext.slice(0, 1200) : 'Standard community layout'}

LIVE OWNER & ADMIN DIRECTIVES (TOP PRIORITY):
${customDirectives || 'Be helpful, keep community safe, protect creative members.'}

OPERATIONAL PRINCIPLES:
1. TALK LIKE A REAL HUMAN IN DISCORD:
   - Natural, sharp, friendly, authentic tone.
   - For small talk, casual greetings, or simple acknowledgments: Keep it to 1-2 SHORT, crisp sentences.
   - NEVER dump unprompted bulleted lists or corporate chatbot essays.
2. AGENT TOOL USAGE:
   - You have REAL TOOLS to inspect users, moderate offenders, read channel history, purge spam, manage slowmode, and lock channels.
   - When asked to perform an action (e.g. "timeout @user for 10m", "purge 10 messages", "lock this channel", "who invited @user", "check recent chat in #general"), USE YOUR TOOLS.
   - If a normal member tries to execute staff actions (like banning or purging), politely decline and explain only staff can do that.
3. CREATIVE COMMUNITY GUIDANCE:
   - This community focuses on video editors, designers, VFX artists, and creative clients.
   - Point members to appropriate channels (hiring, showcases, feedback) naturally. Never offer to write software programming code or complete homework for them.`;

    // 1. Primary Engine: Groq (with Function Calling Tools)
    if (this.groqKey) {
      try {
        const groqTools = this.getGroqTools();
        const initialMessages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: initialMessages,
            tools: groqTools,
            tool_choice: 'auto',
            temperature: 0.4,
            max_tokens: 600
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          const message = data.choices?.[0]?.message;

          // Check if tool calls were requested
          if (message?.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const fnName = toolCall.function.name;
            let fnArgs = {};
            try {
              fnArgs = JSON.parse(toolCall.function.arguments);
            } catch (e) {
              fnArgs = {};
            }

            // Execute the requested tool
            const toolResult = await this.executeTool(fnName, fnArgs, context);

            // Follow-up call to format natural response
            const followUpMessages = [
              ...initialMessages,
              message,
              {
                role: 'tool',
                tool_call_id: toolCall.id,
                name: fnName,
                content: JSON.stringify(toolResult)
              }
            ];

            const secondRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.groqKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'qwen/qwen3.8-27b',
                messages: followUpMessages,
                temperature: 0.4,
                max_tokens: 400
              })
            });

            if (secondRes.ok) {
              const secondData = await secondRes.json();
              let text = secondData.choices?.[0]?.message?.content || '';
              if (text.includes('**Answer**')) text = text.split('**Answer**').pop().trim();
              if (text.trim()) return text.trim();
            }

            // Fallback response if follow-up failed
            return toolResult.message || toolResult.error || `Action executed: ${fnName}`;
          }

          if (message?.content) {
            let reply = message.content.trim();
            if (reply.includes('**Answer**')) reply = reply.split('**Answer**').pop().trim();
            return reply;
          }
        }
      } catch (groqErr) {
        console.warn('[AGENT CORE] Groq agent step failed, trying Gemini fallback:', groqErr.message);
      }
    }

    // 2. Fallback Engine: Google Gemini Flash (with Function Calling Tools)
    if (this.gemini) {
      try {
        const geminiTools = this.getGeminiTools();
        const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const response = await this.gemini.models.generateContent({
          model: geminiModel,
          contents: `${systemPrompt}\n\nUser Message:\n${prompt}`,
          config: {
            temperature: 0.4,
            maxOutputTokens: 600,
            tools: [{ functionDeclarations: geminiTools }]
          }
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
          const call = response.functionCalls[0];
          const toolResult = await this.executeTool(call.name, call.args || {}, context);

          // Second round to synthesize natural reply
          const followUpRes = await this.gemini.models.generateContent({
            model: geminiModel,
            contents: `${systemPrompt}\n\nUser asked: "${prompt}"\nYou called tool "${call.name}" with args: ${JSON.stringify(call.args)}\nTool result was: ${JSON.stringify(toolResult)}\nProvide a natural, conversational response confirming what happened or presenting the results directly to the user.`
          });

          return followUpRes.text?.trim() || toolResult.message || toolResult.error || `Executed ${call.name}`;
        }

        if (response.text && response.text.trim()) {
          return response.text.trim();
        }
      } catch (geminiErr) {
        console.warn('[AGENT CORE] Gemini agent fallback failed:', geminiErr.message);
      }
    }

    return "I'm online and observing the server, but encountered a brief connection timeout with the reasoning engine. Try again in a moment!";
  }
}

module.exports = AgentCore;

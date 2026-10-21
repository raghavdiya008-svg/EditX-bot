require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1538957031455596544';
const VERIFY_CHANNEL_ID = '1546813432282746911';
const RULES_CHANNEL_ID = '1540409714289147904';

// Database path for verification records
const DATA_DIR = path.join(__dirname, '..', 'data');
const VERIFY_DB_PATH = path.join(DATA_DIR, 'verification.json');

function loadDB() {
  try {
    if (fs.existsSync(VERIFY_DB_PATH)) {
      return JSON.parse(fs.readFileSync(VERIFY_DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading verification.json:', e);
  }
  return {};
}

function saveDB(data) {
  try {
    fs.writeFileSync(VERIFY_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving verification.json:', e);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.once('clientReady', async () => {
  console.log(`[VERIFY-DM] Logged in as ${client.user.tag}`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`[VERIFY-DM] Connected to Guild: "${guild.name}" (${guild.id})`);

    const dbData = loadDB();
    const verifyKey = `dm_reminders_${guild.id}`;
    if (!dbData[verifyKey]) {
      dbData[verifyKey] = {};
    }
    const verifyRecords = dbData[verifyKey];

    // Fetch all guild members
    console.log('[VERIFY-DM] Fetching all guild members...');
    const members = await guild.members.fetch();
    console.log(`[VERIFY-DM] Total members in server: ${members.size}`);

    // Filter unverified members: non-bot, 0 roles (excluding @everyone)
    const candidates = [];
    members.forEach((member) => {
      if (member.user.bot) return;
      const nonEveryoneRoles = member.roles.cache.filter((r) => r.id !== guild.id);
      if (nonEveryoneRoles.size === 0) {
        candidates.push(member);
      }
    });

    console.log(`[VERIFY-DM] Identified ${candidates.length} members with 0 roles.`);

    const guildIcon = guild.iconURL({ dynamic: true, size: 256 }) || client.user.displayAvatarURL();

    let sentCount = 0;
    let skippedCount = 0;
    let failedClosedDm = 0;
    let failedOther = 0;

    for (let i = 0; i < candidates.length; i++) {
      const member = candidates[i];
      const userId = member.id;
      const userTag = member.user.tag || member.user.username;

      // Strict Deduplication: Do not send if already sent
      if (verifyRecords[userId] && verifyRecords[userId].status === 'sent') {
        console.log(`[${i + 1}/${candidates.length}] SKIP: ${userTag} (${userId}) already received verification reminder.`);
        skippedCount++;
        continue;
      }

      // If previously attempted and closed DMs, skip as well
      if (verifyRecords[userId] && verifyRecords[userId].status === 'failed_closed_dms') {
        console.log(`[${i + 1}/${candidates.length}] SKIP: ${userTag} (${userId}) previously had closed DMs.`);
        skippedCount++;
        continue;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`✨ Welcome to ${guild.name} — Verification Required`)
        .setDescription(
          `Hey **${member.user.displayName || member.user.username}**! 👋\n\n` +
          `We noticed you joined **${guild.name}** but haven't unlocked your member access yet. Complete verification in 5 seconds to unlock full server access!\n\n` +
          `### 🚀 How to Verify:\n` +
          `1️⃣ Go to the <#${VERIFY_CHANNEL_ID}> channel.\n` +
          `2️⃣ Click the green **Verify** button on the verification panel.\n` +
          `3️⃣ You will instantly receive the **Members** role!\n\n` +
          `### 🎁 What Unlocks When You Verify:\n` +
          `• 🎬 **Editing Software Suites**: Premiere Pro, After Effects, DaVinci Resolve, CapCut\n` +
          `• 🎨 **Design & 3D**: Photoshop, Lightroom, Motion Design & 3D Art lounges\n` +
          `• 📦 **Vault of Free Resources**: SFX packs, overlays, transitions, color LUTs\n` +
          `• 💼 **Opportunities**: Freelance & client hiring boards, collaborations, project reviews\n` +
          `• 🏷️ **Creator Roles**: Pick your skills, editor software, and notification roles\n\n` +
          `*Please take a moment to review our server rules in <#${RULES_CHANNEL_ID}> to keep the community creative and safe.*`
        )
        .setThumbnail(guildIcon)
        .setFooter({
          text: `${guild.name} Access Gateway • Mentioned once per member`,
          iconURL: guildIcon
        })
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('👉 Go to #verify-here')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${GUILD_ID}/${VERIFY_CHANNEL_ID}`),
        new ButtonBuilder()
          .setLabel('📜 Server Rules')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/${GUILD_ID}/${RULES_CHANNEL_ID}`)
      );

      try {
        await member.send({
          embeds: [embed],
          components: [actionRow]
        });

        console.log(`[${i + 1}/${candidates.length}] SENT -> ${userTag} (${userId})`);
        sentCount++;
        verifyRecords[userId] = {
          status: 'sent',
          timestamp: Date.now(),
          tag: userTag
        };
        saveDB(dbData);
      } catch (err) {
        if (err.code === 50007) {
          console.log(`[${i + 1}/${candidates.length}] CLOSED DMs -> ${userTag} (${userId}) (Error 50007: Cannot send messages to user)`);
          failedClosedDm++;
          verifyRecords[userId] = {
            status: 'failed_closed_dms',
            timestamp: Date.now(),
            tag: userTag,
            error: 'Closed DMs'
          };
          saveDB(dbData);
        } else {
          console.error(`[${i + 1}/${candidates.length}] FAILED -> ${userTag} (${userId}):`, err.message || err);
          failedOther++;
          verifyRecords[userId] = {
            status: 'failed',
            timestamp: Date.now(),
            tag: userTag,
            error: err.message
          };
          saveDB(dbData);
        }
      }

      // Safe pacing: 1500ms delay between DMs to completely avoid Discord rate-limits
      await sleep(1500);
    }

    console.log('\n========================================');
    console.log('       VERIFICATION DM DISPATCH REPORT');
    console.log('========================================');
    console.log(`Total 0-Role Members Evaluated: ${candidates.length}`);
    console.log(`✅ Successfully Delivered:      ${sentCount}`);
    console.log(`⏭️ Skipped (Already Contacted):  ${skippedCount}`);
    console.log(`🔒 Closed DMs (Unreachable):     ${failedClosedDm}`);
    console.log(`❌ Other Errors:                 ${failedOther}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('[VERIFY-DM FATAL ERROR]', error);
  } finally {
    process.exit(0);
  }
});

client.login(TOKEN);

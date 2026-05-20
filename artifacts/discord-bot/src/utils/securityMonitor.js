import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logNukeAction, getSecurity } from '../store.js';

// guildId:userId -> [timestamps]
const spamMap = new Map();
// guildId:userId -> [message objects] (kept to bulk-delete on trigger)
const spamMsgMap = new Map();
// guildId:userId -> { content, channels, time }
const dupMap = new Map();
// guildId:userId -> flagged (prevent repeat new-account logs per session)
const newAcctLogged = new Set();

// ── Core helpers ──────────────────────────────────────────────────────────────

export async function sendSecurityLog(guild, channelId, embed) {
  try {
    const ch = await guild.channels.fetch(channelId).catch(e => {
      console.error(`[SECURITY] Cannot fetch log channel ${channelId}: ${e.message}`);
      return null;
    });
    if (!ch) {
      console.error(`[SECURITY] Log channel ${channelId} not found — set a valid channel with /security log`);
      return;
    }
    if (!ch.isTextBased()) {
      console.error(`[SECURITY] Log channel ${channelId} is not a text channel`);
      return;
    }
    await ch.send({ embeds: [embed] });
    console.log(`[SECURITY] Logged: ${embed.data?.title ?? 'event'} in guild ${guild.id}`);
  } catch (e) {
    console.error('[SECURITY] Failed to send log embed:', e.message);
  }
}

async function tryDelete(message) {
  try {
    if (message.deletable) await message.delete();
  } catch (e) {
    console.warn(`[SECURITY] Could not delete message ${message.id}: ${e.message}`);
  }
}

function secEmbed(color, title, desc, fields = []) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(desc)
    .addFields(fields)
    .setTimestamp();
}

// ── Spam: 5+ messages within 10 seconds → delete + log ───────────────────────

export async function checkSpam(message, settings) {
  const limit  = settings.spam_threshold ?? 5;
  const window = settings.spam_interval  ?? 10_000;
  const { logChannelId } = settings;
  if (!logChannelId) return;

  const key  = `${message.guild.id}:${message.author.id}`;
  const now  = Date.now();

  // Prune old timestamps and messages
  const times = (spamMap.get(key) ?? []).filter(t => now - t < window);
  const msgs  = (spamMsgMap.get(key) ?? []).filter(m => now - m.createdTimestamp < window);

  times.push(now);
  msgs.push(message);
  spamMap.set(key, times);
  spamMsgMap.set(key, msgs);

  if (times.length >= limit) {
    // Reset immediately so continued spamming triggers again after next `limit` msgs
    spamMap.set(key, []);
    spamMsgMap.set(key, []);

    // Bulk-delete all collected spam messages (needs ManageMessages)
    const canManage = message.channel
      .permissionsFor(message.guild.members.me)
      ?.has(PermissionFlagsBits.ManageMessages);

    if (canManage) {
      const toDelete = msgs.filter(m => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      if (toDelete.length > 1) {
        await message.channel.bulkDelete(toDelete).catch(() => {});
      } else if (toDelete.length === 1) {
        await tryDelete(toDelete[0]);
      }
    }

    await sendSecurityLog(message.guild, logChannelId, secEmbed(
      0xFEE75C,
      'Spam Detected — Messages Deleted',
      `${message.author} sent **${times.length} messages** in ${window / 1000}s`,
      [
        { name: 'User',    value: `${message.author.tag}\n${message.author.id}`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`,                   inline: true },
        { name: 'Deleted', value: canManage ? `${msgs.length} message(s)` : 'No (missing ManageMessages perm)', inline: true },
      ]
    ));
  }
}

// ── Mass mention: any @everyone/@here, role ping, or 3+ user pings → delete + log ──

export async function checkMentions(message, settings) {
  const limit = settings.mention_threshold ?? 3;
  const { logChannelId } = settings;
  if (!logChannelId) return;

  const userMentions = message.mentions.users.size;
  const roleMentions = message.mentions.roles.size;
  const everyonePing = message.mentions.everyone; // true for @everyone or @here

  const total = userMentions + roleMentions + (everyonePing ? 1 : 0);

  if (!everyonePing && total < limit) return;

  // Delete the message
  await tryDelete(message);

  const types = [];
  if (everyonePing)  types.push('@everyone / @here');
  if (roleMentions)  types.push(`${roleMentions} role ping(s)`);
  if (userMentions)  types.push(`${userMentions} user ping(s)`);

  await sendSecurityLog(message.guild, logChannelId, secEmbed(
    0xED4245,
    'Mass Mention — Message Deleted',
    `${message.author} used mass mentions in <#${message.channel.id}>. Message was deleted.`,
    [
      { name: 'User',     value: `${message.author.tag}\n${message.author.id}`, inline: true },
      { name: 'Channel',  value: `<#${message.channel.id}>`,                   inline: true },
      { name: 'Mentions', value: types.join(', ') || String(total),            inline: true },
      { name: 'Content',  value: message.content.slice(0, 400) || '[no text]', inline: false },
    ]
  ));
}

// ── Cross-channel duplicate spam ──────────────────────────────────────────────

export async function checkDuplicates(message, settings) {
  const limit = settings.duplicate_threshold ?? 3;
  const { logChannelId } = settings;
  if (!logChannelId || !message.content) return;

  const key     = `${message.guild.id}:${message.author.id}`;
  const content = message.content.trim().toLowerCase();
  const now     = Date.now();
  const entry   = dupMap.get(key);

  if (!entry || entry.content !== content || now - entry.time > 30_000) {
    dupMap.set(key, { content, channels: new Set([message.channel.id]), time: now });
    return;
  }

  entry.channels.add(message.channel.id);
  if (entry.channels.size >= limit) {
    dupMap.delete(key);
    await sendSecurityLog(message.guild, logChannelId, secEmbed(
      0xED4245,
      'Cross-Channel Spam Detected',
      `${message.author} sent the same message in **${entry.channels.size} different channels**.`,
      [
        { name: 'User',     value: `${message.author.tag}\n${message.author.id}`, inline: true },
        { name: 'Channels', value: String(entry.channels.size),                   inline: true },
        { name: 'Message',  value: message.content.slice(0, 400),                 inline: false },
      ]
    ));
  }
}

// ── New / suspicious account check ───────────────────────────────────────────

export async function checkNewAccount(message, settings) {
  const { logChannelId } = settings;
  if (!logChannelId) return;

  const threshold = settings.new_account_days ?? 7;
  const ageDays   = (Date.now() - message.author.createdTimestamp) / 86_400_000;
  if (ageDays >= threshold) return;

  const sessionKey = `${message.guild.id}:${message.author.id}`;
  if (newAcctLogged.has(sessionKey)) return; // only log once per session
  newAcctLogged.add(sessionKey);

  await sendSecurityLog(message.guild, logChannelId, secEmbed(
    0xFEE75C,
    'Suspicious Account — New User Sending Messages',
    `${message.author} has a very new account and is active in the server.`,
    [
      { name: 'User',        value: `${message.author.tag}\n${message.author.id}`, inline: true },
      { name: 'Account Age', value: `${ageDays.toFixed(1)} days`,                  inline: true },
      { name: 'Channel',     value: `<#${message.channel.id}>`,                    inline: true },
    ]
  ));
}

// ── NSFW keyword detection (non-NSFW channels only) → delete + log ────────────

const NSFW_PATTERNS = [
  /\bnsfw\b/i,
  /\bporn(hub)?\b/i,
  /\bxxx\b/i,
  /\bonlyfans\b/i,
  /\bxvideos\b/i,
  /\bxhamster\b/i,
  /\bredtube\b/i,
  /\bpornhub\.com\b/i,
  /\bxnxx\b/i,
  /\bsexting\b/i,
  /\bgore\b/i,
  /\bcp\b.*\blink\b/i,
];

export async function checkNsfw(message, settings) {
  const { logChannelId } = settings;
  if (!logChannelId) return;

  // Only check in channels that are NOT marked NSFW
  if (message.channel.nsfw) return;

  const content = message.content.toLowerCase();
  const matched = NSFW_PATTERNS.find(p => p.test(content));
  if (!matched) return;

  await tryDelete(message);

  await sendSecurityLog(message.guild, logChannelId, secEmbed(
    0xED4245,
    'NSFW Content Blocked',
    `${message.author} sent potentially NSFW content in a non-NSFW channel. Message deleted.`,
    [
      { name: 'User',    value: `${message.author.tag}\n${message.author.id}`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`,                   inline: true },
      { name: 'Content', value: message.content.slice(0, 300) || '[no text]', inline: false },
    ]
  ));
}

// ── Nuke action (called by guild events) ─────────────────────────────────────

export async function checkNuke(guild, userId, action, target) {
  const settings = getSecurity(guild.id);
  if (!settings?.enabled || !settings.logChannelId) return;

  const threshold = settings.nuke_threshold ?? 3;
  const count     = logNukeAction(guild.id, userId);
  const isNuke    = count >= threshold;

  await sendSecurityLog(guild, settings.logChannelId, secEmbed(
    isNuke ? 0xED4245 : 0xFEE75C,
    isNuke ? 'Anti-Nuke Alert — Threshold Reached' : 'Suspicious Destructive Action',
    isNuke
      ? `<@${userId}> performed **${count} rapid destructive actions** in 30s. Possible nuke attempt.`
      : `<@${userId}> performed a potentially destructive action.`,
    [
      { name: 'User',   value: `<@${userId}>`,                       inline: true },
      { name: 'Action', value: action,                               inline: true },
      { name: 'Target', value: target || 'Unknown',                  inline: true },
      { name: 'Tally',  value: `${count} action(s) in last 30s`,     inline: true },
    ]
  ));
}

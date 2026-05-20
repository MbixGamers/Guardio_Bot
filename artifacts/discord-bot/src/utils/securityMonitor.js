import { EmbedBuilder } from 'discord.js';
import { logNukeAction, getSecurity } from '../store.js';

// Keys are `guildId:userId` to avoid cross-guild contamination
const spamMap = new Map();
const dupMap  = new Map();

export async function sendSecurityLog(guild, channelId, embed) {
  try {
    const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error('[SECURITY] Failed to send log:', e);
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

// ── Spam: 5+ messages in 10 seconds ──────────────────────────────────────────

export async function checkSpam(message, settings) {
  const limit  = settings.spam_threshold ?? 5;
  const window = settings.spam_interval  ?? 10_000;
  const { logChannelId } = settings;
  if (!logChannelId) return;

  const key  = `${message.guild.id}:${message.author.id}`;
  const now  = Date.now();
  const times = (spamMap.get(key) ?? []).filter(t => now - t < window);
  times.push(now);
  spamMap.set(key, times);

  if (times.length >= limit) {
    // Reset so we log again if they keep going
    spamMap.set(key, []);
    await sendSecurityLog(message.guild, logChannelId, secEmbed(
      0xFEE75C,
      'Spam Detected',
      `${message.author} sent **${times.length} messages** in ${window / 1000}s in <#${message.channel.id}>`,
      [
        { name: 'User',    value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`,                     inline: true },
        { name: 'Count',   value: `${times.length} msgs / ${window / 1000}s`,     inline: true },
      ]
    ));
  }
}

// ── Mass mention: @everyone, @here, role pings, or 3+ user pings ─────────────

export async function checkMentions(message, settings) {
  const limit = settings.mention_threshold ?? 3;
  const { logChannelId } = settings;
  if (!logChannelId) return;

  const userMentions = message.mentions.users.size;
  const roleMentions = message.mentions.roles.size;
  const everyonePing = message.mentions.everyone ? 1 : 0; // covers @everyone + @here
  const total = userMentions + roleMentions + everyonePing;

  if (total >= limit || everyonePing) {
    const types = [];
    if (everyonePing)   types.push('@everyone / @here');
    if (roleMentions)   types.push(`${roleMentions} role ping(s)`);
    if (userMentions)   types.push(`${userMentions} user ping(s)`);

    await sendSecurityLog(message.guild, logChannelId, secEmbed(
      0xED4245,
      'Mass Mention Detected',
      `${message.author} used a mass mention in <#${message.channel.id}>`,
      [
        { name: 'User',     value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: 'Channel',  value: `<#${message.channel.id}>`,                     inline: true },
        { name: 'Mentions', value: types.join(', ') || String(total),              inline: true },
        { name: 'Content',  value: message.content.slice(0, 300) || '[no text]',   inline: false },
      ]
    ));
  }
}

// ── Duplicate cross-channel spam ──────────────────────────────────────────────

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
      'Cross-Channel Spam',
      `${message.author} sent the same message in **${entry.channels.size} channels**`,
      [
        { name: 'User',    value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: 'Channels', value: String(entry.channels.size),                   inline: true },
        { name: 'Message', value: message.content.slice(0, 300),                  inline: false },
      ]
    ));
  }
}

// ── Nuke action (called by guild events) ─────────────────────────────────────

export async function checkNuke(guild, userId, action, target) {
  const settings = getSecurity(guild.id);
  if (!settings?.enabled || !settings.logChannelId) return;

  const threshold = settings.nuke_threshold ?? 3;
  const count     = logNukeAction(guild.id, userId);

  // Always log the action itself, flag as nuke threat when threshold hit
  const isNuke = count >= threshold;
  await sendSecurityLog(guild, settings.logChannelId, secEmbed(
    isNuke ? 0xED4245 : 0xFEE75C,
    isNuke ? 'Anti-Nuke Alert — Threshold Reached' : `Suspicious Action Logged`,
    isNuke
      ? `<@${userId}> has performed **${count} rapid destructive actions**. Possible nuke attempt.`
      : `<@${userId}> performed a potentially destructive action.`,
    [
      { name: 'User',    value: `<@${userId}>`,           inline: true },
      { name: 'Action',  value: action,                   inline: true },
      { name: 'Target',  value: target || 'Unknown',      inline: true },
      { name: 'Tally',   value: `${count} action(s) in the last 30s`, inline: true },
    ]
  ));
}

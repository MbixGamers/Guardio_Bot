import { EmbedBuilder } from 'discord.js';
import { logNukeAction, getSecurity } from '../store.js';

const spamMap = new Map();
const dupMap  = new Map();

export async function sendSecurityLog(guild, channelId, embed) {
  try {
    const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch {}
}

function secEmbed(color, title, desc, fields = []) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).addFields(fields).setTimestamp();
}

export async function checkSpam(message, settings) {
  const { spam_threshold: limit = 5, spam_interval: window = 5000, logChannelId } = settings;
  if (!logChannelId) return;
  const uid = message.author.id, now = Date.now();
  const times = (spamMap.get(uid) ?? []).filter(t => now - t < window);
  times.push(now);
  spamMap.set(uid, times);
  if (times.length >= limit) {
    spamMap.set(uid, []);
    await sendSecurityLog(message.guild, logChannelId, secEmbed(0xFEE75C, 'Spam Detected',
      `**User:** ${message.author.tag} (<@${uid}>)\n**Messages:** ${times.length} in ${window / 1000}s\n**Channel:** <#${message.channel.id}>`));
  }
}

export async function checkMentions(message, settings) {
  const { mention_threshold: limit = 5, logChannelId } = settings;
  if (!logChannelId) return;
  const count = message.mentions.users.size + (message.mentions.everyone ? 1 : 0);
  if (count >= limit) {
    await sendSecurityLog(message.guild, logChannelId, secEmbed(0xED4245, 'Mass Mention Detected',
      `**User:** ${message.author.tag} (<@${message.author.id}>)\n**Mentions:** ${count}\n**Channel:** <#${message.channel.id}>`,
      [{ name: 'Content', value: message.content.slice(0, 200) }]));
  }
}

export async function checkDuplicates(message, settings) {
  const { duplicate_threshold: limit = 3, logChannelId } = settings;
  if (!logChannelId || !message.content) return;
  const uid = message.author.id, content = message.content.trim().toLowerCase();
  const entry = dupMap.get(uid);
  const now = Date.now();
  if (!entry || entry.content !== content || now - entry.time > 30000) {
    dupMap.set(uid, { content, channels: new Set([message.channel.id]), time: now });
    return;
  }
  entry.channels.add(message.channel.id);
  if (entry.channels.size >= limit) {
    dupMap.delete(uid);
    await sendSecurityLog(message.guild, logChannelId, secEmbed(0xED4245, 'Cross-Channel Spam',
      `**User:** ${message.author.tag} (<@${uid}>)\n**Same message in ${entry.channels.size} channels**`,
      [{ name: 'Message', value: message.content.slice(0, 200) }]));
  }
}

export async function checkNuke(guild, userId, action, target) {
  const settings = getSecurity(guild.id);
  if (!settings?.enabled || !settings.logChannelId) return;
  const threshold = settings.nuke_threshold ?? 3;
  const count = logNukeAction(guild.id, userId);
  if (count >= threshold) {
    await sendSecurityLog(guild, settings.logChannelId, secEmbed(0xED4245, 'Anti-Nuke Alert', 'Potential nuke attempt detected!', [
      { name: 'User',   value: `<@${userId}>`, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Target', value: target || 'Unknown', inline: true },
      { name: 'Count',  value: `${count} rapid actions`, inline: true },
    ]));
  }
}

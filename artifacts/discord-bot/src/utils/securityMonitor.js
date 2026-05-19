import { EmbedBuilder } from 'discord.js';

// In-memory stores for real-time tracking
const spamMap = new Map(); // userId -> [{timestamp}]
const duplicateMap = new Map(); // userId -> {content, channels: Set}

export async function logSecurityEvent(guild, channelId, embed) {
  try {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[SECURITY] Failed to log event:', err.message);
  }
}

export async function spamTracker(message, settings, client) {
  const userId = message.author.id;
  const now = Date.now();
  const interval = settings.spam_interval ?? 5000;
  const threshold = settings.spam_threshold ?? 5;

  if (!spamMap.has(userId)) spamMap.set(userId, []);
  const times = spamMap.get(userId);
  times.push(now);

  // Keep only recent
  const recent = times.filter(t => now - t < interval);
  spamMap.set(userId, recent);

  if (recent.length >= threshold && settings.log_channel_id) {
    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('Spam Detected')
      .setDescription(`**User:** ${message.author.tag} (<@${userId}>)\n**Messages:** ${recent.length} in ${interval / 1000}s\n**Channel:** <#${message.channel.id}>`)
      .setTimestamp();

    await logSecurityEvent(message.guild, settings.log_channel_id, embed);
    spamMap.set(userId, []); // Reset after logging
  }
}

export async function mentionTracker(message, settings, client) {
  const threshold = settings.mention_threshold ?? 5;
  const mentionCount = message.mentions.users.size + (message.mentions.everyone ? 1 : 0);

  if (mentionCount >= threshold && settings.log_channel_id) {
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Mass Mention Detected')
      .setDescription(`**User:** ${message.author.tag} (<@${message.author.id}>)\n**Mentions:** ${mentionCount}\n**Channel:** <#${message.channel.id}>`)
      .addFields({ name: 'Message Preview', value: message.content.slice(0, 200) || 'N/A' })
      .setTimestamp();

    await logSecurityEvent(message.guild, settings.log_channel_id, embed);
  }
}

export async function duplicateTracker(message, settings, client) {
  if (!message.content) return;
  const userId = message.author.id;
  const threshold = settings.duplicate_threshold ?? 3;
  const content = message.content.trim().toLowerCase();

  if (!duplicateMap.has(userId)) {
    duplicateMap.set(userId, { content, channels: new Set(), time: Date.now() });
  }

  const entry = duplicateMap.get(userId);
  const age = Date.now() - entry.time;

  if (entry.content !== content || age > 30000) {
    duplicateMap.set(userId, { content, channels: new Set([message.channel.id]), time: Date.now() });
    return;
  }

  entry.channels.add(message.channel.id);

  if (entry.channels.size >= threshold && settings.log_channel_id) {
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Cross-Channel Spam Detected')
      .setDescription(`**User:** ${message.author.tag} (<@${userId}>)\n**Same message sent in ${entry.channels.size} channels**`)
      .addFields({ name: 'Message', value: message.content.slice(0, 200) })
      .setTimestamp();

    await logSecurityEvent(message.guild, settings.log_channel_id, embed);
    duplicateMap.delete(userId);
  }
}

import { AuditLogEvent } from 'discord.js';
import { get, run } from '../db/database.js';
import { logSecurityEvent } from '../utils/securityMonitor.js';
import { warningEmbed } from '../utils/embeds.js';

async function checkNuke(guild, userId, action, target, settings) {
  if (!settings?.enabled) return;

  const interval = settings.nuke_interval ?? 10000;
  const threshold = settings.nuke_threshold ?? 3;
  const since = Math.floor((Date.now() - interval) / 1000);

  run(`INSERT INTO nuke_tracking (guild_id, user_id, action, target) VALUES (?, ?, ?, ?)`,
    [guild.id, userId, action, target]);

  const recent = get(
    `SELECT COUNT(*) as cnt FROM nuke_tracking WHERE guild_id = ? AND user_id = ? AND timestamp >= ?`,
    [guild.id, userId, since]
  );

  run(`DELETE FROM nuke_tracking WHERE guild_id = ? AND timestamp < ?`, [guild.id, since]);

  if ((recent?.cnt ?? 0) >= threshold && settings.log_channel_id) {
    const embed = warningEmbed('Anti-Nuke Alert', 'Potential nuke attempt detected!').addFields(
      { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
      { name: 'Action', value: action, inline: true },
      { name: 'Target', value: target || 'Unknown', inline: true },
      { name: 'Recent Actions', value: `${recent.cnt} in ${interval / 1000}s`, inline: true }
    );
    await logSecurityEvent(guild, settings.log_channel_id, embed);
  }
}

async function getAuditUser(guild, eventType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: eventType, limit: 1 });
    return logs.entries.first()?.executor?.id;
  } catch {
    return null;
  }
}

function getSettings(guildId) {
  return get(`SELECT * FROM security_settings WHERE guild_id = ?`, [guildId]);
}

export default {
  name: 'roleCreate',
  async execute(role, client) {
    const settings = getSettings(role.guild.id);
    const userId = await getAuditUser(role.guild, AuditLogEvent.RoleCreate);
    if (userId) await checkNuke(role.guild, userId, 'Role Created', role.name, settings);
  },
};

export const roleDeleteEvent = {
  name: 'roleDelete',
  async execute(role, client) {
    const settings = getSettings(role.guild.id);
    const userId = await getAuditUser(role.guild, AuditLogEvent.RoleDelete);
    if (userId) await checkNuke(role.guild, userId, 'Role Deleted', role.name, settings);
  },
};

export const channelCreateEvent = {
  name: 'channelCreate',
  async execute(channel, client) {
    if (!channel.guild) return;
    const settings = getSettings(channel.guild.id);
    const userId = await getAuditUser(channel.guild, AuditLogEvent.ChannelCreate);
    if (userId) await checkNuke(channel.guild, userId, 'Channel Created', channel.name, settings);
  },
};

export const channelDeleteEvent = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel.guild) return;
    const settings = getSettings(channel.guild.id);
    const userId = await getAuditUser(channel.guild, AuditLogEvent.ChannelDelete);
    if (userId) await checkNuke(channel.guild, userId, 'Channel Deleted', channel.name, settings);
  },
};

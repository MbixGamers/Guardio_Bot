import { AuditLogEvent, EmbedBuilder } from 'discord.js';
import { checkNuke, sendSecurityLog } from '../utils/securityMonitor.js';
import { getSecurity } from '../store.js';

// Only trust audit log entries that are at most 6 seconds old
async function auditUser(guild, type) {
  try {
    const entry = (await guild.fetchAuditLogs({ type, limit: 1 })).entries.first();
    if (!entry) return null;
    if (Date.now() - entry.createdTimestamp > 6_000) return null;
    return entry.executor?.id ?? null;
  } catch {
    return null;
  }
}

export default {
  name: 'roleCreate',
  async execute(role) {
    const uid = await auditUser(role.guild, AuditLogEvent.RoleCreate);
    if (uid) await checkNuke(role.guild, uid, 'Role Created', role.name);
  },
};

export const roleDelete = {
  name: 'roleDelete',
  async execute(role) {
    const uid = await auditUser(role.guild, AuditLogEvent.RoleDelete);
    if (uid) await checkNuke(role.guild, uid, 'Role Deleted', role.name);
  },
};

export const roleUpdate = {
  name: 'roleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    const uid = await auditUser(newRole.guild, AuditLogEvent.RoleUpdate);
    if (!uid) return;
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`name: ${oldRole.name} → ${newRole.name}`);
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('permissions changed');
    if (!changes.length) return;
    await checkNuke(newRole.guild, uid, 'Role Edited', `${newRole.name} (${changes.join(', ')})`);
  },
};

export const channelCreate = {
  name: 'channelCreate',
  async execute(ch) {
    if (!ch.guild) return;
    const uid = await auditUser(ch.guild, AuditLogEvent.ChannelCreate);
    if (uid) await checkNuke(ch.guild, uid, 'Channel Created', ch.name);
  },
};

export const channelDelete = {
  name: 'channelDelete',
  async execute(ch) {
    if (!ch.guild) return;
    const uid = await auditUser(ch.guild, AuditLogEvent.ChannelDelete);
    if (uid) await checkNuke(ch.guild, uid, 'Channel Deleted', ch.name);
  },
};

export const channelUpdate = {
  name: 'channelUpdate',
  async execute(oldCh, newCh) {
    if (!newCh.guild) return;
    const uid = await auditUser(newCh.guild, AuditLogEvent.ChannelUpdate);
    if (!uid) return;
    const changes = [];
    if (oldCh.name !== newCh.name) changes.push(`name: ${oldCh.name} → ${newCh.name}`);
    if (oldCh.topic !== newCh.topic) changes.push('topic changed');
    if (!changes.length) return;
    await checkNuke(newCh.guild, uid, 'Channel Edited', `${newCh.name} (${changes.join(', ')})`);
  },
};

export const messageDeleteBulk = {
  name: 'messageDeleteBulk',
  async execute(messages) {
    const guild = messages.first()?.guild;
    if (!guild) return;
    const settings = getSecurity(guild.id);
    if (!settings?.enabled || !settings.logChannelId) return;

    const uid = await auditUser(guild, AuditLogEvent.MessageBulkDelete);
    const channel = messages.first()?.channel;

    await sendSecurityLog(guild, settings.logChannelId, new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Mass Message Deletion Detected')
      .setDescription(
        uid
          ? `<@${uid}> bulk-deleted **${messages.size} messages** in <#${channel?.id ?? '?'}>.`
          : `**${messages.size} messages** were bulk-deleted in <#${channel?.id ?? '?'}> (executor unknown).`
      )
      .addFields(
        { name: 'Deleted By', value: uid ? `<@${uid}> (${uid})` : 'Unknown', inline: true },
        { name: 'Channel',    value: channel ? `<#${channel.id}>` : 'Unknown', inline: true },
        { name: 'Count',      value: String(messages.size),                    inline: true },
      )
      .setTimestamp()
    );
  },
};

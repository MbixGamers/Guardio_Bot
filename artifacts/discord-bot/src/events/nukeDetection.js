import { AuditLogEvent } from 'discord.js';
import { checkNuke } from '../utils/securityMonitor.js';

async function auditUser(guild, type) {
  try { return (await guild.fetchAuditLogs({ type, limit: 1 })).entries.first()?.executor?.id; }
  catch { return null; }
}

export default {
  name: 'roleCreate',
  async execute(role, client) {
    const uid = await auditUser(role.guild, AuditLogEvent.RoleCreate);
    if (uid) await checkNuke(role.guild, uid, 'Role Created', role.name);
  },
};

export const roleDelete = {
  name: 'roleDelete',
  async execute(role, client) {
    const uid = await auditUser(role.guild, AuditLogEvent.RoleDelete);
    if (uid) await checkNuke(role.guild, uid, 'Role Deleted', role.name);
  },
};

export const channelCreate = {
  name: 'channelCreate',
  async execute(ch, client) {
    if (!ch.guild) return;
    const uid = await auditUser(ch.guild, AuditLogEvent.ChannelCreate);
    if (uid) await checkNuke(ch.guild, uid, 'Channel Created', ch.name);
  },
};

export const channelDelete = {
  name: 'channelDelete',
  async execute(ch, client) {
    if (!ch.guild) return;
    const uid = await auditUser(ch.guild, AuditLogEvent.ChannelDelete);
    if (uid) await checkNuke(ch.guild, uid, 'Channel Deleted', ch.name);
  },
};

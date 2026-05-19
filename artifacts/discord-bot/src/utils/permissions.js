import { PermissionFlagsBits } from 'discord.js';

export function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export function isSupportRole(member, supportRoles) {
  if (!supportRoles || supportRoles.length === 0) return false;
  return member.roles.cache.some(r => supportRoles.includes(r.id));
}

export function canManageTicket(member, ticket, supportRoles) {
  if (isAdmin(member)) return true;
  if (member.id === ticket.user_id) return true;
  if (isSupportRole(member, supportRoles)) return true;
  return false;
}

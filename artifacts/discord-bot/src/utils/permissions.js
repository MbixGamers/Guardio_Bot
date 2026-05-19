import { PermissionFlagsBits } from 'discord.js';

export const isAdmin = m => m.permissions.has(PermissionFlagsBits.Administrator);
export const isSupportRole = (m, roles) => roles?.length && m.roles.cache.some(r => roles.includes(r.id));

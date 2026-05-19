import { EmbedBuilder } from 'discord.js';

const C = { success: 0x57F287, error: 0xED4245, info: 0x5865F2, warn: 0xFEE75C };

export const embed = (color, title, desc, fields = []) =>
  new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).addFields(fields).setTimestamp();

export const ok    = (t, d, f) => embed(C.success, t, d, f);
export const err   = (t, d)    => embed(C.error,   t, d);
export const info  = (t, d)    => embed(C.info,    t, d);
export const warn  = (t, d, f) => embed(C.warn,    t, d, f);

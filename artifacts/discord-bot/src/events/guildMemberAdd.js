import { getSecurity } from '../store.js';
import { sendSecurityLog } from '../utils/securityMonitor.js';
import { EmbedBuilder } from 'discord.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const settings = getSecurity(member.guild.id);
    if (!settings?.enabled || !settings.logChannelId) return;

    const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
    const threshold = settings.new_account_days ?? 7;
    if (ageDays < threshold) {
      const embed = new EmbedBuilder().setColor(0xFEE75C)
        .setTitle('New Account Detected')
        .setDescription(`**User:** ${member.user.tag} (<@${member.id}>)\n**Account Age:** ${ageDays.toFixed(1)} days\n**Threshold:** ${threshold} days`)
        .addFields({ name: 'Action', value: 'Please review this account.' })
        .setTimestamp();
      await sendSecurityLog(member.guild, settings.logChannelId, embed);
    }
  },
};

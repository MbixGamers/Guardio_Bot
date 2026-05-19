import { get } from '../db/database.js';
import { logSecurityEvent } from '../utils/securityMonitor.js';
import { warningEmbed } from '../utils/embeds.js';

export default {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const settings = get(`SELECT * FROM security_settings WHERE guild_id = ?`, [member.guild.id]);
    if (!settings?.enabled || !settings.log_channel_id) return;

    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    const threshold = settings.new_account_days ?? 7;

    if (accountAgeDays < threshold) {
      const embed = warningEmbed(
        'New Account Detected',
        `**User:** ${member.user.tag} (<@${member.id}>)\n**Account Age:** ${accountAgeDays.toFixed(1)} days\n**Threshold:** ${threshold} days`
      ).addFields({ name: 'Action', value: 'Account flagged — please review.' });

      await logSecurityEvent(member.guild, settings.log_channel_id, embed);
    }
  },
};

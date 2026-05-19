import { get } from '../db/database.js';
import { spamTracker, mentionTracker, duplicateTracker } from '../utils/securityMonitor.js';
import { recordTicketMessage } from '../utils/ticketManager.js';

export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    await recordTicketMessage(message);

    const settings = get(`SELECT * FROM security_settings WHERE guild_id = ?`, [message.guild.id]);
    if (!settings?.enabled) return;

    await spamTracker(message, settings, client);
    await mentionTracker(message, settings, client);
    await duplicateTracker(message, settings, client);
  },
};

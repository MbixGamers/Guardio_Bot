import { getSecurity } from '../store.js';
import { checkSpam, checkMentions, checkDuplicates, checkNewAccount, checkNsfw } from '../utils/securityMonitor.js';
import { handleTicketMessage } from '../utils/ticketManager.js';

export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    // Ticket tracking (alert timers, staff message counts)
    await handleTicketMessage(message);

    const settings = getSecurity(message.guild.id);
    if (!settings?.enabled || !settings.logChannelId) return;

    // Run all checks — no bypass for admins or server owner
    await Promise.all([
      checkSpam(message, settings),
      checkMentions(message, settings),
      checkDuplicates(message, settings),
      checkNewAccount(message, settings),
      checkNsfw(message, settings),
    ]);
  },
};

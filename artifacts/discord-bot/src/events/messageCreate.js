import { getSecurity } from '../store.js';
import { checkSpam, checkMentions, checkDuplicates } from '../utils/securityMonitor.js';
import { handleTicketMessage } from '../utils/ticketManager.js';

export default {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    await handleTicketMessage(message);

    const settings = getSecurity(message.guild.id);
    if (!settings?.enabled) return;

    await checkSpam(message, settings);
    await checkMentions(message, settings);
    await checkDuplicates(message, settings);
  },
};

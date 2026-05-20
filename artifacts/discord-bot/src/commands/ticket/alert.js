import { SlashCommandBuilder } from 'discord.js';
import { handleTicketAlert } from '../../utils/ticketManager.js';
import { getTicketByChannel } from '../../store.js';
import { err } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Start a 24-hour inactivity timer — auto-closes if the user does not respond'),

  async execute(interaction) {
    const ticket = getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status === 'closed') {
      return interaction.reply({
        embeds: [err('Not a Ticket', 'This command can only be used inside an active ticket channel.')],
        ephemeral: true,
      });
    }
    await handleTicketAlert(interaction);
  },
};

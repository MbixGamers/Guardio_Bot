import { SlashCommandBuilder } from 'discord.js';
import { handleTicketClose } from '../../utils/ticketManager.js';
import { getTicketByChannel } from '../../store.js';
import { err } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket'),

  async execute(interaction) {
    const ticket = getTicketByChannel(interaction.channel.id);
    if (!ticket || ticket.status === 'closed') {
      return interaction.reply({
        embeds: [err('Not a Ticket', 'This command can only be used inside an active ticket channel.')],
        ephemeral: true,
      });
    }
    await handleTicketClose(interaction, interaction.channel.id);
  },
};

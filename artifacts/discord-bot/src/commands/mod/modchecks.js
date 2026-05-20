import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getStaff, resetStaff } from '../../store.js';
import { err, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Staff activity commands')
    .addSubcommand(s => s.setName('checks').setDescription('View staff activity leaderboard'))
    .addSubcommand(s => s.setName('reset').setDescription('Reset all staff activity data (admin only)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g   = interaction.guild.id;

    if (sub === 'checks') {
      const staff = getStaff(g);
      const rows  = Object.entries(staff)
        .sort((a, b) => b[1].credits - a[1].credits)
        .slice(0, 15);

      if (!rows.length) {
        return interaction.reply({
          embeds: [info('No Activity Yet', 'No staff activity has been recorded. Activity is tracked when tickets are closed.')],
          ephemeral: true,
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const desc   = rows.map(([uid, s], i) => {
        const rank = medals[i] ?? `**${i + 1}.**`;
        const msgs = s.messages ?? 0;
        return `${rank} <@${uid}>\n> Credits: **${s.credits}** | Tickets Handled: **${s.handled}** | Messages Sent: **${msgs}**`;
      }).join('\n\n');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('Staff Activity Leaderboard')
            .setDescription(desc)
            .setFooter({ text: 'Credits are awarded to every staff member who participates in a ticket' })
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [err('Permission Denied', 'Only administrators can reset staff data.')], ephemeral: true });
      }
      resetStaff(g);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Staff Data Reset')
            .setDescription('All staff activity records have been cleared.')
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};

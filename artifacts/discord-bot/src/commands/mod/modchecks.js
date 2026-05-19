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
      const rows  = Object.entries(staff).sort((a, b) => b[1].credits - a[1].credits).slice(0, 15);
      if (!rows.length) return interaction.reply({ embeds: [info('Leaderboard', 'No activity recorded yet.')], ephemeral: true });

      const medals = ['🥇', '🥈', '🥉'];
      const desc   = rows.map(([uid, s], i) =>
        `${medals[i] ?? `**${i + 1}.**`} <@${uid}> — **${s.credits}** credits | ${s.handled} tickets | ${s.messages} msgs`
      ).join('\n');

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('Staff Activity Leaderboard').setDescription(desc)
          .setFooter({ text: 'Credits based on active participation' }).setTimestamp()],
      });
    }

    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
        return interaction.reply({ embeds: [err('Denied', 'Admins only.')], ephemeral: true });
      resetStaff(g);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Reset').setDescription('All staff data cleared.')], ephemeral: true });
    }
  },
};

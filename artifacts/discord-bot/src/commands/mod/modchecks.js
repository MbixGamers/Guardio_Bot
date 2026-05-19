import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { all, run } from '../../db/database.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Staff activity commands')
    .addSubcommand(sub =>
      sub.setName('checks')
        .setDescription('View the staff activity leaderboard')
    )
    .addSubcommand(sub =>
      sub.setName('reset')
        .setDescription('Reset all staff activity data (admin only)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'checks') {
      const rows = all(
        `SELECT * FROM staff_activity WHERE guild_id = ? ORDER BY credits DESC LIMIT 15`,
        [interaction.guild.id]
      );

      if (rows.length === 0) {
        return interaction.reply({ embeds: [infoEmbed('Leaderboard', 'No staff activity recorded yet.')], ephemeral: true });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const desc = rows.map((r, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        return `${medal} <@${r.user_id}> — **${r.credits}** credits | ${r.tickets_handled} tickets | ${r.messages_sent} messages`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('Staff Activity Leaderboard')
        .setDescription(desc)
        .setFooter({ text: 'Credits are assigned based on active participation in tickets.' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'reset') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [errorEmbed('Denied', 'Only administrators can reset leaderboard data.')], ephemeral: true });
      }

      run(`DELETE FROM staff_activity WHERE guild_id = ?`, [interaction.guild.id]);

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Leaderboard Reset').setDescription('All staff activity data has been cleared.')],
        ephemeral: true,
      });
    }
  },
};

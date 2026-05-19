import {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder
} from 'discord.js';
import { all, get, run } from '../../db/database.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete a ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const panels = all(`SELECT * FROM panels WHERE guild_id = ? ORDER BY panel_number`, [interaction.guild.id]);

    if (panels.length === 0) {
      return interaction.reply({ embeds: [infoEmbed('No Panels', 'No panels found. Use `/create` to make one.')], ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`delete_panel_select_${interaction.id}`)
      .setPlaceholder('Select a panel to delete')
      .addOptions(panels.map(p => ({
        label: `#${p.panel_number} — ${p.title}`,
        description: p.description.slice(0, 50),
        value: String(p.id),
      })));

    await interaction.reply({
      embeds: [infoEmbed('Delete Panel', 'Select the panel you want to delete.')],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },

  async handleSelect(interaction) {
    const panelId = parseInt(interaction.values[0]);
    const panel = get(`SELECT * FROM panels WHERE id = ?`, [panelId]);

    if (!panel) {
      return interaction.update({ embeds: [errorEmbed('Error', 'Panel not found.')], components: [] });
    }

    run(`DELETE FROM panels WHERE id = ?`, [panelId]);

    await interaction.update({
      embeds: [successEmbed('Panel Deleted', `Panel **#${panel.panel_number}** — **${panel.title}** has been deleted.`)],
      components: [],
    });
  },
};

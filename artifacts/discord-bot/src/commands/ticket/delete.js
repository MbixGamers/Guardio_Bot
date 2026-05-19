import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getPanels, deletePanel } from '../../store.js';
import { ok, err, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete a ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const panels = getPanels(interaction.guild.id);
    if (!panels.length) return interaction.reply({ embeds: [info('No Panels', 'Use `/create` to make one.')], ephemeral: true });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`delete_panel_select`)
      .setPlaceholder('Select a panel to delete')
      .addOptions(panels.map(p => ({ label: `#${p.number} — ${p.title}`, description: p.description.slice(0, 50), value: String(p.id) })));

    await interaction.reply({ embeds: [info('Delete Panel', 'Select the panel to delete.')], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
  },

  async handleSelect(interaction) {
    const panelId = Number(interaction.values[0]);
    const panel = getPanels(interaction.guild.id).find(p => p.id === panelId);
    if (!panel) return interaction.update({ embeds: [err('Error', 'Panel not found.')], components: [] });
    deletePanel(interaction.guild.id, panelId);
    await interaction.update({ embeds: [ok('Panel Deleted', `Panel **#${panel.number}** — **${panel.title}** deleted.`)], components: [] });
  },
};

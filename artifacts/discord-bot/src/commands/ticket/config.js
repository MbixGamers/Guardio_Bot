import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getPanels, getPanelButtons, setQuestionnaire } from '../../store.js';
import { ok, err, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Attach a questionnaire to a ticket button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('ticket').setDescription('Configure a ticket button questionnaire')),

  async execute(interaction) {
    const panels = getPanels(interaction.guild.id);
    if (!panels.length) return interaction.reply({ embeds: [info('No Panels', 'Create a panel with `/create` first.')], ephemeral: true });

    const select = new StringSelectMenuBuilder()
      .setCustomId('config_panel_select')
      .setPlaceholder('Select a panel')
      .addOptions(panels.map(p => ({ label: `#${p.number} — ${p.title}`, value: String(p.id) })));

    await interaction.reply({ embeds: [info('Config: Select Panel', 'Which panel?')], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
  },

  async handlePanelSelect(interaction) {
    const panelId = Number(interaction.values[0]);
    const buttons = getPanelButtons(interaction.guild.id, panelId);
    if (!buttons.length) return interaction.update({ embeds: [err('No Buttons', 'Add buttons first.')], components: [] });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`config_btn_select|${panelId}`)
      .setPlaceholder('Select a button')
      .addOptions(buttons.map(b => ({ label: b.name, description: (b.description || '').slice(0, 50), value: String(b.id) })));

    await interaction.update({ embeds: [info('Config: Select Button', 'Which button?')], components: [new ActionRowBuilder().addComponents(select)] });
  },

  async handleButtonSelect(interaction) {
    const [, panelId] = interaction.customId.split('|');
    const buttonId = interaction.values[0];

    const modal = new ModalBuilder().setCustomId(`config_q|${buttonId}`).setTitle('Set Questionnaire Fields');
    for (let i = 1; i <= 5; i++) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(`f${i}`).setLabel(`Field ${i} label (blank = skip)`).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      ));
    }
    await interaction.showModal(modal);
  },
};

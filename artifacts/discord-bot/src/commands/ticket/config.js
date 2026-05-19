import {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { all, get } from '../../db/database.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure ticket questionnaires')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('ticket')
        .setDescription('Attach a questionnaire to a ticket button')
    ),

  async execute(interaction) {
    const panels = all(`SELECT * FROM panels WHERE guild_id = ? ORDER BY panel_number`, [interaction.guild.id]);

    if (panels.length === 0) {
      return interaction.reply({ embeds: [infoEmbed('No Panels', 'Create a panel first with `/create`.')], ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`config_panel_select_${interaction.id}`)
      .setPlaceholder('Select a panel')
      .addOptions(panels.map(p => ({
        label: `#${p.panel_number} — ${p.title}`,
        value: String(p.id),
      })));

    await interaction.reply({
      embeds: [infoEmbed('Config: Select Panel', 'Choose which panel to configure.')],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },

  async handleSelect(interaction) {
    const panelId = parseInt(interaction.values[0]);
    const buttons = all(`SELECT * FROM buttons WHERE panel_id = ?`, [panelId]);

    if (buttons.length === 0) {
      return interaction.update({
        embeds: [errorEmbed('No Buttons', 'This panel has no buttons yet.')],
        components: [],
      });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`config_button_select_${panelId}`)
      .setPlaceholder('Select a button to configure')
      .addOptions(buttons.map(b => ({
        label: b.name,
        description: (b.description || 'No description').slice(0, 50),
        value: String(b.id),
      })));

    await interaction.update({
      embeds: [infoEmbed('Config: Select Button', 'Choose which button to attach a questionnaire to.')],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  },

  async handleButtonSelect(interaction) {
    const buttonId = parseInt(interaction.values[0]);
    const modal = new ModalBuilder()
      .setCustomId(`config_questionnaire_${buttonId}`)
      .setTitle('Configure Questionnaire');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('field1_label').setLabel('Field 1 Label (blank to skip)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('field2_label').setLabel('Field 2 Label (blank to skip)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('field3_label').setLabel('Field 3 Label (blank to skip)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('field4_label').setLabel('Field 4 Label (blank to skip)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('field5_label').setLabel('Field 5 Label (blank to skip)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(45)
      )
    );

    await interaction.showModal(modal);
  },
};

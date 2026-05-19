import {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder
} from 'discord.js';
import { get, run } from '../../db/database.js';
import { successEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('panel_create_modal')
      .setTitle('Create Ticket Panel');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('panel_title')
          .setLabel('Panel Title')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('panel_description')
          .setLabel('Panel Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const guildId = interaction.guild.id;
    const title = interaction.fields.getTextInputValue('panel_title');
    const description = interaction.fields.getTextInputValue('panel_description');

    const last = get(`SELECT MAX(panel_number) as maxNum FROM panels WHERE guild_id = ?`, [guildId]);
    const panelNumber = ((last?.maxNum) ?? 0) + 1;

    run(
      `INSERT INTO panels (guild_id, panel_number, title, description) VALUES (?, ?, ?, ?)`,
      [guildId, panelNumber, title, description]
    );

    await interaction.reply({
      embeds: [successEmbed('Panel Created', `Panel **#${panelNumber}** — **${title}** has been created.\nUse \`/add button\` to add buttons, then \`/send panel\` to deploy it.`)],
      ephemeral: true,
    });
  },
};

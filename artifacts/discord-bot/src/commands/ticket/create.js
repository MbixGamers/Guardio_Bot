import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { addPanel } from '../../store.js';
import { ok } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new ticket panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId('panel_create_modal').setTitle('Create Ticket Panel');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Panel Title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Panel Description').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))
    );
    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const panel = addPanel(
      interaction.guild.id,
      interaction.fields.getTextInputValue('title'),
      interaction.fields.getTextInputValue('desc')
    );
    await interaction.reply({ embeds: [ok('Panel Created', `Panel **#${panel.number}** — **${panel.title}** created.\nUse \`/add button\` then \`/send panel\` to deploy it.`)], ephemeral: true });
  },
};

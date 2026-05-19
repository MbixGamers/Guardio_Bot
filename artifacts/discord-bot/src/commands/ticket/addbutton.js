import { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getPanels, getButtons, addButton } from '../../store.js';
import { ok, err } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a button to a panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('button').setDescription('Add a ticket button to a panel')
        .addIntegerOption(o => o.setName('panel').setDescription('Panel number').setRequired(true))
        .addChannelOption(o => o.setName('category').setDescription('Category for ticket channels').setRequired(true))
        .addStringOption(o => o.setName('roles').setDescription('Comma-separated support role IDs').setRequired(false))
    ),

  async execute(interaction) {
    const panelNum = interaction.options.getInteger('panel');
    const category = interaction.options.getChannel('category');
    const rolesRaw = interaction.options.getString('roles') ?? '';
    const panel = getPanels(interaction.guild.id).find(p => p.number === panelNum);
    if (!panel) return interaction.reply({ embeds: [err('Not Found', `Panel #${panelNum} does not exist.`)], ephemeral: true });

    const supportRoles = rolesRaw.split(',').map(r => r.trim().replace(/[<@&>]/g, '')).filter(Boolean);

    const modal = new ModalBuilder()
      .setCustomId(`add_button_modal|${panel.id}|${category.id}|${JSON.stringify(supportRoles)}`)
      .setTitle(`Add Button to Panel #${panelNum}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Button Name (unique)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (optional)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200))
    );
    await interaction.showModal(modal);
  },
};

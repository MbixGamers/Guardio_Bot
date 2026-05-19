import {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder
} from 'discord.js';
import { get } from '../../db/database.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a button to a panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('button')
        .setDescription('Add a button to a ticket panel')
        .addIntegerOption(opt =>
          opt.setName('panel').setDescription('Panel number').setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('category').setDescription('Category for ticket channels').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('support_roles').setDescription('Comma-separated role IDs for support access').setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== 'button') return;

    const panelNumber = interaction.options.getInteger('panel');
    const category = interaction.options.getChannel('category');
    const rolesRaw = interaction.options.getString('support_roles') || '';

    const panel = get(`SELECT * FROM panels WHERE guild_id = ? AND panel_number = ?`, [interaction.guild.id, panelNumber]);

    if (!panel) {
      return interaction.reply({ embeds: [errorEmbed('Not Found', `Panel #${panelNumber} does not exist.`)], ephemeral: true });
    }

    const supportRoles = rolesRaw
      ? rolesRaw.split(',').map(r => r.trim().replace(/[<@&>]/g, '')).filter(Boolean)
      : [];

    const modal = new ModalBuilder()
      .setCustomId(`add_button_modal_${panel.id}_${category.id}_${JSON.stringify(supportRoles)}`)
      .setTitle(`Add Button to Panel #${panelNumber}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('btn_name')
          .setLabel('Button Name (unique identifier)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('btn_emoji')
          .setLabel('Emoji (optional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('btn_description')
          .setLabel('Button Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(200)
      )
    );

    await interaction.showModal(modal);
  },
};

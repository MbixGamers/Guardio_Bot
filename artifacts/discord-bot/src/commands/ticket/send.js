import {
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType
} from 'discord.js';
import { all, get } from '../../db/database.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a ticket panel to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Send a panel embed to a channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send the panel in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const panels = all(`SELECT * FROM panels WHERE guild_id = ? ORDER BY panel_number`, [interaction.guild.id]);

    if (panels.length === 0) {
      return interaction.reply({ embeds: [infoEmbed('No Panels', 'No panels configured yet.')], ephemeral: true });
    }

    const targetChannel = interaction.options.getChannel('channel');

    const select = new StringSelectMenuBuilder()
      .setCustomId(`send_panel_select_${targetChannel.id}`)
      .setPlaceholder('Select a panel to send')
      .addOptions(panels.map(p => ({
        label: `#${p.panel_number} — ${p.title}`,
        description: p.description.slice(0, 50),
        value: String(p.id),
      })));

    await interaction.reply({
      embeds: [infoEmbed('Send Panel', `Select which panel to send to <#${targetChannel.id}>.`)],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
  },

  async handleSelect(interaction) {
    const channelId = interaction.customId.replace('send_panel_select_', '');
    const panelId = parseInt(interaction.values[0]);

    const panel = get(`SELECT * FROM panels WHERE id = ?`, [panelId]);
    if (!panel) {
      return interaction.update({ embeds: [errorEmbed('Error', 'Panel not found.')], components: [] });
    }

    const buttons = all(`SELECT * FROM buttons WHERE panel_id = ?`, [panelId]);
    if (buttons.length === 0) {
      return interaction.update({
        embeds: [errorEmbed('No Buttons', 'This panel has no buttons. Use `/add button` first.')],
        components: [],
      });
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      return interaction.update({ embeds: [errorEmbed('Error', 'Target channel not found.')], components: [] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(panel.title)
      .setDescription(panel.description)
      .setFooter({ text: `Panel #${panel.panel_number}` })
      .setTimestamp();

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      const chunk = buttons.slice(i, i + 5);
      const row = new ActionRowBuilder();
      for (const btn of chunk) {
        const builder = new ButtonBuilder()
          .setCustomId(`ticket_open_${btn.name}`)
          .setLabel(btn.name)
          .setStyle(ButtonStyle.Primary);
        if (btn.emoji) builder.setEmoji(btn.emoji);
        row.addComponents(builder);
      }
      rows.push(row);
    }

    await channel.send({ embeds: [embed], components: rows });

    await interaction.update({
      embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Panel Sent').setDescription(`Panel **${panel.title}** sent to <#${channelId}>.`)],
      components: [],
    });
  },
};

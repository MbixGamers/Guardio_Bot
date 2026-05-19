import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } from 'discord.js';
import { getPanels, getPanelButtons } from '../../store.js';
import { err, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a ticket panel to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('panel').setDescription('Send a panel to a channel')
        .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    ),

  async execute(interaction) {
    const panels = getPanels(interaction.guild.id);
    if (!panels.length) return interaction.reply({ embeds: [info('No Panels', 'Use `/create` first.')], ephemeral: true });

    const targetId = interaction.options.getChannel('channel').id;
    const select = new StringSelectMenuBuilder()
      .setCustomId(`send_panel_select|${targetId}`)
      .setPlaceholder('Select a panel')
      .addOptions(panels.map(p => ({ label: `#${p.number} — ${p.title}`, description: p.description.slice(0, 50), value: String(p.id) })));

    await interaction.reply({ embeds: [info('Send Panel', `Select a panel to send to <#${targetId}>.`)], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
  },

  async handleSelect(interaction) {
    const [, channelId] = interaction.customId.split('|');
    const panelId = Number(interaction.values[0]);
    const panel   = getPanels(interaction.guild.id).find(p => p.id === panelId);
    if (!panel) return interaction.update({ embeds: [err('Error', 'Panel not found.')], components: [] });

    const buttons = getPanelButtons(interaction.guild.id, panelId);
    if (!buttons.length) return interaction.update({ embeds: [err('No Buttons', 'Add buttons with `/add button` first.')], components: [] });

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.update({ embeds: [err('Error', 'Channel not found.')], components: [] });

    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(panel.title).setDescription(panel.description).setFooter({ text: `Panel #${panel.number}` }).setTimestamp();

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      const row = new ActionRowBuilder();
      for (const btn of buttons.slice(i, i + 5)) {
        const b = new ButtonBuilder().setCustomId(`ticket_open|${btn.name}`).setLabel(btn.name).setStyle(ButtonStyle.Primary);
        if (btn.emoji) b.setEmoji(btn.emoji);
        row.addComponents(b);
      }
      rows.push(row);
    }

    await channel.send({ embeds: [embed], components: rows });
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Panel Sent').setDescription(`Panel sent to <#${channelId}>.`)], components: [] });
  },
};

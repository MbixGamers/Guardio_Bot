import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { setTranscriptChannel, getTranscriptChannel } from '../../store.js';
import { ok, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Configure transcript logging')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('log')
        .setDescription('Set the channel where ticket transcripts are saved')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Channel to send transcripts to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel');
    const g       = interaction.guild.id;

    if (sub === 'log') {
      setTranscriptChannel(g, channel.id);
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('Transcript Channel Set')
            .setDescription(`Ticket transcripts will now be sent to <#${channel.id}> whenever a ticket is closed.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};

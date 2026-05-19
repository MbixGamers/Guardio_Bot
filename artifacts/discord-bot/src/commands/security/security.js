import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getSecurity, setSecurity } from '../../store.js';
import { ok, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Manage the security system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('on').setDescription('Enable monitoring'))
    .addSubcommand(s => s.setName('off').setDescription('Disable monitoring'))
    .addSubcommand(s =>
      s.setName('log').setDescription('Set the security log channel')
        .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g = interaction.guild.id;

    if (sub === 'on')  { setSecurity(g, { enabled: true });  return interaction.reply({ embeds: [ok('Security Enabled', 'Monitoring is now active.')], ephemeral: true }); }
    if (sub === 'off') { setSecurity(g, { enabled: false }); return interaction.reply({ embeds: [info('Security Disabled', 'Monitoring has been disabled.')], ephemeral: true }); }

    const ch = interaction.options.getChannel('channel');
    setSecurity(g, { logChannelId: ch.id });
    return interaction.reply({ embeds: [ok('Log Channel Set', `Logs will be sent to <#${ch.id}>.`)], ephemeral: true });
  },
};

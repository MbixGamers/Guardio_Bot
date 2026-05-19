import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { get, run } from '../../db/database.js';
import { successEmbed, infoEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Manage the security system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('on').setDescription('Enable security monitoring'))
    .addSubcommand(sub => sub.setName('off').setDescription('Disable security monitoring'))
    .addSubcommand(sub =>
      sub.setName('log')
        .setDescription('Set the security log channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send security logs')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    run(`INSERT OR IGNORE INTO security_settings (guild_id) VALUES (?)`, [guildId]);

    if (sub === 'on') {
      run(`UPDATE security_settings SET enabled = 1 WHERE guild_id = ?`, [guildId]);
      return interaction.reply({ embeds: [successEmbed('Security Enabled', 'Security monitoring is now **active**.')], ephemeral: true });
    }

    if (sub === 'off') {
      run(`UPDATE security_settings SET enabled = 0 WHERE guild_id = ?`, [guildId]);
      return interaction.reply({ embeds: [infoEmbed('Security Disabled', 'Security monitoring has been **disabled**.')], ephemeral: true });
    }

    if (sub === 'log') {
      const channel = interaction.options.getChannel('channel');
      run(`UPDATE security_settings SET log_channel_id = ? WHERE guild_id = ?`, [channel.id, guildId]);
      return interaction.reply({
        embeds: [successEmbed('Log Channel Set', `Security logs will now be sent to <#${channel.id}>.`)],
        ephemeral: true,
      });
    }
  },
};

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { blacklistAdd, blacklistRemove, getBlacklist } from '../../store.js';
import { ok, err, info } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the ticket blacklist')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s.setName('add').setDescription('Prevent a user from opening tickets')
        .addUserOption(o => o.setName('user').setDescription('User to blacklist').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('remove').setDescription('Allow a blacklisted user to open tickets again')
        .addUserOption(o => o.setName('user').setDescription('User to unblacklist').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('list').setDescription('Show all blacklisted users')
    ),

  async execute(interaction) {
    const sub  = interaction.options.getSubcommand();
    const g    = interaction.guild.id;

    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      const added = blacklistAdd(g, user.id);
      return interaction.reply({
        embeds: [added
          ? ok('Blacklisted', `${user.tag} can no longer open tickets.`)
          : info('Already Blacklisted', `${user.tag} is already on the blacklist.`)],
        ephemeral: true,
      });
    }

    if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      const removed = blacklistRemove(g, user.id);
      return interaction.reply({
        embeds: [removed
          ? ok('Removed from Blacklist', `${user.tag} can now open tickets again.`)
          : err('Not Found', `${user.tag} is not on the blacklist.`)],
        ephemeral: true,
      });
    }

    if (sub === 'list') {
      const list = getBlacklist(g);
      return interaction.reply({
        embeds: [info('Blacklisted Users', list.length ? list.map(id => `<@${id}>`).join('\n') : 'Nobody is blacklisted.')],
        ephemeral: true,
      });
    }
  },
};

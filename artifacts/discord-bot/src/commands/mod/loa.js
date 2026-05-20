import {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder
} from 'discord.js';
import {
  setLoaChannel, getLoaChannel, setLoaRole, getLoaRole,
  createLoaRequest, setLoaRequestMsgId, getAllSupportRoles
} from '../../store.js';
import { err, ok, info } from '../../utils/embeds.js';
import { isAdmin, isSupportRole } from '../../utils/permissions.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loa')
    .setDescription('Leave of Absence management')
    .addSubcommand(s =>
      s.setName('apply').setDescription('Submit a Leave of Absence request')
    )
    .addSubcommand(s =>
      s.setName('log')
        .setDescription('Set the channel where LOA requests are sent (admin only)')
        .addChannelOption(o =>
          o.setName('channel').setDescription('LOA request channel').setRequired(true)
        )
    )
    .addSubcommand(s =>
      s.setName('role')
        .setDescription('Set the role assigned to approved LOA members (admin only)')
        .addRoleOption(o =>
          o.setName('role').setDescription('LOA role').setRequired(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const g   = interaction.guild.id;

    // ── /loa log ──────────────────────────────────────────────────────────────
    if (sub === 'log') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [err('Permission Denied', 'Only administrators can configure this.')], ephemeral: true });
      }
      const channel = interaction.options.getChannel('channel');
      setLoaChannel(g, channel.id);
      return interaction.reply({
        embeds: [ok('LOA Channel Set', `LOA requests will be posted to <#${channel.id}>.`)],
        ephemeral: true,
      });
    }

    // ── /loa role ─────────────────────────────────────────────────────────────
    if (sub === 'role') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [err('Permission Denied', 'Only administrators can configure this.')], ephemeral: true });
      }
      const role = interaction.options.getRole('role');
      setLoaRole(g, role.id);
      return interaction.reply({
        embeds: [ok('LOA Role Set', `${role} will be assigned to staff members whose LOA is approved.`)],
        ephemeral: true,
      });
    }

    // ── /loa apply ────────────────────────────────────────────────────────────
    if (sub === 'apply') {
      if (!isAdmin(interaction.member) && !isSupportRole(interaction.member, getAllSupportRoles(g))) {
        return interaction.reply({ embeds: [err('Permission Denied', 'Only staff members can submit a Leave of Absence request.')], ephemeral: true });
      }
      const logChannelId = getLoaChannel(g);
      if (!logChannelId) {
        return interaction.reply({
          embeds: [err('Not Configured', 'LOA requests have not been set up yet. Ask an administrator to run `/loa log`.')],
          ephemeral: true,
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('loa_apply_modal')
        .setTitle('Leave of Absence Request');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for LOA')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Please explain why you need a leave of absence...')
            .setRequired(true)
            .setMaxLength(500)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('Expected Duration')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 1 week, 2 weeks, 1 month')
            .setRequired(true)
            .setMaxLength(50)
        ),
      );

      return interaction.showModal(modal);
    }
  },

  // Called from interactionCreate when the LOA modal is submitted
  async handleModal(interaction) {
    const g        = interaction.guild.id;
    const reason   = interaction.fields.getTextInputValue('reason').trim();
    const duration = interaction.fields.getTextInputValue('duration').trim();

    const logChannelId = getLoaChannel(g);
    if (!logChannelId) {
      return interaction.reply({
        embeds: [err('Not Configured', 'LOA is not properly configured. Contact an administrator.')],
        ephemeral: true,
      });
    }

    const logChannel = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel) {
      return interaction.reply({
        embeds: [err('Channel Not Found', 'The configured LOA channel no longer exists. Contact an administrator.')],
        ephemeral: true,
      });
    }

    const request  = createLoaRequest(g, interaction.user.id, reason, duration);
    const avatarURL = interaction.user.displayAvatarURL({ size: 128, extension: 'png' });

    const requestEmbed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setAuthor({ name: interaction.user.tag, iconURL: avatarURL })
      .setTitle('Leave of Absence Request')
      .setThumbnail(avatarURL)
      .addFields(
        { name: 'Staff Member', value: `${interaction.user}`,   inline: true },
        { name: 'Duration',     value: duration,                inline: true },
        { name: 'Status',       value: 'Pending Review',        inline: true },
        { name: 'Reason',       value: reason,                  inline: false },
      )
      .setFooter({ text: `Request ID: ${request.id}` })
      .setTimestamp();

    const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = await import('discord.js');
    const buttons = new ARB().addComponents(
      new BB()
        .setCustomId(`loa_approve|${g}|${request.id}`)
        .setLabel('Approve')
        .setStyle(BS.Success)
        .setEmoji('✅'),
      new BB()
        .setCustomId(`loa_deny|${g}|${request.id}`)
        .setLabel('Deny')
        .setStyle(BS.Danger)
        .setEmoji('❌'),
    );

    const requestMsg = await logChannel.send({ embeds: [requestEmbed], components: [buttons] });
    setLoaRequestMsgId(g, request.id, requestMsg.id);

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('LOA Request Submitted')
          .setDescription('Your Leave of Absence request has been submitted and is pending review by an administrator.')
          .setTimestamp(),
      ],
      ephemeral: true,
    });
  },
};

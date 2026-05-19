import {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import {
  getButton, getQuestionnaire, getOpenTicket, createTicket,
  closeTicket, claimTicket, recordMessage, getTicketMsgs,
  getTicketByChannel, creditStaff, isBlacklisted
} from '../store.js';
import { ok, err, info } from './embeds.js';
import { EmbedBuilder } from 'discord.js';
import { isAdmin, isSupportRole } from './permissions.js';

export async function handleTicketButton(interaction) {
  const buttonName = interaction.customId.split('|')[1];
  const g = interaction.guild.id;

  if (isBlacklisted(g, interaction.user.id)) {
    return interaction.reply({ embeds: [err('Blacklisted', 'You are not allowed to open tickets.')], ephemeral: true });
  }

  const button = getButton(g, buttonName);
  if (!button) return interaction.reply({ embeds: [err('Error', 'Button not configured.')], ephemeral: true });

  const fields = getQuestionnaire(g, button.id);

  if (fields.length) {
    const modal = new ModalBuilder().setCustomId(`ticket_modal|${buttonName}`).setTitle(`Open Ticket: ${buttonName}`);
    for (const f of fields.slice(0, 5)) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(f.id).setLabel(f.label)
          .setStyle(TextInputStyle.Short).setRequired(true)
      ));
    }
    return interaction.showModal(modal);
  }

  await openTicket(interaction, buttonName, []);
}

export async function handleTicketModal(interaction) {
  const buttonName = interaction.customId.split('|')[1];
  const g = interaction.guild.id;
  const button = getButton(g, buttonName);
  if (!button) return interaction.reply({ embeds: [err('Error', 'Config not found.')], ephemeral: true });

  const fields = getQuestionnaire(g, button.id);
  const responses = fields.map(f => {
    try { return { name: f.label, value: interaction.fields.getTextInputValue(f.id) || 'N/A', inline: false }; }
    catch { return null; }
  }).filter(Boolean);

  await openTicket(interaction, buttonName, responses);
}

async function openTicket(interaction, buttonName, responses) {
  const g = interaction.guild.id;

  if (isBlacklisted(g, interaction.user.id)) {
    const r = { embeds: [err('Blacklisted', 'You are not allowed to open tickets.')], ephemeral: true };
    return interaction.replied || interaction.deferred ? interaction.editReply(r) : interaction.reply(r);
  }

  const existing = getOpenTicket(g, interaction.user.id, buttonName);
  if (existing) {
    const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
    const r = { embeds: [info('Already Open', ch ? `You already have a ticket: <#${existing.channelId}>` : 'Your old ticket channel was deleted — please try again.')], ephemeral: true };
    if (!ch) closeTicket(existing.channelId);
    return interaction.replied || interaction.deferred ? interaction.editReply(r) : interaction.reply(r);
  }

  const replyFn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[replyFn]({ embeds: [info('Opening Ticket', 'Creating your channel...')], ephemeral: true });

  const button = getButton(g, buttonName);
  const supportRoles = button.supportRoles ?? [];
  const perms = [
    { id: g, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...supportRoles.map(r => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
  ];

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username.slice(0, 12).replace(/[^a-z0-9]/gi, '') || 'user'}-${Date.now().toString(36).slice(-4)}`,
    type: ChannelType.GuildText,
    parent: button.categoryId,
    permissionOverwrites: perms,
    reason: `Ticket by ${interaction.user.tag}`,
  });

  const ticket = createTicket(channel.id, g, interaction.user.id, buttonName);

  const embed = new EmbedBuilder().setColor(0x5865F2)
    .setTitle(`Ticket: ${buttonName}`)
    .setDescription(`Welcome ${interaction.user}! Support will be with you shortly.\n\n${button.description || ''}`)
    .addFields(
      { name: 'Opened By', value: interaction.user.tag, inline: true },
      { name: 'Category', value: buttonName, inline: true },
      ...responses
    )
    .setTimestamp();

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_close|${channel.id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId(`ticket_claim|${channel.id}`).setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary).setEmoji('✋')
  );

  await channel.send({
    content: `${interaction.user} ${supportRoles.map(r => `<@&${r}>`).join(' ')}`,
    embeds: [embed],
    components: [controls],
  });

  await interaction.editReply({ embeds: [ok('Ticket Created', `Your ticket is ready: <#${channel.id}>`)] });
}

export async function handleTicketClose(interaction) {
  const channelId = interaction.customId.split('|')[1];
  const ticket = getTicketByChannel(channelId);

  if (!ticket || ticket.status === 'closed')
    return interaction.reply({ embeds: [err('Error', 'Ticket not found or already closed.')], ephemeral: true });

  const button = ticket.buttonName ? getButton(ticket.guildId, ticket.buttonName) : null;
  const supportRoles = button?.supportRoles ?? [];

  if (interaction.user.id !== ticket.userId && !isAdmin(interaction.member) && !isSupportRole(interaction.member, supportRoles))
    return interaction.reply({ embeds: [err('Denied', 'You cannot close this ticket.')], ephemeral: true });

  // Assign staff credit
  const msgs = getTicketMsgs(ticket.id);
  let creditTo = ticket.claimedBy;
  const sorted = Object.entries(msgs).sort((a, b) => b[1] - a[1]);
  if (sorted.length && (!creditTo || !msgs[creditTo])) creditTo = sorted[0][0];
  if (creditTo) creditStaff(ticket.guildId, creditTo, Object.values(msgs).reduce((a, b) => a + b, 0));

  closeTicket(channelId);

  await interaction.reply({ embeds: [ok('Ticket Closed', `Closed by ${interaction.user.tag}. Channel deletes in 5s.`)] });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

export async function handleTicketClaim(interaction) {
  const channelId = interaction.customId.split('|')[1];
  const ticket = getTicketByChannel(channelId);
  if (!ticket || ticket.status === 'closed')
    return interaction.reply({ embeds: [err('Error', 'Ticket not found or closed.')], ephemeral: true });

  claimTicket(channelId, interaction.user.id);
  await interaction.reply({ embeds: [info('Ticket Claimed', `<@${interaction.user.id}> claimed this ticket. All support can still assist.`)] });
}

export async function handleTicketMessage(message) {
  const ticket = getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open' || message.author.id === ticket.userId) return;
  recordMessage(ticket.id, message.author.id);
}

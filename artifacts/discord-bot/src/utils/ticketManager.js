import {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { get, all, run } from '../db/database.js';
import { ticketEmbed, successEmbed, errorEmbed, infoEmbed } from './embeds.js';
import { isAdmin, isSupportRole } from './permissions.js';

export async function handleTicketButton(interaction, client) {
  const buttonName = interaction.customId.replace('ticket_open_', '');
  const button = get(`SELECT * FROM buttons WHERE guild_id = ? AND name = ?`, [interaction.guild.id, buttonName]);

  if (!button) {
    return interaction.reply({ embeds: [errorEmbed('Error', 'Button configuration not found.')], ephemeral: true });
  }

  const questionnaire = get(`SELECT * FROM questionnaires WHERE button_id = ?`, [button.id]);
  const fields = questionnaire ? JSON.parse(questionnaire.fields) : [];
  const textFields = fields.filter(f => f.type === 'text').slice(0, 5);

  if (textFields.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${buttonName}`)
      .setTitle(`Open Ticket: ${button.name}`);

    for (const field of textFields) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(field.id)
            .setLabel(field.label)
            .setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setRequired(field.required ?? true)
            .setPlaceholder(field.placeholder || '')
        )
      );
    }

    await interaction.showModal(modal);
  } else {
    await createTicket(interaction, buttonName, [], client);
  }
}

export async function handleTicketModalSubmit(interaction, client) {
  const buttonName = interaction.customId.replace('ticket_modal_', '');
  const button = get(`SELECT * FROM buttons WHERE guild_id = ? AND name = ?`, [interaction.guild.id, buttonName]);

  if (!button) {
    return interaction.reply({ embeds: [errorEmbed('Error', 'Configuration not found.')], ephemeral: true });
  }

  const questionnaire = get(`SELECT * FROM questionnaires WHERE button_id = ?`, [button.id]);
  const fields = questionnaire ? JSON.parse(questionnaire.fields) : [];

  const responses = [];
  for (const field of fields.filter(f => f.type === 'text')) {
    try {
      const value = interaction.fields.getTextInputValue(field.id).trim();
      responses.push({ name: field.label, value: value || 'N/A' });
    } catch {}
  }

  await createTicket(interaction, buttonName, responses, client);
}

async function createTicket(interaction, buttonName, responses, client) {
  const button = get(`SELECT * FROM buttons WHERE guild_id = ? AND name = ?`, [interaction.guild.id, buttonName]);
  if (!button) return;

  // Check for existing open ticket
  const existing = get(
    `SELECT t.* FROM tickets t
     JOIN buttons b ON t.button_id = b.id
     WHERE t.guild_id = ? AND t.user_id = ? AND t.status = 'open' AND b.name = ?`,
    [interaction.guild.id, interaction.user.id, buttonName]
  );

  if (existing) {
    const ch = await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);
    if (ch) {
      const reply = { embeds: [infoEmbed('Ticket Exists', `You already have an open ticket: <#${existing.channel_id}>`)], ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.editReply(reply)
        : interaction.reply(reply);
    }
    run(`UPDATE tickets SET status = 'closed' WHERE id = ?`, [existing.id]);
  }

  const replyPayload = { embeds: [infoEmbed('Creating Ticket', 'Setting up your ticket channel...')], ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(replyPayload);
  } else {
    await interaction.reply(replyPayload);
  }

  const supportRoles = JSON.parse(button.support_roles || '[]');

  const permissionOverwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];

  for (const roleId of supportRoles) {
    permissionOverwrites.push({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const ticketCount = get(`SELECT COUNT(*) as cnt FROM tickets WHERE guild_id = ?`, [interaction.guild.id]);
  const channelName = `ticket-${String((ticketCount?.cnt ?? 0) + 1).padStart(4, '0')}-${interaction.user.username.slice(0, 10).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user'}`;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: button.category_id,
    permissionOverwrites,
    reason: `Ticket opened by ${interaction.user.tag}`,
  });

  const ticketResult = run(
    `INSERT INTO tickets (guild_id, channel_id, user_id, button_id) VALUES (?, ?, ?, ?)`,
    [interaction.guild.id, channel.id, interaction.user.id, button.id]
  );

  const ticketId = ticketResult.lastInsertRowid;

  const embedFields = [
    { name: 'Opened By', value: interaction.user.tag, inline: true },
    { name: 'Category', value: button.name, inline: true },
    ...responses,
  ];

  const embed = ticketEmbed(
    `Ticket: ${button.name}`,
    `Welcome ${interaction.user}! Support will be with you shortly.\n\n${button.description || ''}`,
    embedFields
  );

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${ticketId}`)
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('✋')
  );

  await channel.send({
    content: `${interaction.user} ${supportRoles.map(r => `<@&${r}>`).join(' ')}`,
    embeds: [embed],
    components: [controls],
  });

  await interaction.editReply({
    embeds: [successEmbed('Ticket Created', `Your ticket has been opened: <#${channel.id}>`)],
  });
}

export async function handleTicketClose(interaction, client) {
  const ticketId = parseInt(interaction.customId.replace('ticket_close_', ''));
  const ticket = get(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);

  if (!ticket || ticket.status === 'closed') {
    return interaction.reply({ embeds: [errorEmbed('Error', 'Ticket not found or already closed.')], ephemeral: true });
  }

  const button = ticket.button_id ? get(`SELECT * FROM buttons WHERE id = ?`, [ticket.button_id]) : null;
  const supportRoles = button ? JSON.parse(button.support_roles || '[]') : [];

  if (
    interaction.user.id !== ticket.user_id &&
    !isAdmin(interaction.member) &&
    !isSupportRole(interaction.member, supportRoles)
  ) {
    return interaction.reply({ embeds: [errorEmbed('Denied', 'You cannot close this ticket.')], ephemeral: true });
  }

  assignStaffCredit(ticket);
  run(`UPDATE tickets SET status = 'closed' WHERE id = ?`, [ticketId]);

  await interaction.reply({ embeds: [successEmbed('Ticket Closed', `Closed by ${interaction.user.tag}. Channel will be deleted in 5 seconds.`)] });

  setTimeout(async () => {
    await interaction.channel.delete().catch(() => {});
  }, 5000);
}

export async function handleTicketClaim(interaction, client) {
  const ticketId = parseInt(interaction.customId.replace('ticket_claim_', ''));
  const ticket = get(`SELECT * FROM tickets WHERE id = ?`, [ticketId]);

  if (!ticket || ticket.status === 'closed') {
    return interaction.reply({ embeds: [errorEmbed('Error', 'Ticket not found or closed.')], ephemeral: true });
  }

  run(`UPDATE tickets SET claimed_by = ? WHERE id = ?`, [interaction.user.id, ticketId]);

  await interaction.reply({
    embeds: [infoEmbed('Ticket Claimed', `<@${interaction.user.id}> has claimed this ticket.\nAll support staff can still assist.`)]
  });
}

export async function recordTicketMessage(message) {
  const ticket = get(`SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'`, [message.channel.id]);
  if (!ticket) return;
  if (message.author.id === ticket.user_id) return;

  run(
    `INSERT INTO ticket_messages (ticket_id, user_id, count) VALUES (?, ?, 1)
     ON CONFLICT(ticket_id, user_id) DO UPDATE SET count = count + 1`,
    [ticket.id, message.author.id]
  );
}

function assignStaffCredit(ticket) {
  const messages = all(
    `SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY count DESC`,
    [ticket.id]
  );

  let creditUserId = ticket.claimed_by;

  if (messages.length > 0) {
    const topContributor = messages[0];
    if (creditUserId) {
      const claimantMsgs = messages.find(m => m.user_id === creditUserId);
      if (!claimantMsgs) creditUserId = topContributor.user_id;
    } else {
      creditUserId = topContributor.user_id;
    }
  }

  if (!creditUserId) return;

  const totalMessages = messages.reduce((s, m) => s + m.count, 0);

  run(
    `INSERT INTO staff_activity (guild_id, user_id, tickets_handled, messages_sent, credits)
     VALUES (?, ?, 1, ?, 1)
     ON CONFLICT(guild_id, user_id) DO UPDATE SET
       tickets_handled = tickets_handled + 1,
       messages_sent = messages_sent + ?,
       credits = credits + 1`,
    [ticket.guild_id, creditUserId, totalMessages, totalMessages]
  );
}

import {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder
} from 'discord.js';
import {
  getButton, getQuestionnaire, getOpenTicket, createTicket, closeTicket, claimTicket,
  recordMessage, getTicketMsgs, getTicketByChannel, creditAllStaff, isBlacklisted,
  getNextTicketNumber, setTicketHeaderMsg, getTranscriptChannel
} from '../store.js';
import { ok, err, info, warn } from './embeds.js';
import { isAdmin, isSupportRole } from './permissions.js';

// In-memory alert timers: channelId -> { timeout, alertMsgId, staffId }
export const alertTimers = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
}

function pad(n, digits = 4) {
  return String(n).padStart(digits, '0');
}

// ── Open ticket ───────────────────────────────────────────────────────────────

export async function handleTicketButton(interaction) {
  const buttonName = interaction.customId.split('|')[1];
  const g = interaction.guild.id;

  if (isBlacklisted(g, interaction.user.id)) {
    return interaction.reply({
      embeds: [err('Access Denied', 'You are not permitted to open tickets in this server.')],
      ephemeral: true,
    });
  }

  const button = getButton(g, buttonName);
  if (!button) return interaction.reply({ embeds: [err('Configuration Error', 'This button is not properly configured.')], ephemeral: true });

  const fields = getQuestionnaire(g, button.id);

  if (fields.length) {
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal|${buttonName}`)
      .setTitle(`Open a Ticket — ${buttonName}`);
    for (const f of fields.slice(0, 5)) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
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
  if (!button) return interaction.reply({ embeds: [err('Configuration Error', 'Configuration not found.')], ephemeral: true });

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
    const r = { embeds: [err('Access Denied', 'You are not permitted to open tickets in this server.')], ephemeral: true };
    return interaction.replied || interaction.deferred ? interaction.editReply(r) : interaction.reply(r);
  }

  // One open ticket per user (across all categories)
  const existing = getOpenTicket(g, interaction.user.id);
  if (existing) {
    const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
    if (ch) {
      const r = {
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('You Already Have an Open Ticket')
            .setDescription(`You can only have **one open ticket** at a time.\n\nYour current ticket: <#${existing.channelId}>\n\nPlease resolve your existing ticket before opening a new one.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      };
      return interaction.replied || interaction.deferred ? interaction.editReply(r) : interaction.reply(r);
    }
    // Channel was deleted — clean up
    closeTicket(existing.channelId);
  }

  const replyFn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[replyFn]({
    embeds: [info('Creating Your Ticket', 'Please wait while your ticket channel is being set up...')],
    ephemeral: true,
  });

  const button = getButton(g, buttonName);
  const supportRoles = Array.isArray(button.supportRoles) ? button.supportRoles : [];

  const ticketNumber = getNextTicketNumber(g);
  const categorySlug = slugify(buttonName);
  const userSlug     = slugify(interaction.user.username);
  const channelName  = `${categorySlug}-${userSlug}-${pad(ticketNumber)}`;

  const perms = [
    { id: g, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...supportRoles.map(r => ({
      id: r,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: button.categoryId,
    permissionOverwrites: perms,
    reason: `Ticket #${ticketNumber} opened by ${interaction.user.tag}`,
  });

  const ticket = createTicket(channel.id, g, interaction.user.id, buttonName, ticketNumber);

  const avatarURL = interaction.user.displayAvatarURL({ size: 256, extension: 'png' });

  const headerEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `${interaction.user.tag}`, iconURL: avatarURL })
    .setTitle(`Ticket #${pad(ticketNumber)} — ${buttonName}`)
    .setDescription(
      `Welcome, ${interaction.user}! A member of our support team will be with you shortly.\n` +
      (button.description ? `\n${button.description}` : '')
    )
    .addFields(
      { name: 'Opened By',  value: `${interaction.user}`, inline: true },
      { name: 'Category',   value: buttonName,            inline: true },
      { name: 'Status',     value: 'Open',                inline: true },
      ...responses,
    )
    .setThumbnail(avatarURL)
    .setFooter({ text: `Ticket #${pad(ticketNumber)}` })
    .setTimestamp();

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close|${channel.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_claim|${channel.id}`)
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Secondary),
  );

  const roleMentions = supportRoles.map(r => `<@&${r}>`).join(' ');
  const headerMsg = await channel.send({
    content: `${interaction.user}${roleMentions ? ' ' + roleMentions : ''}`,
    embeds: [headerEmbed],
    components: [controls],
  });

  setTicketHeaderMsg(channel.id, headerMsg.id);

  await interaction.editReply({
    embeds: [ok('Ticket Created', `Your ticket has been opened: <#${channel.id}>`)],
  });
}

// ── Close ticket ──────────────────────────────────────────────────────────────

export async function handleTicketClose(interaction, channelOverride) {
  const channelId = channelOverride ?? interaction.customId?.split('|')[1] ?? interaction.channel.id;
  const ticket = getTicketByChannel(channelId);

  if (!ticket || ticket.status === 'closed') {
    return interaction.reply({ embeds: [err('Not a Ticket', 'This channel is not an active ticket.')], ephemeral: true });
  }

  const button       = ticket.buttonName ? getButton(ticket.guildId, ticket.buttonName) : null;
  const supportRoles = button?.supportRoles ?? [];

  const canClose =
    interaction.user.id === ticket.userId ||
    isAdmin(interaction.member) ||
    isSupportRole(interaction.member, supportRoles);

  if (!canClose) {
    return interaction.reply({ embeds: [err('Permission Denied', 'Only the ticket owner or support staff can close this ticket.')], ephemeral: true });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Ticket Closed')
        .setDescription(`This ticket was closed by ${interaction.user}.\nThe channel will be deleted in **5 seconds**.`)
        .setTimestamp(),
    ],
  });

  // Cancel any active alert timer
  if (alertTimers.has(channelId)) {
    clearTimeout(alertTimers.get(channelId).timeout);
    alertTimers.delete(channelId);
  }

  // Credit all staff who participated
  const msgs = getTicketMsgs(ticket.id);
  const staffMsgs = {};
  for (const [userId, count] of Object.entries(msgs)) {
    if (userId !== ticket.userId) staffMsgs[userId] = count;
  }
  const handledBy = ticket.claimedBy ??
    (Object.entries(staffMsgs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);

  if (Object.keys(staffMsgs).length) {
    creditAllStaff(ticket.guildId, staffMsgs, handledBy);
  }

  // Send transcript before deleting
  await sendTranscript(interaction, ticket, interaction.channel);

  closeTicket(channelId);

  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

// ── Claim ticket ──────────────────────────────────────────────────────────────

export async function handleTicketClaim(interaction) {
  const channelId = interaction.customId.split('|')[1];
  const ticket    = getTicketByChannel(channelId);

  if (!ticket || ticket.status === 'closed') {
    return interaction.reply({ embeds: [err('Error', 'Ticket not found or already closed.')], ephemeral: true });
  }

  if (ticket.claimedBy) {
    return interaction.reply({
      embeds: [warn('Already Claimed', `This ticket was already claimed by <@${ticket.claimedBy}>.`)],
      ephemeral: true,
    });
  }

  const button       = ticket.buttonName ? getButton(ticket.guildId, ticket.buttonName) : null;
  const supportRoles = button?.supportRoles ?? [];

  if (!isAdmin(interaction.member) && !isSupportRole(interaction.member, supportRoles)) {
    return interaction.reply({ embeds: [err('Permission Denied', 'Only support staff can claim tickets.')], ephemeral: true });
  }

  claimTicket(channelId, interaction.user.id);

  // Edit the header embed to reflect claimed status
  if (ticket.headerMsgId) {
    try {
      const headerMsg = await interaction.channel.messages.fetch(ticket.headerMsgId);
      const oldEmbed  = headerMsg.embeds[0];
      if (oldEmbed) {
        const updated = EmbedBuilder.from(oldEmbed)
          .setColor(0x57F287)
          .spliceFields(
            oldEmbed.fields.findIndex(f => f.name === 'Status'),
            1,
            { name: 'Status', value: `Claimed by ${interaction.user}`, inline: true }
          );
        await headerMsg.edit({ embeds: [updated] });
      }
    } catch {}
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Ticket Claimed')
        .setDescription(`${interaction.user} has claimed this ticket and will handle your request.`)
        .setTimestamp(),
    ],
  });
}

// ── Alert / auto-close ────────────────────────────────────────────────────────

export async function handleTicketAlert(interaction) {
  const channelId = interaction.channel.id;
  const ticket    = getTicketByChannel(channelId);

  if (!ticket || ticket.status === 'closed') {
    return interaction.reply({ embeds: [err('Not a Ticket', 'This command can only be used inside an active ticket channel.')], ephemeral: true });
  }

  const button       = ticket.buttonName ? getButton(ticket.guildId, ticket.buttonName) : null;
  const supportRoles = button?.supportRoles ?? [];

  if (!isAdmin(interaction.member) && !isSupportRole(interaction.member, supportRoles)) {
    return interaction.reply({ embeds: [err('Permission Denied', 'Only support staff can activate the auto-close timer.')], ephemeral: true });
  }

  if (alertTimers.has(channelId)) {
    return interaction.reply({
      embeds: [warn('Timer Already Active', 'An auto-close timer is already running for this ticket.')],
      ephemeral: true,
    });
  }

  const closeAt    = Date.now() + 24 * 60 * 60 * 1000;
  const closeAtSec = Math.floor(closeAt / 1000);

  const alertEmbed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle('Inactivity Notice')
    .setDescription(
      `<@${ticket.userId}>, this ticket will be **automatically closed** if you do not respond.\n\n` +
      `Closes: <t:${closeAtSec}:R> (<t:${closeAtSec}:f>)\n\n` +
      `Reply in this channel to cancel the timer.`
    )
    .setFooter({ text: 'Timer cancels automatically when you send a message' })
    .setTimestamp();

  await interaction.reply({ embeds: [alertEmbed] });
  const alertMsg = await interaction.fetchReply();

  const timeout = setTimeout(async () => {
    const t = getTicketByChannel(channelId);
    if (!t || t.status !== 'open') return;

    // Auto-close: DM the user
    try {
      const guild  = interaction.guild;
      const member = await guild.members.fetch(ticket.userId).catch(() => null);
      if (member) {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Your Ticket Was Automatically Closed')
              .setDescription(
                `Your ticket **#${pad(t.number ?? '0')} — ${t.buttonName}** in **${guild.name}** was automatically closed due to inactivity.\n\n` +
                `If you still need assistance, please open a new ticket.`
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    } catch {}

    // Credit staff
    const msgs = getTicketMsgs(t.id);
    const staffMsgs = {};
    for (const [uid, count] of Object.entries(msgs)) {
      if (uid !== t.userId) staffMsgs[uid] = count;
    }
    const handledBy = t.claimedBy ??
      (Object.entries(staffMsgs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    if (Object.keys(staffMsgs).length) creditAllStaff(t.guildId, staffMsgs, handledBy);

    const ch = interaction.guild.channels.cache.get(channelId);
    if (ch) {
      await sendTranscriptDirect(interaction.guild, t, ch);
      await ch.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Ticket Auto-Closed')
            .setDescription('This ticket was automatically closed due to inactivity. The channel will be deleted in 5 seconds.')
            .setTimestamp(),
        ],
      }).catch(() => {});
      setTimeout(() => ch.delete().catch(() => {}), 5000);
    }

    closeTicket(channelId);
    alertTimers.delete(channelId);
  }, 24 * 60 * 60 * 1000);

  alertTimers.set(channelId, { timeout, alertMsgId: alertMsg.id, staffId: interaction.user.id });
}

// Called from messageCreate when the ticket owner sends a message
export async function cancelAlertIfOwner(message, ticket) {
  const channelId = message.channel.id;
  if (!alertTimers.has(channelId)) return;

  const { timeout, alertMsgId } = alertTimers.get(channelId);
  clearTimeout(timeout);
  alertTimers.delete(channelId);

  // Update the alert embed to show it was cancelled
  try {
    const alertMsg = await message.channel.messages.fetch(alertMsgId);
    await alertMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('Auto-Close Cancelled')
          .setDescription(`<@${ticket.userId}> responded — the auto-close timer has been cancelled.`)
          .setTimestamp(),
      ],
    });
  } catch {}
}

// ── Transcript ────────────────────────────────────────────────────────────────

async function sendTranscript(interaction, ticket, channel) {
  await sendTranscriptDirect(interaction.guild, ticket, channel);
}

export async function sendTranscriptDirect(guild, ticket, channel) {
  const transcriptChannelId = getTranscriptChannel(ticket.guildId);
  if (!transcriptChannelId) return;

  const transcriptChannel = await guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (!transcriptChannel) return;

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted   = [...messages.values()].reverse();
    const lines    = sorted
      .filter(m => !m.author.bot || m.embeds.length === 0)
      .map(m => {
        const ts      = `<t:${Math.floor(m.createdTimestamp / 1000)}:t>`;
        const content = m.content || (m.embeds.length ? '[embed]' : '[attachment]');
        return `**${m.author.tag}** ${ts}\n${content}`;
      });

    const openedBy = await guild.members.fetch(ticket.userId).catch(() => null);
    const avatarURL = openedBy?.user.displayAvatarURL({ size: 128, extension: 'png' }) ?? null;

    const headerEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Transcript — Ticket #${pad(ticket.number ?? '0')} (${ticket.buttonName})`)
      .addFields(
        { name: 'Opened By',  value: `<@${ticket.userId}>`, inline: true },
        { name: 'Category',   value: ticket.buttonName,     inline: true },
        { name: 'Claimed By', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed', inline: true },
        { name: 'Total Messages', value: String(lines.length), inline: true },
      )
      .setTimestamp();

    if (avatarURL) headerEmbed.setThumbnail(avatarURL);

    await transcriptChannel.send({ embeds: [headerEmbed] });

    // Split transcript into chunks that fit within embed limits
    const chunks = [];
    let current  = '';
    for (const line of lines) {
      if ((current + '\n\n' + line).length > 3900) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? current + '\n\n' + line : line;
      }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      await transcriptChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setDescription(chunks[i])
            .setFooter({ text: `Part ${i + 1} of ${chunks.length}` }),
        ],
      });
    }
  } catch (e) {
    console.error('[TRANSCRIPT] Failed to send transcript:', e);
  }
}

// ── Track all messages in tickets ─────────────────────────────────────────────

export async function handleTicketMessage(message) {
  const ticket = getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;

  // Always record messages for all participants
  recordMessage(ticket.id, message.author.id);

  // If ticket owner responds, cancel any active alert timer
  if (message.author.id === ticket.userId) {
    await cancelAlertIfOwner(message, ticket);
  }
}

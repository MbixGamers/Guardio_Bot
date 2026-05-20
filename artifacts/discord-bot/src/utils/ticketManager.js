import {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder
} from 'discord.js';
import {
  getButton, getQuestionnaire, getOpenTicket, createTicket, closeTicket, claimTicket,
  recordMessage, getTicketMsgs, getTicketByChannel, creditAllStaff, isBlacklisted,
  getNextTicketNumber, setTicketHeaderMsg, getTranscriptChannel, incrementStaffMessages,
  touchStaffEntry
} from '../store.js';
import { ok, err, info, warn } from './embeds.js';
import { isAdmin, isSupportRole } from './permissions.js';

// In-memory alert timers: channelId -> { timeout, alertMsgId, staffId }
export const alertTimers = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
}

export function pad(n, digits = 4) {
  return String(n).padStart(digits, '0');
}

function controlRow(channelId, claimed = false, claimedBy = null) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close|${channelId}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    claimed
      ? new ButtonBuilder()
          .setCustomId(`ticket_claim|${channelId}`)
          .setLabel(claimedBy ? `Claimed by ${claimedBy}` : 'Claimed')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
          .setDisabled(true)
      : new ButtonBuilder()
          .setCustomId(`ticket_claim|${channelId}`)
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋'),
  );
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

  const existing = getOpenTicket(g, interaction.user.id);
  if (existing) {
    const ch = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
    if (ch) {
      const r = {
        embeds: [
          new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('You Already Have an Open Ticket')
            .setDescription(
              `You can only have **one open ticket** at a time.\n\n` +
              `Your current ticket: <#${existing.channelId}>\n\n` +
              `Please resolve your existing ticket before opening a new one.`
            )
            .setTimestamp(),
        ],
        ephemeral: true,
      };
      return interaction.replied || interaction.deferred ? interaction.editReply(r) : interaction.reply(r);
    }
    closeTicket(existing.channelId);
  }

  const replyFn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
  await interaction[replyFn]({
    embeds: [info('Creating Your Ticket', 'Please wait while your ticket channel is being set up...')],
    ephemeral: true,
  });

  const button      = getButton(g, buttonName);
  const supportRoles = Array.isArray(button.supportRoles) ? button.supportRoles : [];
  const ticketNumber = getNextTicketNumber(g);
  const channelName  = `${slugify(buttonName)}-${slugify(interaction.user.username)}-${pad(ticketNumber)}`;

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

  const ticket    = createTicket(channel.id, g, interaction.user.id, buttonName, ticketNumber);
  const avatarURL = interaction.user.displayAvatarURL({ size: 256, extension: 'png' });

  const headerEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: interaction.user.tag, iconURL: avatarURL })
    .setTitle(`Ticket #${pad(ticketNumber)} — ${buttonName}`)
    .setDescription(
      `Welcome, ${interaction.user}! A member of our support team will be with you shortly.` +
      (button.description ? `\n\n${button.description}` : '')
    )
    .addFields(
      { name: 'Opened By', value: `${interaction.user}`, inline: true },
      { name: 'Category',  value: buttonName,            inline: true },
      { name: 'Status',    value: 'Open',                inline: true },
      ...responses,
    )
    .setThumbnail(avatarURL)
    .setFooter({ text: `Ticket #${pad(ticketNumber)}` })
    .setTimestamp();

  const roleMentions = supportRoles.map(r => `<@&${r}>`).join(' ');
  const headerMsg = await channel.send({
    content: `${interaction.user}${roleMentions ? ' ' + roleMentions : ''}`,
    embeds: [headerEmbed],
    components: [controlRow(channel.id)],
  });

  setTicketHeaderMsg(channel.id, headerMsg.id);

  await interaction.editReply({
    embeds: [ok('Ticket Created', `Your ticket has been opened: <#${channel.id}>`)],
  });
}

// ── Close ticket ──────────────────────────────────────────────────────────────

export async function handleTicketClose(interaction, channelOverride) {
  const channelId = channelOverride ?? interaction.customId?.split('|')[1] ?? interaction.channel.id;
  const ticket    = getTicketByChannel(channelId);

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
  // Always credit the closer if they are not the ticket owner (even with 0 messages)
  if (interaction.user.id !== ticket.userId && !staffMsgs[interaction.user.id]) {
    staffMsgs[interaction.user.id] = 0;
  }
  // Always credit the claimer (even if they opened the ticket themselves)
  if (ticket.claimedBy && !staffMsgs[ticket.claimedBy]) {
    staffMsgs[ticket.claimedBy] = 0;
  }
  const handledBy = ticket.claimedBy ??
    (Object.entries(staffMsgs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  if (Object.keys(staffMsgs).length) creditAllStaff(ticket.guildId, staffMsgs, handledBy);

  // Mark ticket closed BEFORE any async operations so it can never be double-credited
  closeTicket(channelId);

  // Send transcript — failure is non-fatal
  const transcriptUrl = await sendTranscriptDirect(interaction.guild, ticket, interaction.channel).catch(e => {
    console.error('[CLOSE] transcript error:', e);
    return null;
  });

  const closeEmbed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Ticket Closed')
    .setDescription(
      `This ticket was closed by ${interaction.user}.\n` +
      `The channel will be deleted in **5 seconds**.` +
      (transcriptUrl ? `\n\nA transcript has been saved.` : '')
    )
    .setTimestamp();

  const components = transcriptUrl
    ? [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl).setEmoji('📄')
      )]
    : [];

  await interaction.reply({ embeds: [closeEmbed], components });

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
  // Register claimer immediately so they appear in /mod checks right away
  touchStaffEntry(ticket.guildId, interaction.user.id);

  // Edit header embed + update buttons to show claimed state
  if (ticket.headerMsgId) {
    try {
      const headerMsg = await interaction.channel.messages.fetch(ticket.headerMsgId);
      const oldEmbed  = headerMsg.embeds[0];
      if (oldEmbed) {
        const statusIdx = oldEmbed.fields.findIndex(f => f.name === 'Status');
        const updated   = EmbedBuilder.from(oldEmbed)
          .setColor(0x57F287)
          .spliceFields(
            statusIdx >= 0 ? statusIdx : oldEmbed.fields.length,
            statusIdx >= 0 ? 1 : 0,
            { name: 'Status', value: `Claimed by ${interaction.user}`, inline: true }
          );
        await headerMsg.edit({
          embeds: [updated],
          components: [controlRow(channelId, true, interaction.user.username)],
        });
      }
    } catch (e) {
      console.error('[CLAIM] Failed to update header embed:', e);
    }
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Ticket Claimed')
        .setDescription(`${interaction.user} has claimed this ticket and will be handling your request.`)
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

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Inactivity Notice')
        .setDescription(
          `<@${ticket.userId}>, this ticket will be **automatically closed** if you do not respond.\n\n` +
          `Closes: <t:${closeAtSec}:R> (<t:${closeAtSec}:f>)\n\n` +
          `Reply in this channel to cancel the timer.`
        )
        .setFooter({ text: 'Timer cancels automatically when you send a message' })
        .setTimestamp(),
    ],
  });
  const alertMsg = await interaction.fetchReply();

  const timeout = setTimeout(async () => {
    const t = getTicketByChannel(channelId);
    if (!t || t.status !== 'open') return;

    try {
      const member = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
      if (member) {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Your Ticket Was Automatically Closed')
              .setDescription(
                `Your ticket **#${pad(t.number ?? '0')} — ${t.buttonName}** in **${interaction.guild.name}** ` +
                `was automatically closed due to inactivity.\n\nIf you still need assistance, please open a new ticket.`
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    } catch {}

    const cMsgs = getTicketMsgs(t.id);
    const sMsgs = {};
    for (const [uid, count] of Object.entries(cMsgs)) {
      if (uid !== t.userId) sMsgs[uid] = count;
    }
    // Credit the staff member who set the alert (they initiated close) if not already credited
    const alertStaffId = alertTimers.get(channelId)?.staffId;
    if (alertStaffId && alertStaffId !== t.userId && !sMsgs[alertStaffId]) {
      sMsgs[alertStaffId] = 0;
    }
    // Always credit the claimer (even if they opened the ticket themselves)
    if (t.claimedBy && !sMsgs[t.claimedBy]) {
      sMsgs[t.claimedBy] = 0;
    }
    const handledBy = t.claimedBy ?? (Object.entries(sMsgs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    if (Object.keys(sMsgs).length) creditAllStaff(t.guildId, sMsgs, handledBy);

    // Mark closed BEFORE async operations — prevents double-credit on retry
    closeTicket(channelId);
    alertTimers.delete(channelId);

    const ch = interaction.guild.channels.cache.get(channelId);
    if (ch) {
      await sendTranscriptDirect(interaction.guild, t, ch).catch(e => console.error('[ALERT-CLOSE] transcript error:', e));
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
  }, 24 * 60 * 60 * 1000);

  alertTimers.set(channelId, { timeout, alertMsgId: alertMsg.id, staffId: interaction.user.id });
}

export async function cancelAlertIfOwner(message, ticket) {
  const channelId = message.channel.id;
  if (!alertTimers.has(channelId)) return;

  const { timeout, alertMsgId } = alertTimers.get(channelId);
  clearTimeout(timeout);
  alertTimers.delete(channelId);

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

// Returns the URL of the posted transcript message (or null)
export async function sendTranscriptDirect(guild, ticket, channel) {
  const transcriptChannelId = getTranscriptChannel(ticket.guildId);
  if (!transcriptChannelId) return null;

  const transcriptChannel = await guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (!transcriptChannel) return null;

  try {
    const fetched  = await channel.messages.fetch({ limit: 100 });
    const messages = [...fetched.values()].reverse();

    const openedAt = new Date(ticket.openedAt ?? Date.now());
    const now      = new Date();

    // Build a readable plain-text transcript
    const divider  = '═'.repeat(60);
    const lines    = [
      divider,
      `  TICKET TRANSCRIPT`,
      `  Ticket #${pad(ticket.number ?? '0')} — ${ticket.buttonName}`,
      divider,
      `  Opened By  : ${ticket.userId}`,
      `  Category   : ${ticket.buttonName}`,
      `  Claimed By : ${ticket.claimedBy ?? 'Unclaimed'}`,
      `  Closed At  : ${now.toUTCString()}`,
      divider,
      '',
    ];

    for (const m of messages) {
      if (m.author.bot && m.content === '' && m.embeds.length > 0) continue;
      const ts      = new Date(m.createdTimestamp).toUTCString();
      const content = m.content || (m.embeds.length ? '[embed]' : m.attachments.size ? '[attachment]' : '[no content]');
      lines.push(`[${ts}]  ${m.author.tag}`);
      lines.push(`  ${content}`);
      lines.push('');
    }

    lines.push(divider);
    lines.push(`  End of Transcript — ${messages.length} message(s)`);
    lines.push(divider);

    const txtBuffer   = Buffer.from(lines.join('\n'), 'utf8');
    const attachment  = new AttachmentBuilder(txtBuffer, {
      name: `transcript-${ticket.buttonName.toLowerCase().replace(/\s+/g, '-')}-${pad(ticket.number ?? '0')}.txt`,
    });

    const openedMember = await guild.members.fetch(ticket.userId).catch(() => null);
    const avatarURL    = openedMember?.user.displayAvatarURL({ size: 128, extension: 'png' }) ?? null;

    const headerEmbed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`Transcript — Ticket #${pad(ticket.number ?? '0')} (${ticket.buttonName})`)
      .addFields(
        { name: 'Opened By',      value: `<@${ticket.userId}>`,                                   inline: true },
        { name: 'Category',       value: ticket.buttonName,                                        inline: true },
        { name: 'Claimed By',     value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed', inline: true },
        { name: 'Total Messages', value: String(messages.length),                                  inline: true },
        { name: 'Closed At',      value: `<t:${Math.floor(Date.now() / 1000)}:f>`,                inline: true },
      )
      .setThumbnail(avatarURL)
      .setTimestamp();

    const transcriptMsg = await transcriptChannel.send({ embeds: [headerEmbed], files: [attachment] });
    return transcriptMsg.url;
  } catch (e) {
    console.error('[TRANSCRIPT] Failed to send transcript:', e);
    return null;
  }
}

// ── Track all messages in tickets ─────────────────────────────────────────────

export async function handleTicketMessage(message) {
  const ticket = getTicketByChannel(message.channel.id);
  if (!ticket || ticket.status !== 'open') return;

  // Record message for all participants (used for credit on close)
  recordMessage(ticket.id, message.author.id);

  // Live-update staff message counter immediately (not just on close)
  // Also count messages from the ticket owner if they are the claimer (admin/staff testing)
  const isStaffMessage = message.author.id !== ticket.userId || message.author.id === ticket.claimedBy;
  if (isStaffMessage) {
    incrementStaffMessages(ticket.guildId, message.author.id);
  }

  // If ticket owner responds, cancel any active alert timer
  if (message.author.id === ticket.userId) {
    await cancelAlertIfOwner(message, ticket);
  }
}

import { EmbedBuilder } from 'discord.js';
import { getOpenTicket, closeTicket, getTicketMsgs, creditAllStaff } from '../store.js';
import { sendTranscriptDirect, alertTimers } from '../utils/ticketManager.js';

export default {
  name: 'guildMemberRemove',
  async execute(member) {
    const ticket = getOpenTicket(member.guild.id, member.id);
    if (!ticket) return;

    const channel = await member.guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      // Channel gone already — just mark closed
      closeTicket(ticket.channelId);
      return;
    }

    // Cancel any active alert timer for this ticket
    if (alertTimers.has(ticket.channelId)) {
      clearTimeout(alertTimers.get(ticket.channelId).timeout);
      alertTimers.delete(ticket.channelId);
    }

    // Credit all staff who participated (exclude the ticket owner)
    const msgs = getTicketMsgs(ticket.id);
    const staffMsgs = {};
    for (const [userId, count] of Object.entries(msgs)) {
      if (userId !== ticket.userId) staffMsgs[userId] = count;
    }
    if (ticket.claimedBy && !staffMsgs[ticket.claimedBy]) {
      staffMsgs[ticket.claimedBy] = 0;
    }
    const handledBy = ticket.claimedBy ??
      (Object.entries(staffMsgs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    if (Object.keys(staffMsgs).length) creditAllStaff(ticket.guildId, staffMsgs, handledBy);

    // Mark closed before any async ops so it can't be double-processed
    closeTicket(ticket.channelId);

    // Notify the channel
    const notifyEmbed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('User Left the Server')
      .setDescription(
        `**${member.user.tag}** has left the server.\nThis ticket will be deleted in **5 seconds**.\n\nA transcript will be saved if configured.`
      )
      .setTimestamp();

    await channel.send({ embeds: [notifyEmbed] }).catch(() => {});

    // Save transcript — non-fatal
    await sendTranscriptDirect(member.guild, ticket, channel).catch(e => {
      console.error('[MEMBER_LEAVE] transcript error:', e);
    });

    // Delete after 5 seconds
    setTimeout(() => channel.delete().catch(() => {}), 5000);
  },
};

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { handleTicketButton, handleTicketModal, handleTicketClose, handleTicketClaim } from '../utils/ticketManager.js';
import { getButton, addButton, setQuestionnaire, getLoaRequest, updateLoaRequest, getLoaRole, getAllSupportRoles } from '../store.js';
import { getPendingButton, clearPendingButton } from '../commands/ticket/addbutton.js';
import { ok, err } from '../utils/embeds.js';

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      try { await cmd.execute(interaction, client); }
      catch (e) {
        console.error(`[ERR] /${interaction.commandName}:`, e);
        const payload = { embeds: [err('Error', 'Something went wrong. Please try again.')], ephemeral: true };
        interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
      }
      return;
    }

    // ── Buttons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      const [type, ...rest] = interaction.customId.split('|');

      if (type === 'ticket_open')  return handleTicketButton(interaction);
      if (type === 'ticket_close') return handleTicketClose(interaction);
      if (type === 'ticket_claim') return handleTicketClaim(interaction);

      // LOA approve / deny
      if (type === 'loa_approve' || type === 'loa_deny') {
        return handleLoaDecision(interaction, type, rest[0], rest[1]);
      }

      return;
    }

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const [type] = interaction.customId.split('|');

      if (type === 'ticket_modal') return handleTicketModal(interaction);

      if (interaction.customId === 'panel_create_modal') {
        const cmd = client.commands.get('create');
        return cmd?.handleModal?.(interaction);
      }

      // LOA apply modal
      if (interaction.customId === 'loa_apply_modal') {
        const cmd = client.commands.get('loa');
        return cmd?.handleModal?.(interaction);
      }

      // /add button modal — customId: add_button_modal|<pendingKey>
      if (type === 'add_button_modal') {
        const key     = interaction.customId.split('|')[1];
        const pending = getPendingButton(key);

        if (!pending) {
          return interaction.reply({
            embeds: [err('Expired', 'This form has expired. Please run `/add button` again.')],
            ephemeral: true,
          });
        }

        clearPendingButton(key);

        const { panelId, categoryId, supportRoles } = pending;
        const name  = interaction.fields.getTextInputValue('name').trim();
        const emoji = interaction.fields.getTextInputValue('emoji').trim() || null;
        const desc  = interaction.fields.getTextInputValue('desc').trim() || null;

        const existing = getButton(interaction.guild.id, name);
        if (existing) {
          return interaction.reply({
            embeds: [err('Duplicate', `A button named **${name}** already exists.`)],
            ephemeral: true,
          });
        }

        addButton(interaction.guild.id, Number(panelId), name, emoji, desc, categoryId, supportRoles);

        return interaction.reply({
          embeds: [ok(
            'Button Added',
            `Button **${emoji ? emoji + ' ' : ''}${name}** has been added.\n` +
            (supportRoles.length ? `Support roles: ${supportRoles.map(r => `<@&${r}>`).join(', ')}\n` : '') +
            `Use \`/config ticket\` to add a questionnaire, or \`/send panel\` to deploy the panel.`
          )],
          ephemeral: true,
        });
      }

      // /config questionnaire modal — customId: config_q|buttonId
      if (type === 'config_q') {
        const buttonId = Number(interaction.customId.split('|')[1]);
        const fields   = [];
        for (let i = 1; i <= 5; i++) {
          const label = interaction.fields.getTextInputValue(`f${i}`).trim();
          if (label) fields.push({ id: `field_${i}`, label, required: true });
        }
        setQuestionnaire(interaction.guild.id, buttonId, fields);
        return interaction.reply({
          embeds: [ok('Questionnaire Set', fields.length
            ? `**${fields.length}** field(s) configured:\n${fields.map(f => `• ${f.label}`).join('\n')}`
            : 'Questionnaire cleared — the ticket will open immediately on button click.')],
          ephemeral: true,
        });
      }

      return;
    }

    // ── Select menus ──────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const [type] = interaction.customId.split('|');

      if (type === 'delete_panel_select' || interaction.customId === 'delete_panel_select') {
        const cmd = client.commands.get('delete');
        return cmd?.handleSelect?.(interaction);
      }
      if (type === 'send_panel_select') {
        const cmd = client.commands.get('send');
        return cmd?.handleSelect?.(interaction);
      }
      if (interaction.customId === 'config_panel_select') {
        const cmd = client.commands.get('config');
        return cmd?.handlePanelSelect?.(interaction);
      }
      if (type === 'config_btn_select') {
        const cmd = client.commands.get('config');
        return cmd?.handleButtonSelect?.(interaction);
      }
    }
  },
};

// ── LOA approve / deny handler ────────────────────────────────────────────────

async function handleLoaDecision(interaction, type, guildId, requestId) {
  if (!interaction.member.permissions.has(0x8n)) { // Administrator
    return interaction.reply({ embeds: [err('Permission Denied', 'Only administrators can approve or deny LOA requests.')], ephemeral: true });
  }

  const request = getLoaRequest(guildId, requestId);
  if (!request) {
    return interaction.reply({ embeds: [err('Not Found', 'This LOA request could not be found.')], ephemeral: true });
  }

  if (request.status !== 'pending') {
    return interaction.reply({
      embeds: [err('Already Decided', `This request was already **${request.status}**.`)],
      ephemeral: true,
    });
  }

  const approved = type === 'loa_approve';
  updateLoaRequest(guildId, requestId, approved ? 'approved' : 'denied');

  // Update the original request embed
  const oldEmbed = interaction.message.embeds[0];
  if (oldEmbed) {
    const statusIdx = oldEmbed.fields.findIndex(f => f.name === 'Status');
    const updated   = EmbedBuilder.from(oldEmbed)
      .setColor(approved ? 0x57F287 : 0xED4245)
      .spliceFields(
        statusIdx >= 0 ? statusIdx : oldEmbed.fields.length,
        statusIdx >= 0 ? 1 : 0,
        { name: 'Status', value: approved ? `Approved by ${interaction.user}` : `Denied by ${interaction.user}`, inline: true }
      );

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`loa_approve|${guildId}|${requestId}`)
        .setLabel('Approve').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`loa_deny|${guildId}|${requestId}`)
        .setLabel('Deny').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true),
    );

    await interaction.message.edit({ embeds: [updated], components: [disabledRow] }).catch(() => {});
  }

  // If approved: assign LOA role + remove all ticket support roles
  if (approved) {
    try {
      const member  = await interaction.guild.members.fetch(request.userId).catch(() => null);
      const loaRole = getLoaRole(guildId);

      if (member) {
        const supportRoles = getAllSupportRoles(guildId);

        // Remove all support roles the user currently has
        const rolesToRemove = supportRoles.filter(r => member.roles.cache.has(r));
        if (rolesToRemove.length) {
          await member.roles.remove(rolesToRemove, 'LOA approved — support roles removed').catch(() => {});
        }

        // Assign the LOA role
        if (loaRole) {
          await member.roles.add(loaRole, 'LOA approved').catch(() => {});
        }

        // DM the user
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('Leave of Absence Approved')
              .setDescription(
                `Your LOA request in **${interaction.guild.name}** has been **approved** by ${interaction.user}.\n\n` +
                (loaRole ? `You have been assigned the <@&${loaRole}> role.\n` : '') +
                (rolesToRemove.length ? `Your ticket support roles have been temporarily removed.\n` : '') +
                `\nEnjoy your time off. Welcome back when you return!`
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[LOA] Failed to apply role changes:', e);
    }
  } else {
    // Denied: DM the user
    try {
      const member = await interaction.guild.members.fetch(request.userId).catch(() => null);
      if (member) {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle('Leave of Absence Denied')
              .setDescription(
                `Your LOA request in **${interaction.guild.name}** has been **denied** by ${interaction.user}.\n\n` +
                `If you have questions, please reach out to an administrator.`
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }
    } catch {}
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(approved ? 0x57F287 : 0xED4245)
        .setTitle(approved ? 'LOA Approved' : 'LOA Denied')
        .setDescription(
          approved
            ? `<@${request.userId}>'s LOA has been approved. Their support roles have been removed and the LOA role has been assigned.`
            : `<@${request.userId}>'s LOA request has been denied. They have been notified via DM.`
        )
        .setTimestamp(),
    ],
    ephemeral: true,
  });
}

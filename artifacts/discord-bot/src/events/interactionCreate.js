import { handleTicketButton, handleTicketModal, handleTicketClose, handleTicketClaim } from '../utils/ticketManager.js';
import { getButton, getButtons, addButton, setQuestionnaire } from '../store.js';
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
      const [type] = interaction.customId.split('|');
      if (type === 'ticket_open')  return handleTicketButton(interaction);
      if (type === 'ticket_close') return handleTicketClose(interaction);
      if (type === 'ticket_claim') return handleTicketClaim(interaction);
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

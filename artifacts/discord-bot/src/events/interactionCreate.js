import { handleTicketButton, handleTicketModalSubmit, handleTicketClose, handleTicketClaim } from '../utils/ticketManager.js';
import { errorEmbed } from '../utils/embeds.js';
import { getDb } from '../db/database.js';
import { successEmbed } from '../utils/embeds.js';

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[CMD ERROR] ${interaction.commandName}:`, err);
        const embed = errorEmbed('Error', 'An error occurred while executing this command.');
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    // ── Buttons ───────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket_open_')) {
        return handleTicketButton(interaction, client);
      }
      if (interaction.customId.startsWith('ticket_close_')) {
        return handleTicketClose(interaction, client);
      }
      if (interaction.customId.startsWith('ticket_claim_')) {
        return handleTicketClaim(interaction, client);
      }
      return;
    }

    // ── Modals ────────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      // Ticket creation questionnaire modal
      if (interaction.customId.startsWith('ticket_modal_')) {
        return handleTicketModalSubmit(interaction, client);
      }

      // Panel create modal
      if (interaction.customId === 'panel_create_modal') {
        const command = client.commands.get('create');
        if (command?.handleModal) return command.handleModal(interaction, client);
        return;
      }

      // Add button modal
      if (interaction.customId.startsWith('add_button_modal_')) {
        return handleAddButtonModal(interaction);
      }

      // Config questionnaire modal
      if (interaction.customId.startsWith('config_questionnaire_')) {
        return handleConfigQuestionnaireModal(interaction);
      }
      return;
    }

    // ── Select menus ──────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('delete_panel_select_')) {
        const command = client.commands.get('delete');
        if (command?.handleSelect) return command.handleSelect(interaction, client);
        return;
      }
      if (interaction.customId.startsWith('send_panel_select_')) {
        const command = client.commands.get('send');
        if (command?.handleSelect) return command.handleSelect(interaction, client);
        return;
      }
      if (interaction.customId.startsWith('config_panel_select_')) {
        const command = client.commands.get('config');
        if (command?.handleSelect) return command.handleSelect(interaction, client);
        return;
      }
      if (interaction.customId.startsWith('config_button_select_')) {
        const command = client.commands.get('config');
        if (command?.handleButtonSelect) return command.handleButtonSelect(interaction, client);
        return;
      }
    }
  },
};

// Handle /add button modal submission
async function handleAddButtonModal(interaction) {
  // customId: add_button_modal_{panelId}_{categoryId}_{supportRolesJSON}
  const parts = interaction.customId.replace('add_button_modal_', '');
  const firstUnderscore = parts.indexOf('_');
  const secondUnderscore = parts.indexOf('_', firstUnderscore + 1);
  const panelId = parseInt(parts.slice(0, firstUnderscore));
  const rest = parts.slice(firstUnderscore + 1);
  const catUnderscore = rest.indexOf('_');
  const categoryId = rest.slice(0, catUnderscore);
  const supportRolesJSON = rest.slice(catUnderscore + 1);

  let supportRoles = [];
  try { supportRoles = JSON.parse(supportRolesJSON); } catch {}

  const name = interaction.fields.getTextInputValue('btn_name').trim();
  const emoji = interaction.fields.getTextInputValue('btn_emoji').trim() || null;
  const description = interaction.fields.getTextInputValue('btn_description').trim() || null;

  const db = getDb();

  // Check uniqueness
  const existing = db.prepare('SELECT id FROM buttons WHERE guild_id = ? AND name = ?')
    .get(interaction.guild.id, name);
  if (existing) {
    return interaction.reply({
      embeds: [errorEmbed('Duplicate Name', `A button named **${name}** already exists. Choose a different name.`)],
      ephemeral: true,
    });
  }

  db.prepare(
    'INSERT INTO buttons (panel_id, guild_id, name, emoji, description, category_id, support_roles) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(panelId, interaction.guild.id, name, emoji, description, categoryId, JSON.stringify(supportRoles));

  await interaction.reply({
    embeds: [successEmbed(
      'Button Added',
      `Button **${emoji ? emoji + ' ' : ''}${name}** added to the panel.\n` +
      `Tickets will be created under <#${categoryId}>.\n` +
      `Use \`/config ticket\` to add a questionnaire, or \`/send panel\` to deploy.`
    )],
    ephemeral: true,
  });
}

// Handle /config ticket questionnaire modal
async function handleConfigQuestionnaireModal(interaction) {
  const buttonId = parseInt(interaction.customId.replace('config_questionnaire_', ''));
  const db = getDb();

  const fields = [];
  for (let i = 1; i <= 5; i++) {
    const label = interaction.fields.getTextInputValue(`field${i}_label`).trim();
    if (label) {
      fields.push({
        id: `field_${i}`,
        label,
        type: 'text',
        required: true,
        paragraph: false,
      });
    }
  }

  if (fields.length === 0) {
    // Remove questionnaire if all fields blank
    db.prepare('DELETE FROM questionnaires WHERE button_id = ?').run(buttonId);
    return interaction.reply({
      embeds: [successEmbed('Questionnaire Cleared', 'The questionnaire has been removed from this button.')],
      ephemeral: true,
    });
  }

  db.prepare(`
    INSERT INTO questionnaires (button_id, fields) VALUES (?, ?)
    ON CONFLICT(button_id) DO UPDATE SET fields = excluded.fields
  `).run(buttonId, JSON.stringify(fields));

  await interaction.reply({
    embeds: [successEmbed(
      'Questionnaire Configured',
      `**${fields.length}** field(s) added:\n${fields.map(f => `• ${f.label}`).join('\n')}\n\nUsers will see these as a modal when clicking the ticket button.`
    )],
    ephemeral: true,
  });
}

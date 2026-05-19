import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const FILE = join(DATA_DIR, 'store.json');

const defaults = {
  security: {},       // guildId -> { enabled, logChannelId, ... }
  panels: {},         // guildId -> [{ id, number, title, description }]
  buttons: {},        // guildId -> [{ id, panelId, name, emoji, description, categoryId, supportRoles[] }]
  questionnaires: {}, // guildId:buttonId -> [{ id, label, required }]
  tickets: {},        // channelId -> { id, guildId, userId, buttonName, claimedBy, status }
  ticketMsgs: {},     // ticketId -> { userId: count }
  staff: {},          // guildId -> { userId: { credits, handled, messages } }
  blacklist: {},      // guildId -> [userId]
  nukeLog: {},        // guildId -> { userId: [unixSec] }
  _nextId: 1,
};

let store = { ...defaults };

export function initStore() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(FILE)) {
    try {
      store = JSON.parse(readFileSync(FILE, 'utf8'));
    } catch {
      store = { ...defaults };
    }
  }
  setInterval(save, 30_000);
  process.on('exit', save);
  process.on('SIGINT', () => { save(); process.exit(0); });
  process.on('SIGTERM', () => { save(); process.exit(0); });
  console.log('[STORE] Loaded.');
}

export function save() {
  try { writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch {}
}

export function nextId() {
  return store._nextId++;
}

// ── Security ─────────────────────────────────────────────────────────────────

export function getSecurity(guildId) {
  return store.security[guildId] ?? null;
}

export function setSecurity(guildId, patch) {
  store.security[guildId] = { ...(store.security[guildId] ?? {}), ...patch };
  save();
}

// ── Panels ───────────────────────────────────────────────────────────────────

export function getPanels(guildId) {
  return store.panels[guildId] ?? [];
}

export function addPanel(guildId, title, description) {
  const panels = getPanels(guildId);
  const number = panels.length ? Math.max(...panels.map(p => p.number)) + 1 : 1;
  const panel = { id: nextId(), number, title, description };
  store.panels[guildId] = [...panels, panel];
  save();
  return panel;
}

export function deletePanel(guildId, panelId) {
  store.panels[guildId] = getPanels(guildId).filter(p => p.id !== panelId);
  // Also clean up buttons
  store.buttons[guildId] = getButtons(guildId).filter(b => b.panelId !== panelId);
  save();
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export function getButtons(guildId) {
  return store.buttons[guildId] ?? [];
}

export function getPanelButtons(guildId, panelId) {
  return getButtons(guildId).filter(b => b.panelId === panelId);
}

export function getButton(guildId, name) {
  return getButtons(guildId).find(b => b.name === name) ?? null;
}

export function addButton(guildId, panelId, name, emoji, description, categoryId, supportRoles) {
  const btn = { id: nextId(), panelId, name, emoji, description, categoryId, supportRoles };
  store.buttons[guildId] = [...getButtons(guildId), btn];
  save();
  return btn;
}

// ── Questionnaires ───────────────────────────────────────────────────────────

export function getQuestionnaire(guildId, buttonId) {
  return store.questionnaires[`${guildId}:${buttonId}`] ?? [];
}

export function setQuestionnaire(guildId, buttonId, fields) {
  store.questionnaires[`${guildId}:${buttonId}`] = fields;
  save();
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export function getTicketByChannel(channelId) {
  return store.tickets[channelId] ?? null;
}

export function getOpenTicket(guildId, userId, buttonName) {
  return Object.values(store.tickets).find(
    t => t.guildId === guildId && t.userId === userId && t.buttonName === buttonName && t.status === 'open'
  ) ?? null;
}

export function createTicket(channelId, guildId, userId, buttonName) {
  const ticket = { id: String(nextId()), channelId, guildId, userId, buttonName, claimedBy: null, status: 'open' };
  store.tickets[channelId] = ticket;
  store.ticketMsgs[ticket.id] = {};
  save();
  return ticket;
}

export function claimTicket(channelId, userId) {
  if (store.tickets[channelId]) {
    store.tickets[channelId].claimedBy = userId;
    save();
  }
}

export function closeTicket(channelId) {
  if (store.tickets[channelId]) {
    store.tickets[channelId].status = 'closed';
    save();
  }
}

// ── Ticket messages ──────────────────────────────────────────────────────────

export function recordMessage(ticketId, userId) {
  if (!store.ticketMsgs[ticketId]) store.ticketMsgs[ticketId] = {};
  store.ticketMsgs[ticketId][userId] = (store.ticketMsgs[ticketId][userId] ?? 0) + 1;
  save();
}

export function getTicketMsgs(ticketId) {
  return store.ticketMsgs[ticketId] ?? {};
}

// ── Staff activity ───────────────────────────────────────────────────────────

export function getStaff(guildId) {
  return store.staff[guildId] ?? {};
}

export function creditStaff(guildId, userId, msgCount) {
  if (!store.staff[guildId]) store.staff[guildId] = {};
  const s = store.staff[guildId][userId] ?? { credits: 0, handled: 0, messages: 0 };
  store.staff[guildId][userId] = {
    credits: s.credits + 1,
    handled: s.handled + 1,
    messages: s.messages + msgCount,
  };
  save();
}

export function resetStaff(guildId) {
  store.staff[guildId] = {};
  save();
}

// ── Blacklist ────────────────────────────────────────────────────────────────

export function getBlacklist(guildId) {
  return store.blacklist[guildId] ?? [];
}

export function isBlacklisted(guildId, userId) {
  return getBlacklist(guildId).includes(userId);
}

export function blacklistAdd(guildId, userId) {
  const list = getBlacklist(guildId);
  if (!list.includes(userId)) {
    store.blacklist[guildId] = [...list, userId];
    save();
    return true;
  }
  return false;
}

export function blacklistRemove(guildId, userId) {
  const list = getBlacklist(guildId);
  if (list.includes(userId)) {
    store.blacklist[guildId] = list.filter(id => id !== userId);
    save();
    return true;
  }
  return false;
}

// ── Anti-nuke tracking ───────────────────────────────────────────────────────

export function logNukeAction(guildId, userId) {
  if (!store.nukeLog[guildId]) store.nukeLog[guildId] = {};
  const now = Math.floor(Date.now() / 1000);
  store.nukeLog[guildId][userId] = [
    ...(store.nukeLog[guildId][userId] ?? []).filter(t => now - t < 30),
    now,
  ];
  save();
  return store.nukeLog[guildId][userId].length;
}

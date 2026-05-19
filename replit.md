# Void Bot — Discord Bot

A full-featured Discord bot with a security/anti-nuke system and a configurable ticket system with staff activity tracking.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — start the bot
- `node artifacts/discord-bot/src/deploy-commands.js` — (re)deploy slash commands globally to Discord
- Required env secrets: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`

## Stack

- pnpm workspaces, Node.js 24, ESM (`"type": "module"`)
- discord.js v14
- sql.js (pure-JS SQLite, no native compilation needed)
- Database persisted at `artifacts/discord-bot/data/bot.db`, auto-saved every 30s

## Where things live

```
artifacts/discord-bot/
  src/
    index.js               — entry point, bootstraps client
    deploy-commands.js     — register slash commands with Discord API
    commands/
      security/security.js — /security on|off|log
      ticket/create.js     — /create (panel modal)
      ticket/delete.js     — /delete (panel select)
      ticket/addbutton.js  — /add button
      ticket/send.js       — /send panel
      ticket/config.js     — /config ticket (questionnaire)
      mod/modchecks.js     — /mod checks|reset
    events/
      ready.js             — clientReady
      interactionCreate.js — routes all interactions (commands, buttons, modals, selects)
      messageCreate.js     — spam/mention/duplicate detection + ticket message tracking
      guildMemberAdd.js    — new account age detection
      nukeDetection.js     — role/channel create/delete anti-nuke tracking
    handlers/
      commandHandler.js    — loads all commands from commands/ subfolders
      eventHandler.js      — loads default + named exports from events/ files
    db/database.js         — sql.js wrapper with get/all/run helpers
    utils/
      embeds.js            — shared embed builders (success/error/info/warning/ticket)
      permissions.js       — isAdmin/isSupportRole/canManageTicket
      securityMonitor.js   — spamTracker/mentionTracker/duplicateTracker/logSecurityEvent
      ticketManager.js     — full ticket lifecycle (open, modal, close, claim, credit)
  data/bot.db              — SQLite database (auto-created)
```

## Architecture decisions

- **sql.js** used instead of better-sqlite3 to avoid native compilation (no Python/gyp needed in Replit).
- **Named exports** from `nukeDetection.js` let one file register 4 guild events; the event handler loops both `default` and named exports.
- **Staff credit** is determined at ticket close: if the claimer sent 0 messages but another staff member was active, credit goes to the active participant.
- **Slash commands are deployed globally** (not per-guild) via `deploy-commands.js` — changes take up to 1 hour to propagate; use guild-specific deploy during development if needed.
- **DB auto-save** every 30s and on SIGINT/SIGTERM/exit to prevent data loss with the in-memory sql.js store.

## Product

**Security System**
- `/security on` / `/security off` — enable/disable monitoring
- `/security log #channel` — set where alerts go
- Detects: new accounts (< 7 days), message spam, mass mentions, cross-channel duplicate messages
- Anti-nuke: flags rapid role/channel creation or deletion (3+ actions in 10s)

**Ticket System**
- `/create` — create a named panel with title + description (modal)
- `/add button <panel> <category>` — add a button (name, emoji, description) to a panel
- `/config ticket` — attach a questionnaire (up to 5 text fields) to a button
- `/send panel #channel` — deploy a panel embed with buttons to a channel
- `/delete` — remove a panel
- Ticket flow: button click → optional modal questionnaire → private channel created → Close + Claim buttons

**Staff Activity**
- `/mod checks` — leaderboard (credits, tickets handled, messages sent)
- `/mod reset` — admin-only reset
- Credit is assigned to the most active participant, not just the claimer

## User preferences

- No emojis in bot responses (except functional button labels)

## Gotchas

- After modifying any slash command's `data`, re-run `node artifacts/discord-bot/src/deploy-commands.js` — global commands take up to 1 hour to propagate.
- The bot needs **Message Content Intent** enabled in the Discord Developer Portal (Bot → Privileged Gateway Intents).
- The bot needs **Server Members Intent** enabled for new-account detection.
- Support roles for ticket buttons are passed as comma-separated role IDs in `/add button`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

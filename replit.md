# Void Bot — Discord Bot

A full-featured Discord bot with a security/anti-nuke system, a configurable ticket system with staff activity tracking, and a ticket blacklist.

## Run & Operate

- Bot starts automatically via the **Discord Bot** workflow
- To redeploy slash commands: `node artifacts/discord-bot/src/deploy-commands.js`
- Required secrets: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`

## Stack

- Node.js 24, ESM (`"type": "module"`)
- discord.js v14
- JSON file storage — no database, data lives in `artifacts/discord-bot/data/store.json`

## File structure

```
artifacts/discord-bot/
  src/
    index.js              — entry point (loads commands + events, starts bot)
    deploy-commands.js    — register slash commands with Discord API
    store.js              — all data stored as JSON (panels, buttons, tickets, staff, blacklist, security)
    commands/
      security/security.js  — /security on|off|log
      ticket/create.js      — /create
      ticket/delete.js      — /delete
      ticket/addbutton.js   — /add button
      ticket/send.js        — /send panel
      ticket/config.js      — /config ticket
      ticket/blacklist.js   — /blacklist add|remove|list
      mod/modchecks.js      — /mod checks|reset
    events/
      ready.js              — clientReady
      interactionCreate.js  — routes all interactions
      messageCreate.js      — spam/mention/duplicate detection + ticket message tracking
      guildMemberAdd.js     — new account age detection
      nukeDetection.js      — role/channel anti-nuke (4 named exports)
    utils/
      embeds.js             — ok/err/info/warn helpers
      permissions.js        — isAdmin / isSupportRole
      ticketManager.js      — ticket lifecycle (open, close, claim, credit)
      securityMonitor.js    — checkSpam / checkMentions / checkDuplicates / checkNuke
  data/store.json           — persisted data (auto-created, saved every 30s)
```

## Commands

**Security**
- `/security on` / `/security off` — toggle monitoring
- `/security log #channel` — set where alerts go

**Ticket System**
- `/create` — create a named panel (modal)
- `/add button <panel> <category>` — add a ticket button; optionally pass comma-separated support role IDs
- `/config ticket` — attach up to 5 questionnaire fields to a button
- `/send panel #channel` — deploy the panel embed with buttons
- `/delete` — remove a panel

**Blacklist**
- `/blacklist add @user` — prevent user from opening tickets
- `/blacklist remove @user` — allow user to open tickets again
- `/blacklist list` — view all blacklisted users

**Staff**
- `/mod checks` — leaderboard (credits, tickets, messages)
- `/mod reset` — admin-only reset

## User preferences

- No emojis in bot responses (except functional button labels)

## Gotchas

- After changing any slash command's `data`, re-run `deploy-commands.js` — global commands take up to 1 hour to propagate.
- **Message Content Intent** and **Server Members Intent** must be enabled in the Discord Developer Portal.
- Support roles are passed as comma-separated role IDs in `/add button`.

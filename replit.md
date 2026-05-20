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
      ticket/close.js       — /close
      ticket/alert.js       — /alert
      ticket/transcript.js  — /transcript log
      mod/modchecks.js      — /mod checks|reset
    events/
      ready.js              — clientReady
      interactionCreate.js  — routes all interactions
      messageCreate.js      — message tracking + security + alert timer reset
      guildMemberAdd.js     — new account age detection
      nukeDetection.js      — role/channel anti-nuke (4 named exports)
    utils/
      embeds.js             — ok/err/info/warn helpers
      permissions.js        — isAdmin / isSupportRole
      ticketManager.js      — ticket lifecycle (open, close, claim, credit, alert, transcript)
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
- `/close` — close the current ticket (same logic as the Close button)
- `/alert` — start a 24-hour inactivity timer; auto-closes if the ticket owner does not respond; DMes the user on auto-close

**Transcript**
- `/transcript log #channel` — set the channel where ticket transcripts are saved on close

**Blacklist**
- `/blacklist add @user` — prevent user from opening tickets
- `/blacklist remove @user` — allow user to open tickets again
- `/blacklist list` — view all blacklisted users

**Staff**
- `/mod checks` — leaderboard (credits, tickets handled, messages in tickets)
- `/mod reset` — admin-only reset

## Ticket Behaviour

- Each user may only have **one open ticket at a time** (across all categories). Attempting to open another shows a warning with a link to their existing ticket.
- Channel name format: `{category}-{username}-{####}` (e.g. `support-john-0003`)
- Ticket header embed shows the user's profile picture (avatar)
- Claiming a ticket updates the header embed status to show who claimed it
- On close, a full transcript is saved to the configured transcript channel
- `/alert` starts a 24h countdown; if the ticket owner replies the timer cancels automatically; if not, the ticket is closed and the user is DMed
- Staff message counts are now tracked accurately for all participants

## User preferences

- No emojis in bot responses (except functional button labels)

## Gotchas

- After adding new slash commands, re-run `deploy-commands.js` — global commands take up to 1 hour to propagate.
- **Message Content Intent** and **Server Members Intent** must be enabled in the Discord Developer Portal.
- Support roles are passed as comma-separated role IDs in `/add button` — supports unlimited roles.

# Squash Club Bot

Discord bot for cancellation handoffs: notify all registered waiters, confirm one winner, and privately connect the replacement with the prepaid canceled player. No payment collection or verification.

## Run

Requires Node.js 22+ (native WebSocket and fetch). No third-party packages.

1. Set the bot token and Discord IDs in `.env` (never commit it).
2. `node --env-file=.env bot.mjs --register`
3. `node --env-file=.env bot.mjs`
4. As a server manager, invoke `/setup` to post the two panels.
5. Try `/demo` for an isolated fictional walkthrough.

All session content is explicitly marked as test data. The sample fee is 15,000 KRW. No actual booking, collection or payment is performed. Discord identity is used as contact information; no phone number is collected.

## Checks

`node --test`

Test with two or more consenting Discord accounts for actual DM and competing acceptance behavior. The solo demo uses the same participation functions, but the other players and their messages are simulated and labeled.

## Persistence and hosting

### Railway deployment

Connect this repository as a persistent service. The included Dockerfile pins Node 24 and copies only runtime source files. Add the five environment variables listed in `.env.example` using Railway Variables. Never upload `.env`. Attach a persistent volume at `/app/data` BEFORE starting the bot. Use one replica and keep serverless/sleep disabled. No public domain or incoming HTTP port is required for this Gateway bot.

Before the first cloud start, stop the local instance so two processes do not handle the same buttons. Existing Discord command registrations remain valid. A fresh volume starts with an empty test session; run `/setup` once to publish new panels. Previous local registrations are not migrated automatically. Keep the local `data/` folder as a backup. Check deployment logs for `Bot online`, then test `/demo`, restart the deployment, and verify it responds again.

`data/state.json` contains the session, per-user demo progress, panel IDs and pending DM notifications. Run only ONE bot process with this file, on a persistent disk. It is not a multi-instance database. For deployment, configure environment variables and keep the process running continuously; a local development session stops when the computer sleeps or the process exits. Do not submit the local run as permanently hosted.

Pending DMs retry on reconnect, at most three attempts total; `/my-status` shows handoff details even if DMs fail. Once filled, stale offers return a closed response. There is no expiry scheduler in this first version. Sample sessions are for test use only; organizer session editing and an actual booking/payment deadline are not yet implemented.

The bot uses Guilds intent only, slash commands and buttons; it does not read ordinary chat messages. No privileged Message Content or Server Members intents are required.

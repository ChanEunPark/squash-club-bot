# Squash Club Bot

A Discord bot that helps a club fill late cancellations without an organizer contacting every player individually.

## Weekly sessions

Sign up sends a private date picker with the next TWO Wednesday sessions at click time. Sessions run 20:00–22:00 America/New_York, with Monday 15:00 registration cutoffs. The same Wednesday is included until its 20:00 start; afterward the next week is shown. Time conversion follows Eastern daylight saving time. A date whose cutoff passed supports waitlist registration only. Each date has independent capacity, bookings, waitlists, cancellation searches, notification jobs and settlement handoffs. Cancellation pickers include the user’s upcoming registrations. My status is shown privately in the channel, with a card for each upcoming date and a contextual Book / Cancel booking / View status button. Status checks do not send DMs. The prior one-off test session is preserved separately and is never silently moved to a Wednesday.

## Booking rules

- Before the registration cutoff: cancellation removes the booking immediately.
- After cutoff: cancellation starts a replacement search. The original booking and fee responsibility remain until a replacement accepts.
- All registered waitlisted players receive personal offers. The first valid acceptance processed by the bot wins, independent of waitlist order.
- Offers expire 24 hours after the search starts, or at session start, whichever comes first. Late acceptances are rejected even before the background timer runs.
- Successful handoffs privately connect the two players with the amount to settle directly. Previous offers become **충원 완료 / Spot filled**, with disabled buttons.
- Expired searches send the original player a DM explaining that no replacement was found and fee responsibility remains. Offers become **모집 종료 / Search closed**.
- The bot never collects, transfers, or verifies payments.

The public session panel has **Sign up / Cancel registration / My status**. Registration consent, cancellation confirmation and handoff information are delivered by DM; My status uses an ephemeral channel response. A short private acknowledgement remains in the channel. Users must allow DMs.

## Demo

Use `/demo`. Each user gets an isolated fictional walkthrough covering pre-cutoff cancellation, successful post-cutoff replacement, another waiter winning, and fast-forwarding 24-hour expiry. The demo uses the same core functions; fictional participants and preview messages are clearly identified. No payment or other real accounts are required for this walkthrough. Multi-account live delivery is a separate integration check.

## Configuration

Node.js 24 is recommended. No third-party packages are required.

1. Copy `.env.example` to `.env` and fill in the five values locally. Never commit the token.
2. `node --env-file=.env bot.mjs --register` registers the server commands.
3. `npm start` runs the bot.
4. Server manager: `/configure session:<YYYY-MM-DD> cutoff:<ISO date with offset> start:<ISO date with offset>` sets the registration cutoff and session start. Optional title, location, fee and capacity are supported. Example format: `2026-11-01T15:00:00-05:00`.
5. `/setup` publishes or updates the session and reviewer panels.
6. `/my-status` shows personal status privately in the channel.

Upcoming Wednesday dates are generated automatically. Dates/fees cannot change while existing dated bookings remain, and active searches block reconfiguration. The rolling two-session picker is implemented. Scheduled pre-cutoff reminders, fee calculation and Venmo instructions are not yet included.

## Hosting

Run exactly ONE process with persistent `data/` storage. `data/state.json` stores bookings, search deadlines, demo progress, offer message references and pending notification jobs. Each successful state change is saved through atomic file replacement. The 15-second scheduler expires overdue searches on startup and periodically, including after downtime.

Failed notifications retry up to five times with backoff; permanent Discord 403/404 failures stop retrying. A notification already sent immediately before a crash may be repeated (at-least-once delivery). Discord delivery times are not identical across recipients. Users can request their current information via My status; blocked DMs must be enabled. This file-based implementation is not designed for multiple replicas.

### AWS Lightsail

The Node.js blueprint with an `admin` user and `/usr/bin/node` is supported by `squash-club-bot.service`. Clone the repo into `/home/admin/squash-club-bot`, create `data/` and a mode-600 `.env`, then install the unit into `/etc/systemd/system/`. Use `systemctl enable --now squash-club-bot` to enable automatic startup. Stop a local development copy before starting the cloud copy. Keep private backups outside GitHub. Updating GitHub does not automatically deploy to this instance.

### Railway alternative

The Dockerfile copies only runtime files. Set variables in Railway and attach a persistent volume at `/app/data`. Use one replica and disable sleeping. No public HTTP endpoint is needed for the Gateway connection.

## Verification

`npm test` covers cutoff boundaries, 24-hour and session-start expiration, retained fee responsibility, competing and multiple claims, explicit waitlist consent, unauthorized claims, restart recovery and timezone validation.

No privileged Message Content or Server Members intents are used. Ordinary chat messages are not read. All current session messages are marked as a demo; do not send real payments.

## Organizer-only testing

Use `/test` in `#test-controls` (Manage Server or Administrator permission required). Choose a Wednesday, headcount preset, your role, and before/after cutoff, then confirm Apply test. Applying a preset replaces that date's registrations and searches for every account. Other dates remain unchanged. All accounts then use the same canonical session through Sign up / My status / Cancel registration in `#squash-session` and their own DMs.

For a two-account handoff: configure Full · 8 + 0, your role Confirmed player, After cutoff. Sign in with a second account and join that date's waitlist. Cancel from the first account, then accept the offer from the second account's DM. Both accounts receive the settlement information. No real payment is required.

The controls can simulate fictional cancellation/acceptance, fast-forward a deadline, change presets, or reset the selected session. Reset all data clears registrations and test states across all sessions after confirmation. Chat messages remain. Old session action messages are rejected after reconfiguration. Legacy private test copies are archived on startup.

Before cutoff, status and session details display an estimated $15–20 per person; after cutoff they display the configured fee. My status includes confirmed/capacity and waitlist counts. Confirmation prompts have a dismiss/keep-registration option.

Before cutoff, canceled spots are automatically assigned to waitlisted players in registration order; promoted players receive a confirmation DM without needing to accept. Startup and periodic reconciliation also fill existing pre-cutoff vacancies. After cutoff, replacement offers still go to all waiters and the first valid acceptance wins.

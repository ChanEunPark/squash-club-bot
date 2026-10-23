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

At cutoff, the bot freezes the confirmed headcount, divides SESSION_TOTAL_COST_CENTS by that count (rounding each share to cents), and queues one USD payment-instruction DM per confirmed player. ORGANIZER_PAYMENT_INFO supplies the organizer payment destination. The snapshot prevents duplicate billing notices across restarts and keeps the agreed fee unchanged during replacements. Missing configuration, zero confirmed players, and sessions that have already started do not generate payment instructions. These messages are demo-only; the bot never collects or verifies payments.


## Personalized waitlist outlook (synthetic-data demo)

After joining the waitlist, a participant receives an optional deadline question in the confirmation DM. Set my deadline opens an Eastern Time form (YYYY-MM-DD HH:mm); Any time before the session uses session start, and Skip for now keeps registration unchanged. Submitting a deadline shows an outlook. My status recomputes it on demand. The deadline guides planning only: it does not automatically remove a waiter or suppress offers. There are no unsolicited prediction-update DMs.

The statistical model in `forecast.mjs` uses `fixtures/forecast-history.json`: 48 entirely fictional sessions with booking, attendance, cancellation-time, and offer-response records. Regenerate the fixture with `node scripts/generate-forecast-fixture.mjs`. Current accounts map deterministically to mock participant profiles, never to real attendance histories. Test controls can switch stable, mixed, and more-cancellation assumptions without changing actual bookings.

Cancellation probabilities use recent records with a sixteen-week half-life, a six-observation overall prior for sparse profiles, and timing conditioned on the participant not having canceled yet. Monte Carlo trials apply FIFO promotion before cutoff and first-valid-acceptance competition after cutoff, including current open offers and their eligibility/deadlines. Post-cutoff response times are sampled equally for all waiters from the synthetic response dataset; they are not a measurement of any user's responsiveness. The displayed probability is rounded to five-percentage-point increments. The scenario range varies cancellation probabilities by ±25%; it is not a calibrated confidence interval. The confirmation-time window covers the middle sixty percent of successful simulated confirmations by the user's deadline; it is not a promised notification window. This is an unvalidated demonstration model, not evidence of real-world predictive performance.

OpenAI explains the computed result; it never generates the probability or time window. Set OPENAI_API_KEY in the ignored `.env` and optionally OPENAI_MODEL (default gpt-4.1-mini). Only aggregate forecast facts and the relative time until the user's deadline go to the Responses API, with store:false. Names, Discord IDs, payment details, individual histories, and user-authored free text are not sent. Successful explanations are cached for five minutes (failures are retried on the next request), time out after eighteen seconds, and have structured-output validation. If configuration or a request fails, the UI honestly labels a statistical fallback as AI unavailable. The deterministic forecast remains usable.

Run `node --test` to verify model behavior, Eastern-time parsing, privacy boundaries, failure fallback, and the mocked Discord waitlist → deadline modal → outlook → status flow. Mocked tests do not replace a real Discord/OpenAI integration check.

At cutoff, each currently waitlisted real account receives one proactive outlook DM per session. A persisted marker prevents repeat sends on restart; notifications are queued independently of billing. If no personal deadline is saved, this notice explicitly estimates through session start. Players who became confirmed, left, or whose session was reset before delivery are skipped. Low probabilities remain honest, followed by encouragement to keep the waitlist place and watch for offers. AI validation failures get one regeneration attempt, while genuine failures remain labelled as statistical fallback.


## Organizer dashboard

The read-only dashboard follows the Figma design and reads the bot's in-memory canonical sessions. It refreshes every 30 seconds and on page reload or the refresh button. Confirmed, waitlisted, and completed cancellations have separate tabs; post-cutoff cancellation requests remain confirmed until replaced. Fictional preset players have readable demo names and a Demo player label. No standalone sample bookings are added to live data.

Set `DASHBOARD_PORT=3000` and `DASHBOARD_HOST=127.0.0.1` on the bot, then reverse proxy the public web endpoint to that port. Set `DASHBOARD_URL` to that public URL and run `node --env-file=.env bot.mjs --publish` to add an Open organizer dashboard link to the test-controls panel. The dashboard has no login by request. The public API exposes display names, session times, status, and activity only; Discord user IDs, tokens, contact information, billing recipients, and private forecast preferences are excluded. Only GET and HEAD are supported. The API never changes registrations or sends notifications.

New registration/cancellation events are recorded from this version onward. Existing filled searches are reconstructed where available; unknown historical registration timestamps are shown as unavailable rather than invented. Test reset clears the corresponding dashboard records along with bot data.

For a local preview using isolated fictional data: `node scripts/preview-dashboard.mjs`, then open http://127.0.0.1:4380. This does not connect to Discord or alter live data.

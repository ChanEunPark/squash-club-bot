<div align="center">

# Squash Club
### Less chasing. More playing.

A Discord experience that fills cancelled spots, helps waitlisted players plan, and gives organizers a live view of their club.

**[Join the Discord demo ↗](https://discord.gg/EcnHudbGt)** · **[Organizer dashboard ↗](https://squash-club-bot.3-137-186-90.sslip.io/)**

Demo project · Fictional history · No real payments

</div>

---

## Start here

**You do not need to install or run anything to explore the hosted demo.**

1. Open Discord and go to **#squash-session**. Sign in to Discord and enable direct messages from server members.
2. Use **Sign up** to choose one of the next two Wednesday sessions. The bot continues the registration flow in your DMs.
3. Open the **[organizer dashboard](https://squash-club-bot.3-137-186-90.sslip.io/)** alongside Discord. It shows the same session data and refreshes every **30 seconds**; use its refresh control for an immediate update.

The invitation above is valid for 30 days from creation. If it has expired, ask the project owner for a fresh invitation. Already joined? [Open #squash-session directly](https://discord.com/channels/1562279091145678911/1562280894323232828). The dashboard opens without a password.

**Want a quick walkthrough without changing shared bookings?** Run **`/demo`** in Discord. This private, fictional walkthrough lets you try a cancellation, a successful replacement, another waiter accepting first, and an expired offer. It is separate from the shared session shown on the dashboard.

## The problem

A late cancellation leaves more than an empty court spot. The organizer must find someone, the cancelling player needs to know whether they still owe the fee, and waitlisted players do not know whether to keep their evening free.

Squash Club keeps participant actions in Discord, where the club already communicates. It automates the handoff and gives waiters a planning outlook, while the organizer gets a focused monitoring page.

## What to try

### 1 · Register and check your status

Choose a session using **Sign up**. If it is full—or registration has already closed—you can explicitly agree to join the waitlist. **My status** shows your upcoming sessions privately, with relevant actions for each date.

Sessions normally run **Wednesdays, 8–10 PM Eastern Time**, with registration closing **Monday at 3 PM ET**. Test presets can move the cutoff to demonstrate different states. Each date has its own bookings and waitlist.

### 2 · See whether waiting fits your plans

After joining the waitlist, the bot asks:

> **When’s the latest you can hear about a spot?**

Choose a time, use **Any time before the session**, or skip. The result leads with a plain-language outlook, followed by a probability, estimated time window, and short explanation. **Why this estimate?** expands supporting patterns and model assumptions in the same message; **Hide details** collapses them.

Your chosen time is a planning preference. It does **not** remove you from the waitlist or stop later offers. At registration cutoff, waitlisted players also receive an outlook DM without having to check My status.

### 3 · Follow a cancellation through to replacement

**Before registration closes:** cancellation releases the booking immediately. The next waiter is automatically confirmed in registration order and receives a DM.

**After registration closes:** cancellation starts a replacement search. Eligible waiters receive an offer, and the **first valid acceptance** wins. The original player keeps their booking and fee responsibility until someone accepts.

A search lasts up to **24 hours**, ending earlier if the session starts. A successful match receives private contact and settlement instructions. If nobody accepts, the original player receives a notice that their fee responsibility remains. Closed offers cannot be accepted.

### 4 · Watch the organizer view update

The dashboard brings together:

- Confirmed headcount, waitlist size, and active replacement searches.
- The player seeking a replacement and time remaining.
- Separate **Confirmed**, **Waitlist**, and **Cancelled** rosters.
- Recent registrations, cancellations, promotions, and replacement activity.

A player seeking a replacement stays in the confirmed roster until replaced. Fictional preset participants are labelled **Demo player**. The dashboard is read-only; participant actions happen in Discord.

## Guided scenarios for reviewers

**Organizer access is required** for `/test` in **#test-controls**. If those controls are unavailable, use `/demo` and the participant flow above.

For the shared demo, choose a date, headcount preset, your role, and before/after cutoff, then apply the setup. **Applying a preset replaces that date’s shared registrations and searches for every tester.** Coordinate with other reviewers before resetting it.

- **Automatic promotion:** choose a full session before cutoff, join its waitlist, then simulate a confirmed player cancelling. Check the confirmation DM and dashboard.
- **Personalized outlook:** join a full session’s waitlist, choose when you need to know, and expand **Why this estimate?**. Try the forecast scenario controls to compare different fictional cancellation tendencies.
- **Cutoff notices:** use **Send cutoff reminder now** to send a reminder, or **Close registration now** to finalize the headcount and trigger payment instructions and waitlist outlooks.
- **Replacement handoff:** after cutoff, use one confirmed account and a second waitlisted account. Cancel from the confirmed account, then accept the offer in the waiter’s DM. Check both players’ messages and the dashboard.
- **Search expiry:** start a replacement search, then use **Fast-forward deadline** to expire the active search immediately. This tests search expiry; it does not advance the real clock or move the session date.

Fictional cancellation/acceptance controls allow testing without a second real account. Fictional players never receive real DMs. **Reset this session** affects the selected date; **Reset all data** clears shared registrations and test states across dates after confirmation. Neither deletes channel messages.

## What the AI does

**The statistical model calculates the forecast. OpenAI explains it.**

The demo dataset contains **48 fictional sessions**, with participant booking, attendance, cancellation timing, and offer-response records. The model considers current participants, time remaining, waitlist position before cutoff, and offer competition after cutoff.

Recent records carry more weight. Sparse participant histories are pulled toward the club average. Simulation follows the actual allocation rules, including active offers and their expiry. OpenAI receives aggregate findings and the relative time until the player’s chosen time, then writes a short explanation grounded in those results.

Names, Discord IDs, payment details, and individual member histories are not sent to OpenAI. If the API is unavailable, the forecast still works and the explanation is clearly labelled as a statistical fallback.

**This is a product demonstration, not a validated prediction service.** Current accounts map to fictional historical profiles. Probabilities are rounded to five percentage points; the time window describes successful simulated confirmations, not a promised notification time. Keeping a place on the waitlist never guarantees a booking.

<details>
<summary><strong>Model details</strong></summary>

- Cancellation estimates use a sixteen-week recency half-life and a six-observation overall prior, conditioned on participants not having cancelled yet.
- Monte Carlo simulation applies registration-order promotion before cutoff and first-valid-acceptance competition afterward.
- Post-cutoff response times come from the fictional response dataset, equally sampled for all waiters; they do not measure real users’ responsiveness.
- The confirmation window covers the middle 60% of successful simulations by the chosen time.
- The scenario range varies cancellation assumptions by ±25%; it is not a calibrated confidence interval.
- API requests use `store: false`, validated structured output, and a five-minute success cache. Failures can fall back to the computed statistical explanation.

See `forecast.mjs`, `outlook-ai.mjs`, and `fixtures/forecast-history.json`.

</details>

## Fees in this demo

At cutoff, the configured **$120 USD** court cost is split across the confirmed headcount. For example, eight confirmed players receive instructions for **$15.00 USD each**. The agreed per-person amount remains fixed during replacements.

The bot sends payment instructions and connects matched players for direct settlement. It **does not collect, transfer, or verify money**. All current sessions are a demo: **do not send a real payment**.

## Behind the experience

Built with **Node.js**, the **Discord Gateway and REST API**, the **OpenAI Responses API**, and a **vanilla HTML/CSS/JavaScript dashboard**. Hosted on **AWS Lightsail**, with Caddy providing HTTPS.

Bookings and notification jobs persist in a local JSON store using atomic file replacement. Startup and periodic checks reconcile vacancies and expired searches. Notification failures retry with backoff. The dashboard reads the same canonical sessions as the bot rather than maintaining a second set of bookings.

The public dashboard exposes session details, display names, booking status, and activity. It excludes credentials, Discord user IDs, contact handoff details, payment recipients, and private planning preferences. Ordinary chat messages are not read, and privileged Message Content or Server Members intents are not used.

<details>
<summary><strong>Run locally</strong></summary>

Requires Node.js 24. No third-party runtime packages are required.

```sh
cp .env.example .env
# Fill in your Discord configuration locally; never commit credentials.
node --env-file=.env bot.mjs --register
npm start
```

Use `/setup` with server-management permission to publish the panels. Optional `OPENAI_API_KEY` enables AI explanations; without it, the statistical fallback remains available. See `.env.example` for configuration fields.

To preview only the dashboard with isolated fictional data:

```sh
node scripts/preview-dashboard.mjs
```

Open http://127.0.0.1:4380. This preview does not connect to Discord or change live bookings.

```sh
npm test
```

Tests cover allocation and cutoff boundaries, competing acceptances, expiration, fee responsibility, persistence behavior, timezones, forecast behavior, privacy boundaries, dashboard endpoints, and evidence expand/collapse. Mocked integration tests do not replace real Discord/OpenAI checks.

</details>

<details>
<summary><strong>Deployment and limitations</strong></summary>

Run one bot process with persistent `data/` storage. This file-based prototype is not designed for multiple replicas. The included systemd service supports a Lightsail deployment under `/home/admin/squash-club-bot`.

Set `DASHBOARD_HOST=127.0.0.1`, `DASHBOARD_PORT=3000`, and the public `DASHBOARD_URL`; reverse proxy with HTTPS. See `deploy/Caddyfile.example`. The hosted demo intentionally has no dashboard login and should only be used with demo data.

Updating this repository does not automatically deploy the hosted service. Do not run a local production-token copy alongside the cloud bot. Keep `.env`, state files, and backups out of Git.

Failed notifications retry up to five times. A crash immediately after sending can cause duplicate delivery; Discord delivery is not simultaneous across recipients. Unknown registration timestamps in older records appear as unavailable rather than being invented.

</details>

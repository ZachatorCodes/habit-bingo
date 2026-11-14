# Habit Bingo

A monthly habit game for small groups of friends. Build a bingo card from your own habits, check
them off every day, earn and protect squares, unlock the real-life rewards you set yourself, and
race your friends up the group leaderboard.

- Product and technical design: [`docs/superpowers/specs/`](docs/superpowers/specs/)
- Implementation plans (one per milestone): [`docs/superpowers/plans/`](docs/superpowers/plans/)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- How we work: [CONTRIBUTING.md](CONTRIBUTING.md)

## Features

- **Habit library.** Save the habits you care about, each with an icon, a category and a rule:
  "at least 3 times a month", "8 times a day", "2 days a week" or "at most 3 days a month".
  Mark any habit private and friends only ever see "a private habit". A Quick start list gets new
  players going.
- **Monthly bingo cards.** Build a 3×3 (8 habits) or 5×5 (24 habits) card in five steps: size, habits, targets, rewards and board. Starting mid-month shortens monthly targets
  to the days left. You can edit a card for 48 hours after starting it.
- **Squares you earn and squares you protect.** A square helps a bingo only once it is done:
  - **Monthly goals** fill up as you log and count as soon as they are complete.
  - **Every-day and every-week habits** count at the end of the month if you keep them up. Miss a
    day and the square turns at risk; once the miss is more than 3 days old the square is lost
    until you log that day.
  - **"At most" limits** stay safe while you stay under, and count at the end of the month.
- **Rewards.** Set three real-life treats: one for your first bingo, one for 5 counting squares (12 on
  a 5×5), and one for a blackout. A celebration reveals each one as you reach it.
- **Today.** Today's check-ins in one list, with day chips to catch up on the last few days and
  nudges for what needs doing, including how close you are to a bingo or reward if you keep it up.
- **Log any day of the month.** Every habit opens a sheet with a month calendar, so a day you forgot
  can still be logged later, up to today.
- **Groups.** Invite friends with a link. Each group has:
  - a **Feed** of everyone's check-ins and highlights, with icon reactions;
  - a live **Leaderboard** of this month's % complete;
  - **Members**, where you can view each other's cards.
- **Month end.** The month closes on the 4th, after a 3-day grace period for last-minute logging.
  You get a recap and final standings, and the last week's center square nudges you to build next
  month's card.
- **Made for phones.** Installable as a Safari web app on iPhone, with a sidebar layout on iPad and
  desktop.
- **Invite-only.** Sign-up needs an invite. Admins manage invites and group links.

## How to play

1. **Get an invite.** Open your invite link, create an account, and pick your time zone and the day
   your week starts.
2. **Add habits.** Go to **Me → Habits**, then tap Quick start habits or create your own.
3. **Build your card.** Go to **Card**, then choose a size, pick habits, adjust targets, name your
   rewards, and shuffle the board until you like it. Then tap **Start card**.
4. **Check in.** On **Today**, tap **+** on each habit as you do it. To fix an earlier day, open the
   habit and pick the day on its calendar.
5. **Play with friends.** Create a group under **Groups**, share its invite link, and react to each
   other's progress in the feed.
6. **Finish the month.** Go for lines, the squares reward and the blackout. Build next month's card by
   the 3rd to complete the last center square.

### % complete

Your card shows how much of the month you've completed: the average of every habit square's
completion of its whole-month job.

- **Monthly goals:** progress toward the target.
- **Every-day and every-week habits:** the days or weeks met, out of the whole month.
- **Limits:** a share for each finished day you're still within the limit.
- **Failed squares count nothing,** until you win them back.

So a perfect player is at about half on the 15th and reaches 100% when the month ends. The group
leaderboard ranks this month's cards by % complete, then by complete lines.

## Stack

- **App:** SvelteKit 3 (Svelte 5 runes) and TypeScript, with Tailwind CSS v4 (design tokens in
  `@theme`), Phosphor icons and Nunito.
- **Data:** Drizzle ORM on Postgres (Neon), with migrations in [`drizzle/`](drizzle/).
- **Auth:** Better Auth (username and password, with optional Google), invite-only.
- **Layers** ([ADR 0007](docs/adr/0007-layering-and-boundaries.md), enforced by lint):
  - **Game rules and shared types:** pure TypeScript in [`src/lib/game/`](src/lib/game/), covered
    by tests at 100%.
  - **Services:** [`src/lib/server/`](src/lib/server/), each taking the database first.
  - **Components:** [`src/lib/components/`](src/lib/components/).
  - **Routes:** thin [`src/routes/`](src/routes/) files that call services and rules.
- **Tests:**
  - **Vitest** for server code against an in-memory PGlite Postgres, and browser-mode component
    tests.
  - **Playwright** end-to-end tests on phone, tablet and desktop.
- **Delivery:** GitHub Actions CI on pull requests, Vercel hosting with Neon preview branches, and
  release-please for versions.

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm ci
npx playwright install chromium
cp .env.example .env   # fill in values when you need a database
npm run dev
```

The app builds and runs without a database; `/api/health` reports `degraded` until `DATABASE_URL`
is set.

### Try it locally without a database

The E2E server runs the production build against an in-memory Postgres (PGlite), migrated and
seeded with a member and an admin account (see [`scripts/e2e-seed.ts`](scripts/e2e-seed.ts) for
their logins):

```bash
npm run build
npx tsx scripts/e2e-server.ts   # http://localhost:4173
```

Everything resets when it stops. Add a `hb_test_now` cookie with an ISO date to move the app's clock,
which is how the tests jump between months.

## Environment variables

Set these in Vercel (Settings, Environment Variables) and, for local work, in `.env`
(see `.env.example`).

| Variable                | Environments               | Secret | What it is for                                                                                 |
| ----------------------- | -------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Production, Preview, local | Yes    | Pooled Postgres connection used by the app. Vercel's Neon integration sets it per environment. |
| `DATABASE_URL_UNPOOLED` | Production, Preview, local | Yes    | Direct Postgres connection used for migrations. Set by the Neon integration.                   |
| `BETTER_AUTH_SECRET`    | Production, Preview, local | Yes    | Signs sessions and tokens. Use a different value per environment; never in Development.        |
| `BETTER_AUTH_URL`       | Production, local          | No     | The app's public base URL. Required for Google sign-in, including local dev with Google.       |
| `GOOGLE_CLIENT_ID`      | Production, local          | No     | Google OAuth client ID for "Continue with Google".                                             |
| `GOOGLE_CLIENT_SECRET`  | Production, local          | Yes    | Google OAuth client secret.                                                                    |
| `BOOTSTRAP_INVITE_CODE` | Production                 | Yes    | One-time invite code that creates the first admin. Delete it afterwards (see below).           |

Google sign-in only works on production and `localhost`, because Google needs exact redirect URIs
(`/api/auth/callback/google` on each). Preview deployments use username and password only.

"Local" means your `.env` file. Do not add `BETTER_AUTH_SECRET` to Vercel's Development environment.

`IP_LIMIT_MULTIPLIER` (not in the table) multiplies the per-IP sign-in, sign-up and reset limits.
Only the E2E server sets it, because every E2E test comes from one IP. Never set it on Vercel.

## Scripts

| Script                  | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Start the dev server                         |
| `npm run build`         | Production build                             |
| `npm run preview`       | Serve the production build                   |
| `npm run check`         | Type-check (svelte-check)                    |
| `npm run lint`          | Prettier check + ESLint                      |
| `npm run format`        | Format everything with Prettier              |
| `npm run test:unit`     | Vitest in watch mode                         |
| `npm run test:coverage` | Vitest once, with coverage                   |
| `npm run test:e2e`      | Playwright end-to-end tests                  |
| `npm test`              | All Vitest tests, then Playwright            |
| `npm run db:generate`   | Generate a migration from the Drizzle schema |
| `npm run db:migrate`    | Apply migrations to `DATABASE_URL`           |
| `npm run db:studio`     | Browse the database                          |
| `npm run icons`         | Render `static/icon.svg` into the app icons  |

> **Windows note:** local builds use `@sveltejs/adapter-auto` because `@sveltejs/adapter-vercel`
> needs symlink permission. Vercel builds use the Vercel adapter automatically.

## Deployment

- **Production:** every merge to `main` deploys to Vercel.
- **Previews:** every pull request gets a Vercel preview URL, backed by its own Neon database branch
  (Vercel's Neon integration creates it and sets `DATABASE_URL`).
- **Migrations:** Vercel runs `npm run vercel-build` (`drizzle-kit migrate && vite build`), so each
  environment's database is migrated before the app is built.
- **Health check:** `GET /api/health` returns `{"status":"ok","db":"ok"}` when the app can reach its
  database; check it by hand after a deploy.

## Bootstrapping the first admin

Sign-up is invite-only, so the first account needs a bootstrap code.

1. Set `BOOTSTRAP_INVITE_CODE` to a long random string (as a Secret) and redeploy.
2. Visit `/join/<BOOTSTRAP_INVITE_CODE>` and create your account. You become the admin.
3. Delete `BOOTSTRAP_INVITE_CODE` from the environment. Once an admin exists it does nothing, so
   removing it just keeps things tidy.

From then on, create invites from the admin area.

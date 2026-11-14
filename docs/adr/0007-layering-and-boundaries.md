# 7. Three layers, with import boundaries enforced by lint

- Status: accepted
- Date: 2026-11-13

## Context

Rules had leaked into route files (the card builder held its whole draft logic), each route repeated
the same database, timezone, clock and form boilerplate, and imports ran both ways between the
server and components. Nothing stopped new code from adding to that.

## Decision

Rules, services and routes form three layers, with components beside the server. Imports only
point downhill.

| Layer       | Lives in              | May import                                   |
| ----------- | --------------------- | -------------------------------------------- |
| Routes      | `src/routes/**`       | everything below                             |
| Server      | `src/lib/server/`     | `lib/game`, the database, `$app/env/private` |
| Components  | `src/lib/components/` | `lib/game`, `$app/*`, other components       |
| Game (pure) | `src/lib/game/`       | other `lib/game` modules only                |

- **`lib/game`** holds the rules and the types shared by the server, pages and components
  (`game/types.ts`). No I/O, no SvelteKit, no Drizzle, no components. 100% test coverage.
- **`lib/server`** holds services. Each takes `db` first, validates its own input and returns
  `{ ok: true, … } | { ok: false, field, message }`. The schema lives in `lib/server/db/schema/`.
  Same-named modules in `game` and `server` (`feed.ts`, `leaderboard.ts`) are the pure and the
  database halves of one feature.
- **Routes** are thin: guard the user, read input, call services and rules, and map results to
  `fail`, `redirect` or page data. Shared request helpers live in `lib/server/request.ts`
  (`requireDb`, `personOf`, `requestClock`, `formText`, `readForm`); structured logs go through
  `lib/server/log.ts`. A helper used by one page only stays in that route file.
- **Components** are grouped as `components/ui/` (primitives such as Button, Sheet, Icon) and one
  folder per domain (`card/`, `builder/`, `habits/`, `today/`, `groups/`). A component used by one
  route only lives beside that route.
- **Validation** is hand-rolled in services with the result pattern above; there is no schema
  library.

ESLint (`@typescript-eslint/no-restricted-imports`) enforces the boundaries, type imports included:

- `lib/game` may not import `$app/*`, `@sveltejs/kit`, `drizzle-orm`, `lib/server` or components.
- `lib/components` may not import `lib/server`.

SvelteKit's own server-only check also applies through the `#lib/server/*` alias. A component that
imports `#lib/server/db/client.ts` fails `npm run build` with `server_only_import` (checked
2026-11-13).

## Consequences

- Where new code goes is decided by what it touches: a rule or shared type goes to `lib/game`
  (with tests), database work to a `lib/server` service, request plumbing to the route.
- A component that needs a server type gets it from `game/types.ts`, so the type moves there.
- Lint fails a pull request that crosses a boundary, so the layering holds without review effort.

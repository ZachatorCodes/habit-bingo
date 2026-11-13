# Points rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 5×5 multiplier, pay limits of 0 and daily limits per clean finished day,
count only completed squares toward lines mid-month, set the 5×5 middle reward to 12 squares, and
show progress as the card percentage.

**Architecture:** The rules are pure functions in `src/lib/game`:

- `evaluate.ts` sets `counting`;
- `score.ts` computes points and the percent;
- `card-layout.ts` holds the per-size constants.

The UI copy follows in the components, and the feed stores the middle-reward count in the tier
payload.

**Tech Stack:** SvelteKit 2 / Svelte 5, Drizzle + PGlite tests, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-points-rework-design.md`

## Global Constraints

- Strict TDD: each behaviour gets a failing test that is run and seen failing before the code.
- `src/lib/game` keeps 100% coverage.
- Never run `npm run dev`, `db:migrate` or `db:studio`, and never read `.env*`.
- Copy, verbatim:
  - "Counts at the end of the month if you keep it up."
  - "N% complete"
  - "reached N squares"
  - "reached their middle reward"
- The tier id `sixtyPercent` stays.
- Saved `month_result` rows are not touched.
- No migration.

## Review Focus

1. **A card started mid-month:** per-day limit points use the days on the card (`startDate` to
   month end), not the whole month.
2. **The day after the card's last day:** every clean day has paid (10 with no slips), and the
   per-day limit doesn't grow past 10.
3. **A weekly limit of 0:** paid per day (count 0 on that day), not by weeks.
4. **The member card page:** it shows "N% complete" too (`groups/[id]/members/[userId]`).
5. **`month_result.squaresCounting`** is still the count of counting squares, not the progress
   percent.

---

### Task 1: Game rules

**Files:**

- Modify:
  - `src/lib/game/card-layout.ts`: drop `multiplier`; set `sixtyThreshold` to 5 (3×3) and 12 (5×5).
  - `src/lib/game/score.ts`: `squarePoints` and `scoreCard`.
  - `src/lib/game/evaluate.ts`: `counting`.
- Test: `score.spec.ts`, `evaluate.spec.ts`, `nudges.spec.ts` (fixtures as needed).

**Interfaces:**

- Produces:
  - `CARD_SIZES[size]` without `multiplier`.
  - `scoreCard(size, squares: { points: number; counting: boolean }[])`: unchanged signature.
    - `points`: no multiplier.
    - `percent`: `Math.round(100 * Σpoints / (10 * CARD_SIZES[size].habits))`.
  - `evaluateSquare(...).counting`: `counts(state) && (isEarn || today > monthEnd)`, where
    `isEarn` = atLeast and month.
- Per-day limit points (in `squarePoints`): applies when
  `rule.direction === 'atMost' && (rule.target === 0 || rule.period === 'day')`.
  - A day `d` from `startDate` to `min(addDays(today, -1), monthEnd)` is clean when
    `count(d) <= (rule.period === 'day' ? rule.target : 0)`.
  - Points = `10 * clean / daysOnCard`, where `daysOnCard` runs from `startDate` to `monthEnd`.
  - The state is ignored: a lost square keeps its clean days.

- [ ] **Step 1: Failing tests.** Cards start `2026-10-01` unless noted. The month has 31 days.
  - `score.spec.ts`:
    - `scoreCard` blackout on 5×5 (24 squares at 10, 12 lines) → `points: 640` (was 1280);
      3×3 → 380.
    - `percent` is the progress average: 3×3 with four squares at 10 and four at 5 → `75`.
  - `score.spec.ts`, `squarePoints`:
    - a limit of 0 ("atMost month days 0"), no check-ins, today `2026-10-15` →
      `toBeCloseTo(10*14/31)`; today `2026-11-01` → `10`; today `2026-11-20` → `10`.
    - a slip on `2026-10-21`, today `2026-11-01` → `toBeCloseTo(10*30/31)`, state `lost`.
    - a daily limit "atMost day times 2": `{ '2026-10-01': 3, '2026-10-02': 2 }`, today
      `2026-10-03` → `toBeCloseTo(10*1/31)`.
    - a weekly limit of 0: same per-day rule (Review Focus 3).
    - a card started `2026-10-20`, limit of 0, today `2026-11-01` → `10`. Today `2026-10-25` →
      `toBeCloseTo(10*5/12)` (Review Focus 1).
    - a monthly limit above 0 ("atMost month days 3") → 0 on `2026-10-31`, 10 on `2026-11-01`
      (unchanged).
  - `evaluate.spec.ts`:
    - "every day" met every day, on `2026-10-31` → `{ state: 'held', counting: false }`; with the
      same counts on `2026-11-01` → `counting: true`.
    - "every week" the same.
    - an "every day" square that is lost on `2026-11-01` → `counting: false`.
    - a complete monthly goal mid-month → `counting: true`.
  - `score.spec.ts` / `nudges.spec.ts`: `reachedTiers` gives `sixtyPercent` at 12 counting on
    a 5×5 (not 11), and at 5 on a 3×3.
- [ ] **Step 2: Run** `npx vitest run --project server src/lib/game`. Expected: the new tests
      fail.
- [ ] **Step 3: Implement** as in Interfaces. Update the existing tests that asserted the old
      rules (multiplier totals, day/week counting mid-month, 15-square tier), and ledger each as a
      Ruling.
- [ ] **Step 4: Run** `npx vitest run --project server src/lib/game --coverage.enabled
--coverage.include='src/lib/game/**'`. Expected: PASS, 100%.
- [ ] **Step 5: Commit** `feat(score): points rework rules`.

### Task 2: Copy and feed

**Files:**

- Modify:
  - `src/lib/components/SizePicker.svelte`: "{need} habits", with no "× points".
  - `src/lib/components/CardHeader.svelte:72` and
    `src/routes/(app)/groups/[id]/members/[userId]/+page.svelte:25`: "% complete".
  - `src/lib/components/HabitSheet.svelte`: the new note.
  - `src/lib/components/FeedItem.svelte`: middle-reward text.
  - `src/lib/server/feed.ts` (`syncHighlights`) and its callers: the tier payload.
- Test: `SizePicker`, `CardHeader`, `HabitSheet` and `FeedItem` component specs;
  `check-ins.spec.ts`.

**Interfaces:**

- Consumes: Task 1 `counting`, `CARD_SIZES`.
- `syncHighlights(tx, card: { id; userId; size: CardSize }, ...)`. The size comes from the card
  row. The `tier:sixtyPercent` payload is `{ squares: CARD_SIZES[size].sixtyThreshold }`.
- HabitSheet note: shown when
  `data.calendar.direction === 'atLeast' && data.period !== 'month' && data.state !== 'lost' && !data.counting`.
  Add `period` to `SheetData` if it isn't already there.

- [ ] **Step 1: Failing tests.**
  - `SizePicker`: the text "24 habits" is present, and the text `/× points/` is absent.
  - `CardHeader`: "75% complete" for `score.percent = 75`; the 5×5 reward row reads "12 squares".
  - `HabitSheet`: a daily square with `counting: false` shows "Counts at the end of the month if
    you keep it up."; with `counting: true` it doesn't; a monthly goal never shows it.
  - `FeedItem`:
    - `sixtyPercent` with `{ squares: 12 }` → "@ana reached 12 squares";
    - with `{}` → "@ana reached their middle reward".
  - `check-ins.spec.ts`: reaching the middle tier on a 3×3 (5 monthly goals complete) stores
    `{ squares: 5 }`.
- [ ] **Step 2: Run** the client specs, plus
      `npx vitest run --project server src/lib/server/check-ins.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run check`, `npx vitest run --project client`, and
      `npx vitest run --project server`. Expected: 0 errors; PASS (rerun an auth PGlite timeout on
      its own).
- [ ] **Step 5: Commit** `feat(copy): squares rewards, percent complete, new sheet note`.

### Task 3: End-to-end

**Files:**

- Modify: `e2e/bingo.e2e.ts`, `e2e/card.e2e.ts` and any spec the full run shows relying on the old
  rules.

- [ ] **Step 1: Failing tests.**
  - `card.e2e.ts`: the builder's size step shows "24 habits" and no "× points".
  - `bingo.e2e.ts`: rewrite `freshCard` so the reward step is deterministic under the new rules.
    - Create 8 monthly "at least 1 day" habits through `page.request.post('/me/habits/new', …)`,
      as `card.e2e.ts`'s 5×5 test does.
    - Start a 3×3 on `2026-10-24`. The center is Free.
    - Logging 4 goals reaches "5 squares" (center + 4), so the reward reveal contains
      "Movie night".
    - The percent steps are "N% complete" from points (each goal is 10 of 80).
- [ ] **Step 2: Run** `npx playwright test e2e/card.e2e.ts e2e/bingo.e2e.ts --project=phone`.
      Expected: PASS. These tests follow behaviour that Tasks 1–2 already proved RED→GREEN at unit and
      component level. Before trusting a pass, check that each new assertion would fail on `main`, by
      reading what it asserts.
- [ ] **Step 3: Run** `npx playwright test`, `npx eslint src e2e scripts`, and Prettier on the
      changed files. Fix the specs that assumed the old rules (Ruling each).
- [ ] **Step 4: Commit** `test(e2e): points rework`.

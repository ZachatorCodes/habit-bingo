# Points rework: design

Status: approved in brainstorming 2026-11-12. Changes v2 spec §3.5–§3.7 and the counting rule spec
(`2026-10-30-counting-rule-design.md`). Where they differ, this document wins.

## 1. Intent

Every square is worth the same 10 points, and points build up as you go. A square only helps
lines and rewards once it is truly done: a completed monthly goal, or any other square that made it
through the whole month. Card sizes no longer change the score.

Success:

- A 5×5 card scores the same per square and per line as a 3×3 (no multiplier).
- "No alcohol" earns points for each clean day as the month goes on.
- Mid-month, only completed monthly goals and the Free square count toward lines and rewards.
- The card's percentage shows overall progress.

## 2. Rules

### 2.1 Points per square (up to 10, unrounded)

- **Monthly goals:** unchanged. The score is 10 × progress ÷ target, capped at 10.
- **Every-day and every-week habits:** unchanged. The score is 10 × days or weeks met ÷ the
  card's total.
- **Limits of 0 (any period) and daily limits (any target):** paid per day.
  - Each **finished** card day within the limit earns 10 ÷ (days on the card). A day is finished
    once it is before today, or after the card's last day.
  - "Within the limit":
    - a daily limit: that day's count ≤ target;
    - a limit of 0: that day's count is 0.
  - A slip day earns nothing. Points from clean days are kept, even though the square is `lost`.
  - Today pays nothing until it is over. On the day after the card's last day, every clean day has
    paid.
- **Weekly and monthly limits above 0:** unchanged. They pay 10 once the card's last day has
  passed, unless `lost`.
- **Free and next-month center:** 0 points (unchanged).

### 2.2 What counts toward lines, rewards and blackout

A square counts when it is one of these:

- the **Free** center;
- a **monthly goal** that is `complete`;
- any other square (daily habit, weekly habit, limit) once today is after the card's last day,
  provided its state is not `lost`. `held` and `atRisk` count then, as before.

Before the card's last day has passed, no daily habit, weekly habit or limit counts. Their states
(`empty`, `held`, `atRisk`, `lost`) and the win-back rules are unchanged.

### 2.3 Card score

- Points are the sum of the square points, plus 25 per complete line, plus 100 for a blackout,
  rounded once. There is **no size multiplier**: both sizes are 1×.
- Maximums: 380 on a 3×3, 640 on a 5×5.

### 2.4 Rewards

- **Tiers:**
  - **Bingo:** any complete line (unchanged).
  - **Middle reward:** a set number of counting squares. It is **5 on a 3×3** (unchanged) and **12
    on a 5×5** (was 15).
  - **Blackout:** every square counts (unchanged).
- The middle reward is named by its count everywhere ("5 squares", "12 squares"). No copy says
  "60%". The internal tier id `sixtyPercent` stays, so stored results and feed events keep working.

### 2.5 Card percentage

- The card shows **progress**: the average of every habit square's points out of 10 (the center
  is left out), rounded to a whole percent.
- The copy changes from "N% counting" to "N% complete".
- Reward tiers still use the count of counting squares (§2.4), not this percentage.

### 2.6 Past months

Saved `month_result` rows are **not** recalculated. Months closing from now on use these rules.

## 3. What people see

- **Builder size step:** "8 habits" and "24 habits", with no "× points".
- **Squares:** colours and rings unchanged. Daily and weekly sheets add "Counts at the end of the
  month if you keep it up.", next to the existing limit note.
- **Header:**
  - The line status ("N squares from a line", "Bingo!") follows §2.2.
  - The percentage follows §2.5.
  - The reward rows read "5 squares" / "12 squares".
- **Feed:**
  - New middle-reward highlights store `{ squares: N }` in their payload and read "reached 5
    squares" or "reached 12 squares".
  - Older ones have no count stored and read "reached their middle reward".

## 4. Testing (test-driven)

Every behaviour below is written as a failing test first, seen failing, then made to pass.

- **Unit (`src/lib/game`, 100% coverage kept):**
  - `scoreCard` applies no multiplier on a 5×5.
  - Limit of 0 on a 31-day card, clean through Oct 15, viewed Oct 15: 10 × 14 ÷ 31 points.
    Viewed Nov 1 with no slips: 10.
  - A slip on Oct 21: that day pays 0, the other clean days still pay, and the state is `lost`.
  - A daily limit "at most 2 a day": a day with 3 pays 0, and a day with 2 pays.
  - A monthly limit above 0 still pays 0 during the month and 10 after.
  - An every-day and an every-week habit that are on track have `counting: false` on the card's
    last day, and `counting: true` the day after (unless `lost`).
  - A complete monthly goal counts mid-month.
  - The middle tier is reached at 12 counting squares on a 5×5 and at 5 on a 3×3.
  - Progress percent is the average of habit square points ÷ 10.
- **Component tests:**
  - The size picker has no multiplier.
  - The header shows "12 squares" and "N% complete".
  - The daily-habit sheet note shows during the month and is gone after it.
- **End-to-end tests:**
  - A new 5×5 card's builder shows "24 habits" with no multiplier.
  - Existing tests that relied on daily or weekly habits counting mid-month are updated.

## 5. Out of scope

- Recalculating saved months.
- Weighting squares by difficulty.
- Changing square colours.
- A 4×4 card size.

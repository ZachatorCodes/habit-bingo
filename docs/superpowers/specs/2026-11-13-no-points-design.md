# Remove points: design

Status: approved in brainstorming 2026-11-13. It replaces the points parts of the points rework
spec (`2026-11-12-points-rework-design.md`) and v2 spec §3.7. Where they differ, this document
wins.

## Intent

The owner doesn't like points. Players should see how much of the month they have completed, and
compare that with friends. Points are removed from the app entirely: no calculation, no stored
column, no UI.

## Rules

- **% complete:** each habit square contributes its completion of the whole month's job, from 0 to
  1. The card's % complete is the average across all habit squares (the center is excluded),
     rounded to a whole percent.
  - **Monthly goal:** progress ÷ target, capped at 1.
  - **Daily habit:** each day's count, capped at the target, summed and divided by
    (target × days on the card).
  - **Weekly habit:** each week's progress, capped at its requirement, summed and divided by the
    sum of the requirements (1 when nothing is required).
  - **Any limit** (0, daily, weekly or monthly): the number of finished card days within the limit,
    divided by the days on the card.
    - A day is finished once it is before today, or after the card's last day.
    - For a limit of 0, a day is within the limit when its count is 0.
    - For a daily limit, a day is within it when its count ≤ the target.
    - For a weekly or monthly limit above 0, a day is within it when the running total for that
      week or month, up to and including that day, is ≤ the target.
  - **Failed squares count 0.** A square whose state is `lost` contributes 0. Winning it back
    restores its share.
- **Unchanged:** counting, lines, bingo, the middle reward (5 / 12 squares), blackout, the
  lose/win-back rules, and the "keep it up" nudges.
- **No points anywhere:**
  - `squarePoints`, `CardScore.points`, the line bonus (+25) and the blackout bonus (+100) are
    deleted.
  - `month_result.points` is dropped (migration `0014`; the planned emoji-column drop becomes
    `0015`).
  - The owner explicitly approved deleting the saved points data.

## Leaderboard

- **This month only.** The All-time tab, its `?board=all` handling and the summing code are
  removed.
- **Order:** % complete, highest first. Ties go to more complete lines, then to display name A–Z.
- **Each row** shows the member's % complete instead of points.

## Screens

- **Points removed from:**
  - the card header;
  - member card pages;
  - Today's board column (the "See your {Month} card" link stays);
  - the month recap;
  - the history list.
- **History and recap** show lines, rewards earned, and "N of 9 squares counting" (or of 25),
  from the saved row. Nothing is recalculated.
- **Card header and member page:** "N% complete" stays.
- **README:** the Points section becomes "% complete".

## Approaches

- **Chosen:** remove points entirely. Per-square completion replaces per-square points, and the
  saved column is dropped.
- **Rejected:**
  - keeping points computed but hidden, because it leaves two diverging metrics;
  - leaving the column in the database, because the owner wants nothing left.

## Testing

- **Unit (`src/lib/game`, 100% coverage):** the completion rules above, including:
  - a limit above 0 filling day by day and stopping at the day it went over;
  - a lost square counting 0;
  - a won-back square restoring its share;
  - 48% for a perfect daily habit on the 15th of a 31-day card.
- **Server:**
  - the leaderboard orders by %, then lines, then name, and has no all-time path;
  - `finalizeMonths` saves rows without points.
- **E2E:**
  - no "pts" or "points" text on the card, Today, member card, history or leaderboard;
  - the leaderboard shows % complete with no All-time tab.

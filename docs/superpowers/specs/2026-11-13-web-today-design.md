# Web UI: Today page (≥1024px): design

Status: approved in brainstorming 2026-11-13. First page of the web UI pass (branch `feat/web-ui`,
one PR per page). It builds on the wide-screen spec (`2026-10-23-wide-screens-design.md`).

## Intent

On a computer, Today's header looks empty, its width doesn't match the content, and the board
column is cluttered. This tightens the header and makes the board column line up and read clearly.

## Scope

- **Only ≥1024px (`lg:`).**
- **Phones (<768px) and 768–1023px do not change.** Any change there is a bug.
- One PR for Today. Later pages get their own PRs.

## Approaches

- **Chosen: responsive `lg:` styles on the existing components,** as the wide-screen work did. The
  layout is right on the first paint and nothing is duplicated.
- Rejected: a separate desktop Today page, because it duplicates the page.
- Rejected: changing the layout with JavaScript, because the layout would jump on load.

## Design

- **Shared header (`Hero.svelte`), every page at ≥1024px:**
  - the title grows from 28px to 40px;
  - the header is shorter, with less padding below the title;
  - its width matches the content panel below it, with the same left and right edges.
- **Today header, ≥1024px:**
  - the summary line ("All done for today", "N things to do today") is hidden;
  - the "See your {Month} card" link is hidden;
  - phones keep both.
- **Today card column, ≥1024px:**
  - the top of the board lines up with the top of the left column's first card;
  - a row under the board shows the points on the left and "See your {Month} card" on the
    right.
- **Today board, ≥1024px:**
  - square icons and the "Free" label are larger;
  - only Today's board panel changes (it renders only at ≥1024px), not the Card page.

## Calls made in brainstorming (owner may change)

- The 40px title and the shorter header.
- The points and the card link sit side by side under the board.

## Testing

- Browser tests at 1280px:
  - the header and content panel left and right edges match within 1px;
  - the title font size is 40px;
  - the summary and card link are not in the header;
  - the board's top matches the left column's first card;
  - the points and card link sit under the board;
  - the board icon and "Free" label are larger than on phones.
- Existing phone and tablet tests pass unchanged.
- No horizontal scroll at 1024px and 1440px.

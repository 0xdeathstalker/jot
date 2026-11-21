# Plan: Touch-sized editor toolbar on phones

Status: implemented, needs a check on a real iPhone (2026-11-21)

Problem: on phones (< 640 px) the toolbar shrank to 28 px buttons with 14 px icons, smaller than
desktop and well under Apple's 44 pt tap target.

## Changes

- `src/editor/toolbar.tsx`: below `sm`, 40 px buttons (`h-10 min-w-10`), 20 px icons, `px-1` on the
  menu triggers. Bar radius unchanged (12 px, owner's choice). The bar is 46 px tall, about Apple Notes' size. The 8 controls
  take about 338 px, so it stays on one line down to a 360 px wide phone and wraps (centred)
  below that.
- `src/editor/notice.tsx`: the phone notice sits 3.5rem above the toolbar's bottom edge (was 3rem),
  so it clears the taller bar.

## Check

- iPhone 15 Pro (393 px): one line, buttons easy to hit, notice ("Select text to add a link")
  above the bar, last lines of a long note not hidden behind it.
- 360 px wide (Chrome device mode): still one line. 320 px: wraps to two centred lines.
- Desktop toolbar unchanged.

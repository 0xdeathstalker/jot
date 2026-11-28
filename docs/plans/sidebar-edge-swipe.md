# Plan: Swipe from the left edge to open the sidebar on phones

> Superseded (2026-11-28): the sidebar was removed. See `action-panel.md`, phase 5.

Status: implemented, needs a check on a real iPhone (2026-11-21)

Goal: on phones (< 768 px), dragging from the left edge pulls the notes sidebar open under the
finger, like iOS. Dragging it back closes it.

## Changes

- `src/components/ui/sidebar.tsx`, mobile branch: the shadcn `Sheet` (Base UI `Dialog`) is replaced
  by Base UI `Drawer` (already installed, `@base-ui/react` 1.9, no new package).
  - `Drawer.SwipeArea`: an invisible 20 px (`w-5`) strip on the left edge, `z-40`, below the open
    panel. The panel follows the finger. It opens when released past half its width or on a
    flick, and stretches with resistance past full width. These are Base UI defaults.
  - `Drawer.Viewport` handles drag-to-close on the panel and the backdrop.
  - The panel's position uses `transform: translateX(var(--drawer-swipe-movement-x))`, not
    Tailwind `translate-*`, because Base UI reads the computed `transform`. The backdrop fades with
    `--drawer-swipe-progress`.
  - Still 150 ms linear and full-width with no fade, as before. `openMobile` state is unchanged,
    so the trigger and close-after-select still work.
- Re-apply this if `sidebar.tsx` is re-added from shadcn.

## Known limit

- Safari in the browser (not installed): the left-edge swipe means "Back" there, and Safari takes
  that gesture before the page sees it. The swipe works in the installed PWA (standalone, no
  browser back gesture) and in Chrome/Android when gesture navigation leaves room for it.

## Check

- Phone width: swipe from the edge opens; a short slow drag snaps back; a quick flick opens.
- Drag the open panel or the backdrop left to close. Tapping the backdrop and Escape still close.
- Trigger button, opening a note, New note and Share still close it.
- Typing and selecting text in the editor near the left edge still work (strip is 20 px, editor
  padding is 16 px).
- Installed PWA on an iPhone: the swipe works with the safe-area insets.

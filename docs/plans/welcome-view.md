# Plan: Welcome view (no note open)

Status (2026-11-28): design final (F for web and desktop, M4 for phones). Phase 1 done (component
written) and 2 (phone) done; phase 3 (mounted in `app.tsx`) done, not yet checked on screen;
phase 4 to do.
Source: owner request, 2026-11-28 (Excalidraw's empty canvas as the reference).

## Context

When no note is open, the app shows one line: "No notes yet. Create one with + at the top."
(`app/src/app.tsx`, the `<p>` in the scroll box, `absolute inset-0 pointer-events-none`, shown once
`loaded`). That happens with no notes at all, and also after the open note is deleted or left. The
owner wants an Excalidraw-style welcome view in its place: the app's name, one line on what it is,
and the few actions that get you started, with their keys.

## Final design (owner, 2026-11-28)

Mockups in `mockup/` (open `mockup/index.html`; throwaway, see phase 4).

**Web and desktop: F** (`mockup/f-combined.html`). Centred, three blocks, the gaps between
blocks clearly larger than the space inside each:

1. The Jot logo (`app/public/favicon.svg` artwork, drawn in `--foreground` / `--background`) and
   "Jot", then one muted line: "Fast notes that sync across your devices and work offline."
2. A bar reading **"What would you like to do?"** with the Ctrl/⌘+K keycaps on the right: a
   button styled like an input that opens the Action Panel. Not a text field.
3. Clickable rows, keys on the right:
   - **New note**: Ctrl/⌘+N in the desktop app, no keys on the web (browsers keep Ctrl+N).
   - **Search notes**: Ctrl/⌘+P.
   - **Global hotkey…**: desktop app only, opens the hotkey dialog.

   No Actions row (the bar is that) and no Recently deleted row.

In the 380px desktop window everything shrinks (smaller title, tighter gaps).

**Phone: M4** (`mockup/m4-phone-final.html`). F's three blocks for touch: no keycaps, the bar and
the rows 48px tall, New note and Search notes centred (icon and label), no Global hotkey row.

**When it shows:** whenever no note is open (no notes, or the open one was deleted or left), on
every platform, once this device's list has loaded. Same moment as today's line.

**Left out:** writing tips (mockup C), Recently deleted, the current hotkey's value on the Global
hotkey row (reading it needs a Tauri call outside `desktop/`, against the lint rule; the dialog
shows it).

## Phase 1: the component

- [x] **1.1** New `app/src/features/notes/welcome.tsx`, `Welcome({ onActions, onNew, onSearch,
      onHotkey })`. `onHotkey` is passed only in the desktop app; no row without it.
- [x] **1.2** Header: the logo as inline SVG (the favicon path, `fill-foreground` square and
      `stroke-background` mark, so it follows the theme), "Jot" (`text-3xl font-bold
      tracking-tight`, `text-2xl` in the small window), the description in `text-muted-foreground`.
- [x] **1.3** The bar: a `<button>` with the toolbar frame look (`rounded-xl border bg-popover`,
      soft shadow), `CommandLineIcon`, the text in `text-muted-foreground`, keycaps on the right.
- [x] **1.4** The rows: `<button>`s with an icon (`Add01Icon`, `Search01Icon`, a keyboard icon for
      the hotkey), label, and keycaps right-aligned; hover `bg-foreground/10` like the toolbar.
- [x] **1.5** Keys come from the same arrays the action list uses (`["Mod","K"]`, `["Mod","P"]`,
      `["Mod","N"]` only when `isDesktop()`), drawn with `Kbd size="sm"` and `shortcutKeys`
      (`components/ui/kbd.tsx`, `lib/platform.ts`), as in the toolbar dropdowns.
- [x] **1.6** (Superseded in phase 3: no pointer-events rules needed.) The whole view is `pointer-events-auto` (its wrapper in `app.tsx` is
      `pointer-events-none` so it never blocks the top bar); real buttons, so Tab and Enter work.
      Done as (2026-11-28): `features/notes/welcome.tsx`. The small desktop window uses `max-sm:`(smaller logo and title, gap 5 instead of 8); phase 2 swaps that for the phone rules where theydiffer. The bar is `max-w-100`, the rows `max-w-70`, as in the mockup (400px / 280px).

## Phase 2: phone (M4)

- [x] **2.1** `useLayout() === "phone"` (`hooks/use-layout.ts`): hide the keycaps, make the bar and
      rows `h-12`, centre the rows' content (`justify-center`), larger icons (20px).
- [x] **2.2** No Global hotkey row (it is never passed on a phone anyway: desktop only).
- [x] **2.3** Bottom padding so the view stays clear of the home indicator
      (`pb-[env(safe-area-inset-bottom)]`); check the iOS install hint at the top does not cover it.
      Done as (2026-11-28): `phone:` classes in `welcome.tsx` (the CSS variant, not `useLayout`: no JS
      needed), so the phone view never shows in the desktop app's narrow window. Keycaps `phone:hidden`;
      bar and rows `phone:h-12`, rows `phone:justify-center` and full width; 20px icons; title back to
      30px and a 34px logo (`max-sm:` had shrunk them for the 380px window). 2.3 needed no code: the app
      shell (`app.tsx` root) already pads by `env(safe-area-inset-bottom)`; the install hint is checked
      in phase 3, once the view is mounted.

## Phase 3: wiring in `app.tsx`

- [x] **3.1** Replace the "No notes yet" `<p>` with `<Welcome … />` under the same `loaded` guard,
      in the same absolutely positioned, centred wrapper.
- [x] **3.2** Handlers already there: `onActions={() => setActionsOpen(true)}`,
      `onNew={handleNew}`, `onSearch={() => setSwitcherOpen(true)}`, and on desktop
      `onHotkey={() => setHotkeyOpen(true)}`.
- [x] **3.3** Scroll box: the view must fit the 380×320 desktop window; if it does not, let it
      scroll (wrapper `min-h-full` instead of `inset-0` centring) rather than clip.

Done as (2026-11-28): the `<p>` in `app.tsx` is now `<Welcome>` inside an `absolute inset-0
overflow-y-auto` box with a `min-h-full` centring row: centred while it fits, scrolls in a short
window (3.3). Desktop passes `onHotkey` via `isDesktop()`. The old `pointer-events-none` (1.6) is
gone: it dated from the sticky sidebar era; the top bar now sits above the scroll box, not under
it, so nothing needs clicks passed through.

## Phase 4: docs and clean-up

- [ ] **4.1** `docs/project-context.md`: §10 ticked item, §12 row "Welcome view: Decided".
- [ ] **4.2** This plan: tick, set status to done.
- [ ] **4.3** `mockup/`: owner decides, delete it or add it to `.gitignore`, before the PR.

## Verification

- `pnpm check` passes.
- `pnpm dev`, wide window: with no notes, and after deleting the open note, the view shows; the
  bar opens the Action Panel, New note opens a draft (no keys shown), Search notes opens the
  switcher; Ctrl+K / Ctrl+P still work. Both themes.
- `pnpm desktop:dev`: same, plus Ctrl+N on New note and the Global hotkey row opening the dialog;
  shrink to 380×320 and check nothing is clipped.
- Phone via `pnpm dev:tunnel`: M4 layout, no keycaps, rows centred, every tap works; iPhone and
  Android, both themes.

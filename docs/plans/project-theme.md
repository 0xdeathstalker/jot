# Plan: Warm colour theme, theme setting, account menu

Status: planned (2026-11-18)

Goals:

1. Replace shadcn's default grey theme with a warm "paper and ink" theme with one accent,
   Raycast-style.
2. Add dark mode with a single **Dark mode** on/off toggle. Until the user flips it, the app
   follows the system setting (Windows 11 or iOS). Once flipped, the choice is saved on the
   device and the system setting no longer applies. There is no separate "System" option
   (owner, 2026-11-18).
3. Sidebar footer: show only the avatar (no name) and a gear button. The gear opens a menu with the
   theme choice and **Sign out**, shown in the destructive style.
4. Show every delete, remove and sign-out action in the destructive style throughout the app.

## Palette

Both modes use a muted ink-blue accent, like fountain-pen ink on paper (owner, 2026-11-21: replaces
burnt orange, deep teal and acid moss; see `docs/design.md` §6). Light mode uses a deep ink and
dark mode a soft blue-grey, so it stays readable as text in both (WCAG AA 4.5:1). Contrast ratios are against `--background`.

| Token                                | Light                           | Dark      | Notes                                             |
| ------------------------------------ | ------------------------------- | --------- | ------------------------------------------------- |
| `--background`                       | `#F3EEE3`                       | `#1E1E1C` | cream / charcoal                                  |
| `--foreground`                       | `#111111`                       | `#D8CBB3` | ink 16:1 / sand 10:1                              |
| `--card`, `--popover`                | `#FAF7F0`                       | `#262624` | slightly lifted from the page                     |
| `--primary`                          | `#2F4A7A`                       | `#9DB2D9` | 7.6:1 / 7.8:1; also the link colour and checkbox  |
| `--primary-foreground`               | `#F3EEE3`                       | `#1E1E1C` | text on ink buttons (7.6:1 / 7.8:1)               |
| `--secondary`, `--muted`, `--accent` | `#E9E2D3`                       | `#2A2926` | hover and selected backgrounds, code blocks       |
| `--muted-foreground`                 | `#6B6355`                       | `#A39A8A` | 5.1:1 / 6.0:1                                     |
| `--border`, `--input`                | `#DDD4C2`                       | `#33322F` |                                                   |
| `--ring`                             | `#2F4A7A`                       | `#9DB2D9` | same as `--primary`                               |
| `--destructive`                      | `#C8102E`                       | `#F0566A` | crimson, see "Destructive colour" (5.1:1 / 5.0:1) |
| `--sidebar`                          | `#EBE4D6`                       | `#191918` | a shade off the page, like Raycast                |
| `--sidebar-accent`                   | `#DFD6C4`                       | `#2A2926` | selected / hovered note row                       |
| other `--sidebar-*`                  | same as the matching main token |           |                                                   |
| `--chart-*`                          | unchanged                       | unchanged | not used anywhere                                 |

Use hex values directly. Tailwind v4's `/opacity` modifiers (`bg-destructive/10`,
`ring-foreground/5`) use `color-mix`, which accepts hex.

### Destructive colour

shadcn's default red (`oklch(0.577 0.245 27)` ≈ `#E7000B`) is about 4.1:1 on cream, below
the 4.5:1 that small text such as "Delete" needs. Crimson (`#C8102E` / `#F0566A`) passes 4.5:1 in
both modes. (It was first chosen to stay apart from the burnt orange accent; against blue, red is
the opposite colour, so delete actions stand out even more.)

## Today

- `src/styles/index.css`: shadcn's default neutral theme in `:root` and `.dark`. **Nothing sets
  the `.dark` class**, so the app is light-only; the `dark:` classes in `src/components/ui/*` and
  `src/editor/link-box.tsx` never apply.
- White is hard-coded in `index.html` (`theme-color`), `vite.config.ts` (manifest), and
  `public/privacy.html` / `public/terms.html`.
- `src/auth/account-footer.tsx`: avatar, name, ghost **Sign out** button, and the "notes not
  synced" alert. `InviteFriend` sits above it.
- Already destructive: note-list **Delete / Leave note** (`DropdownMenuItem variant="destructive"`),
  the share dialog's remove-person button, and the confirm buttons in the leave/delete and sign-out
  alerts.
- Not destructive yet: footer **Sign out**, the link box's two **Remove link** buttons
  (`src/editor/link-box.tsx`), and **Remove from my list** (`src/features/sharing/no-access.tsx`).

## Phases

Each phase ends in a working app and is its own commit. Do them in order: later phases rely on
earlier ones (the toggle needs the dark tokens, the destructive sweep needs the crimson). Tick a
task when it is done.

### Phase 1: New palette (light mode only)

The app looks warm in light mode. Dark mode exists in CSS, but nothing turns it on yet (the same
as today).

- [x] **1.1 Light tokens.** `src/styles/index.css` `:root`: replace the `oklch` values with the
      light column of the palette, including the crimson `--destructive`. Add
      `color-scheme: light;`.
- [x] **1.2 Dark tokens.** Same file, `.dark` block: the dark column. Add `color-scheme: dark;`.
      Keep `@custom-variant dark (&:is(.dark *));` (class-based, needed for the toggle).
- [x] **1.3 Text cursor.** `.ProseMirror`: add `caret-color: var(--primary);`.
- [x] **1.4 "Current" dot.** `src/features/notes/note-list.tsx` (~121): `bg-destructive` →
      `bg-primary`, so red only ever means "removes something".
- [x] **1.5 Manifest.** `vite.config.ts`: `theme_color` and `background_color` → `#F3EEE3`.
      Update the comment ("white because the app has no dark mode yet").
- [x] **1.6 Static pages.** `public/privacy.html`, `public/terms.html`:
      `background: #F3EEE3; color: #111111;`.

Check: `pnpm dev`. The page, sidebar, selected row, popovers (link box, note menu), dialogs,
toolbar, checklist, link, code block and blockquote all look right, and the focus ring is ink blue.
`/privacy` and `/terms` are cream. Add `class="dark"` to `<html>` in devtools: the dark palette
looks right too. `pnpm check`.

### Phase 2: Dark mode switching (no UI yet)

The app follows the system theme or a saved choice, with no flash on start. It can be tested
from devtools before the menu exists.

- [x] **2.1 Meta tag.** `index.html`: replace `<meta name="theme-color" content="#ffffff" />` with
      one tag, `content="#F3EEE3"`. Media-query meta pairs cannot follow a manual choice, so the
      script and the hook update this one tag.
- [x] **2.2 Startup script.** An inline `<script>` in the `<head>` of `index.html`, so it runs
      before anything paints (React runs too late). It:
  - reads `localStorage["jot-theme"]` (`"light"` or `"dark"`; missing means the user never
    toggled, so follow the system), inside `try`, because storage can be blocked;
  - uses `matchMedia("(prefers-color-scheme: dark)")` when the key is missing;
  - sets `document.documentElement.classList.toggle("dark", isDark)`, and the meta to `#F3EEE3`
    or `#1E1E1C`.

  There is no CSP in the Worker or `public/`, so an inline script needs no header change.

- [x] **2.3 Hook.** New `src/hooks/use-theme.ts`: `useTheme(): [isDark, setDark]`.
  - `isDark` starts from the class the script already set, so the first render is correct.
  - `setDark(on)` writes `localStorage["jot-theme"]`, toggles `.dark` and updates the meta. It
    uses the same rule as the script; keep both short so they are easy to compare.
  - While no choice is saved, it listens to the `prefers-color-scheme` change event, so the open
    app follows Windows live. Once a choice is saved, the listener does nothing.
  - There is no way back to "follow the system" from the UI (the owner's call: fewer options).
    Clearing site data resets it. The setting is per device. Sign-out's wipe
    (`src/sync/local-data.ts`) clears only its own keys, so the theme survives a sign-out.

Check:

1. With no `jot-theme` key, switch Windows between light and dark (Settings → Personalization →
   Colors): the app follows without a reload.
2. In devtools run `localStorage.setItem("jot-theme", "dark")` and reload: dark, with **no cream
   flash**. Switch Windows to light: it stays dark.
3. `pnpm check`.

### Phase 3: Account footer and gear menu

The footer shows only the avatar and a gear. The gear menu holds the Dark mode toggle and
Sign out.

- [x] **3.1 Layout.** `src/auth/account-footer.tsx`: remove the visible name. The row is the
      avatar (left) and a gear button (right: `variant="ghost"`, `size="icon-sm"`,
      `Settings02Icon`). Put the name and email in the avatar's `title`, and give the gear
      `aria-label="Settings for <name>"`.
- [x] **3.2 Menu.** The gear is a `DropdownMenuTrigger` (`dropdown-menu.tsx` is already
      installed). The menu has a **Mode** row: the label on the left and, on the right, a
      pill-shaped pair of round icon buttons, moon (`Moon02Icon`) then sun (`Sun03Icon`), with the
      current mode filled. No check mark (owner, 2026-11-21). It is a Base UI menu `RadioGroup`, so
      arrow keys reach it and picking a mode keeps the menu open. Then a `DropdownMenuSeparator`
      and the Sign out item from 3.3.
- [x] **3.3 Sign out.** `DropdownMenuItem variant="destructive"` **Sign out** (`Logout03Icon`),
      calling the existing `handleSignOut`. Remove the old ghost button.
- [x] **3.4 Busy state.** While it syncs before signing out (`busy`), disable the gear and show a
      muted "Syncing…" next to the avatar (the menu has already closed).
- [x] **3.5 Leave alone.** The "notes not synced" `AlertDialog` (already destructive) and
      `InviteFriend` above the row stay as they are.

Check:

1. The footer shows the avatar and gear only. Hovering the avatar shows the name.
2. Tab to the gear and open it with Enter. Pick moon, then sun: it survives a reload, and the
   filled icon matches the current mode.
3. Sign out while online: you are signed out. Sign out offline with an unsynced note: the
   "not synced" dialog still appears.
4. Phone width: the footer still fits inside the sidebar sheet.
5. `pnpm check`.

### Phase 4: Destructive actions everywhere

Every action that removes something is crimson, and nothing else is.

- [ ] **4.1 Link box, edit field.** `src/editor/link-box.tsx` (~271) **Remove link**:
      `variant="ghost"` → `variant="destructive"`.
- [ ] **4.2 Link box, preview.** Same file (~214): give `PreviewButton` an optional `variant`
      prop (default `"ghost"`), and pass `"destructive"` only for **Remove link**.
- [ ] **4.3 No-access screen.** `src/features/sharing/no-access.tsx` **Remove from my list**:
      `variant="destructive"`.
- [ ] **4.4 Confirm the rest.** Note list **Delete / Leave note**, the share dialog's remove
      button, and the leave/delete and sign-out alert buttons are already destructive. They only
      need a look.

Check: in both modes, these are all crimson and clearly different from the ink-blue accent:
Sign out, **Delete / Leave note**, the share-dialog remove button, both **Remove link** buttons,
**Remove from my list**, and the alert buttons. `pnpm check`.

### Phase 5: Ink button review

Every default `<Button>` (no `variant`) is now **filled ink blue**. Keep ink blue for each screen's
main action only.

- [ ] **5.1 Screens with a main action** (keep ink blue; check how it looks): `login-screen`
      (Continue with Google), `join-page` (Join), `share-link-page`, and `share-dialog` /
      `invite-friend` (Copy link).
- [ ] **5.2 Everyday actions** (likely `ghost` / `outline`): `notes-sidebar` (New note),
      `toolbar`, `editor`, `link-box`, `install-hint`. Decide each one on screen with the owner.

Check: click through every screen in both modes. Each screen has at most one ink-blue button.
`pnpm check`.

### Phase 6: Installed app, phone and docs

- [ ] **6.1 Windows PWA.** `pnpm build && pnpm preview`, then install in Edge: the title bar
      follows the toggle and the system setting.
- [ ] **6.2 iPhone** (after deploy), installed app: the status bar area matches in both modes. If
      dark shows a white strip, try `apple-mobile-web-app-status-bar-style` = `black-translucent`
      (it needs `env(safe-area-inset-top)` padding at the top).
- [ ] **6.3 Docs.** `docs/project-context.md` §12: add a "Colour theme" row (warm palette; Dark
      mode toggle in the gear menu, per device, follows the system until first toggled). §5: add
      `src/hooks/use-theme.ts`. Set this plan's Status to done.

## Left as is (checked)

- `src/components/ui/*`: they use tokens and `dark:` classes, so they follow the theme without edits.
  The `bg-black/80` overlays are fine in both modes.
- `src/features/sharing/caret-user.ts`: cursor colours are readable on both backgrounds.
  The blue `#2563eb` was swapped for cyan `#0891b2` to stay apart from the ink-blue accent.
- `src/editor/shrink-image.ts` `#fff`: flattening an image for JPEG is not a theme colour.
- App icons (`public/*.svg`, `pwa-assets.config.ts`): ink + white works on any background. A
  matching variant is a separate decision (edit both SVGs and `resizeOptions.background`, run
  `pnpm pwa:icons`).

## Watch out

- The inline script (2.2) and `use-theme.ts` (2.3) repeat the same small rule. If one changes,
  change the other.
- The installed app picks up the new CSS on the next launch after deploy (service worker
  auto-update).

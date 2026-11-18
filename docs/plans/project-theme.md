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

Both modes use a burnt orange accent. Light mode uses a darker orange and dark mode a brighter one,
so it stays readable as text in both (WCAG AA 4.5:1). Contrast ratios are against `--background`.

| Token                                | Light                           | Dark      | Notes                                                 |
| ------------------------------------ | ------------------------------- | --------- | ----------------------------------------------------- |
| `--background`                       | `#F3EEE3`                       | `#1E1E1C` | cream / charcoal                                      |
| `--foreground`                       | `#111111`                       | `#D8CBB3` | ink 16:1 / sand 10:1                                  |
| `--card`, `--popover`                | `#FAF7F0`                       | `#262624` | slightly lifted from the page                         |
| `--primary`                          | `#B8441A`                       | `#E8693A` | 4.7:1 / 5.2:1; also the link colour and checkbox      |
| `--primary-foreground`               | `#F3EEE3`                       | `#1E1E1C` | text on orange buttons (4.7:1 / 5.2:1)                |
| `--secondary`, `--muted`, `--accent` | `#E9E2D3`                       | `#2A2926` | hover and selected backgrounds, code blocks           |
| `--muted-foreground`                 | `#6B6355`                       | `#A39A8A` | 5.1:1 / 6.0:1                                         |
| `--border`, `--input`                | `#DDD4C2`                       | `#33322F` |                                                       |
| `--ring`                             | `#D9541E`                       | `#E8693A` | the original burnt orange (focus rings need only 3:1) |
| `--destructive`                      | `#C8102E`                       | `#F0566A` | crimson, see "Destructive colour" (5.1:1 / 5.0:1)     |
| `--sidebar`                          | `#EBE4D6`                       | `#191918` | a shade off the page, like Raycast                    |
| `--sidebar-accent`                   | `#DFD6C4`                       | `#2A2926` | selected / hovered note row                           |
| other `--sidebar-*`                  | same as the matching main token |           |                                                       |
| `--chart-*`                          | unchanged                       | unchanged | not used anywhere                                     |

Use hex values directly. Tailwind v4's `/opacity` modifiers (`bg-destructive/10`,
`ring-foreground/5`) use `color-mix`, which accepts hex.

### Destructive colour

The theme change does **not** alter it today: `--destructive` keeps shadcn's red
(`oklch(0.577 0.245 27)` ≈ `#E7000B` light, `oklch(0.704 0.191 22)` ≈ `#FF6467` dark). But
with the new palette it causes two problems, so this plan changes it:

- It is the same hue family as the burnt orange accent (red-orange), so "Delete" and an ordinary
  orange action look alike.
- Shadcn's red on cream is about 4.1:1, below the 4.5:1 that small text such as "Delete" needs.

Crimson (`#C8102E` / `#F0566A`) moves it toward pink-red, so it reads as clearly different from
orange and passes 4.5:1 in both modes.

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

## Changes

### 1. Theme tokens: `src/styles/index.css`

- Keep `@custom-variant dark (&:is(.dark *));` (class-based, needed for a manual choice).
- `:root`: the light values above, plus `color-scheme: light;`.
- `.dark`: the dark values above, plus `color-scheme: dark;` (scrollbars, native checkbox, form
  controls).
- `.ProseMirror`: add `caret-color: var(--primary);` (orange text cursor).
- Nothing else in the editor CSS changes: links, checkboxes, code, blockquote, hr and the image
  outline already use tokens.

### 2. No flash on start: inline script in `index.html`

The class must be on `<html>` before first paint, or a dark-mode user sees a cream flash on every
launch. React runs too late for this. Add a small inline `<script>` in `<head>` that:

- reads `localStorage["jot-theme"]` (`"light"` or `"dark"`; missing means the user never
  toggled, so follow the system), inside `try`, because storage can be blocked;
- uses `matchMedia("(prefers-color-scheme: dark)")` when it is missing;
- sets `document.documentElement.classList.toggle("dark", isDark)`;
- sets the `theme-color` meta to `#F3EEE3` or `#1E1E1C`.

Replace `<meta name="theme-color" content="#ffffff" />` with one tag, `content="#F3EEE3"`, that the
script and the hook update. Media-query meta pairs cannot follow a manual choice. The installed
Windows app (Edge/Chrome) colours its title bar from this tag and updates it live.

There is no CSP in the Worker or `public/`, so an inline script needs no header change.

### 3. Theme state: `src/hooks/use-theme.ts` (new)

- `useTheme(): [isDark, setDark]`.
- `isDark` starts from the class the inline script already set, so the first render is correct.
- `setDark(on)` writes `localStorage["jot-theme"]` (`"dark"` or `"light"`), toggles `.dark`, and
  updates the meta tag. It uses the same rules as the inline script; keep both short so they are
  easy to compare.
- While no choice is saved, it listens to the `prefers-color-scheme` change event, so switching
  Windows to dark updates an open app live. After the first toggle the saved choice wins and the
  listener does nothing.
- There is no way back to "follow the system" from the UI (the owner's call: fewer options).
  Clearing site data resets it.
- The setting is per device and not synced. Sign-out's local wipe (`src/sync/local-data.ts`) only
  clears its own keys, so the theme survives a sign-out.

### 4. Account footer: `src/auth/account-footer.tsx`

New layout: the avatar on the left, a gear button on the right (`variant="ghost"`,
`size="icon-sm"`, hugeicons `Settings02Icon`), and no visible name.

- The name and email stay in the avatar's `title` and as the gear's
  `aria-label="Settings for <name>"`, so they are still reachable by hover and by screen readers.
- The gear is a `DropdownMenuTrigger` (`src/components/ui/dropdown-menu.tsx` is already
  installed). The menu contains:
  - `DropdownMenuCheckboxItem` **Dark mode** (`Moon02Icon`), `checked={isDark}`,
    `onCheckedChange={setDark}`, from `useTheme`;
  - `DropdownMenuSeparator`;
  - `DropdownMenuItem variant="destructive"`: **Sign out** with `Logout03Icon`, calling the
    existing `handleSignOut`.
- While it syncs before signing out (`busy`), disable the gear and show a muted "Syncing…" next to
  the avatar, since the menu has already closed.
- The "notes not synced" `AlertDialog` stays as it is (its button is already destructive).
- `InviteFriend` stays above the row, unchanged.

### 5. Destructive actions across the UI

| Where                                                             | Today                   | Change                                                                    |
| ----------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Account menu **Sign out**                                         | ghost button            | destructive menu item (step 4)                                            |
| `src/editor/link-box.tsx` edit box **Remove link** (~271)         | `variant="ghost"`       | `variant="destructive"`                                                   |
| `src/editor/link-box.tsx` preview **Remove link** (~214)          | `PreviewButton` (ghost) | let `PreviewButton` take a `variant` prop; pass `"destructive"` here only |
| `src/features/sharing/no-access.tsx` **Remove from my list**      | default (orange) button | `variant="destructive"`                                                   |
| Note list **Delete / Leave**, share dialog remove, alert confirms | already destructive     | none: they pick up the new crimson                                        |

One more place uses the destructive colour by mistake: the **"Current" dot** in
`src/features/notes/note-list.tsx` (~121) is `bg-destructive`, a red dot next to the open note.
Change it to `bg-primary` (orange), so red only ever means "removes something".

### 6. Manifest: `vite.config.ts`

`theme_color: "#F3EEE3"`, `background_color: "#F3EEE3"` (the manifest takes one value; it is the
splash colour, and the meta tag takes over after launch). Update the comment ("white because the
app has no dark mode yet").

### 7. Static pages: `public/privacy.html`, `public/terms.html`

`background: #F3EEE3; color: #111111;`. No toggle and no dark mode: people see these pages once.

### 8. Docs

- `docs/project-context.md` §12: add a "Colour theme" row (warm palette; a Dark mode toggle in the
  gear menu, per device; follows the system until first toggled).
- §5 layout: add `src/hooks/use-theme.ts`.
- This plan: set Status when done.

## Left as is (checked)

- `src/components/ui/*`: they use tokens and `dark:` classes, so they follow the theme without edits.
  The `bg-black/80` overlays are fine in both modes.
- `src/features/sharing/caret-user.ts`: cursor colours are readable on both backgrounds.
  `#ea580c` is close to the accent; swap it only if it causes confusion.
- `src/editor/shrink-image.ts` `#fff`: flattening an image for JPEG is not a theme colour.
- App icons (`public/*.svg`, `pwa-assets.config.ts`): ink + white works on any background. A
  matching variant is a separate decision (edit both SVGs and `resizeOptions.background`, run
  `pnpm pwa:icons`).

## Watch out

- Every default `<Button>` (no `variant`) becomes **filled orange**: in `login-screen`,
  `install-hint`, `editor`, `link-box`, `toolbar`, `notes-sidebar`, `invite-friend`, `join-page`,
  `share-dialog`, `share-link-page`. Look at each screen. Keep orange for the main action only
  (Continue with Google, Join, Copy link); use `ghost` / `outline` for everyday actions.
- The inline script and `use-theme.ts` repeat the same small rule. If one changes, change the other.
- The installed app picks up the new CSS on the next launch after deploy (service worker
  auto-update).

## Check

1. Fresh profile (or clear `jot-theme`), then switch Windows between light and dark (Settings →
   Personalization → Colors): the open app follows without a reload, and the toggle's check
   matches.
2. `pnpm dev`, in light mode: page, sidebar, selected row, popovers, dialogs, toolbar, checklist,
   link, code and blockquote all look right. The focus ring is orange.
3. Gear → **Dark mode** on: everything switches at once. Reload: still dark, with **no cream
   flash**. Now switch Windows to light: the app stays dark (the saved choice wins). Toggle off:
   light, and it stays light after a reload.
4. Destructive check: Sign out, note **Delete / Leave**, share dialog remove, both **Remove link**
   buttons and **Remove from my list** are crimson, and clearly not the orange accent, in both
   modes. The "Current" dot is orange.
5. Footer shows the avatar and gear only. Hovering the avatar shows the name. Tab to the gear and
   open it with Enter (keyboard access).
6. Sign out with an unsynced note (offline): the "not synced" dialog still appears.
7. `pnpm build && pnpm preview`, install in Edge: the title bar follows each choice.
8. iPhone (after deploy), installed app: the status bar area matches in both modes. If dark shows a
   white strip, try `apple-mobile-web-app-status-bar-style` = `black-translucent`, which needs
   `env(safe-area-inset-top)` padding at the top.
9. `/privacy` and `/terms` show cream.
10. `pnpm check`.

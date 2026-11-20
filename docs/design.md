# Jot: Design Brief

> What Jot should look and feel like, and the rules any colour scheme must follow.
> Use it to design or judge a palette. The current colour values and the work to apply them
> live in `docs/plans/project-theme.md`. Architecture and decisions live in
> `docs/project-context.md`.

---

## 1. Aim and purpose

Jot is a **fast, private notes app for one person and a few people they trust**. You open it,
write a thought, and it is on your other devices within about a second, even if you were
offline when you wrote it. It is a Raycast Notes–style app: small, quick, keyboard-friendly,
and out of the way.

What it promises its users:

- **Instant.** Typing never waits on the network. There is never a "saving…" spinner.
- **Everywhere.** One installable app on Windows (Edge/Chrome) and iPhone (Home Screen), with no
  app stores.
- **Offline-first.** Edits made offline merge by themselves when the device reconnects.
- **Private.** Google sign-in, with access limited to an allowlist and invite links. Notes are
  shared only with up to 2 known people per note, never publicly.
- **Small and free.** Runs on Cloudflare's free plan, has few dependencies, and adds no features
  for their own sake.

Who uses it: the owner and a handful of invited friends (each original user can bring in at most 3
people). They use it every day, in short bursts (a quick capture) and in long sessions (writing,
lists, plans), at their desk on Windows and on the go on an iPhone.

## 2. What the design must say

The look should express the promises above. In priority order:

1. **Calm.** It is a place to think. The interface stays quiet and the writing is the loudest
   thing on screen.
2. **Fast.** Crisp, light and precise, like Raycast: tight spacing, small radius
   (`--radius: 0.2rem`), no heavy chrome, no decorative animation.
3. **Personal.** Warmer than a work tool such as Slack or Jira: a private notebook, not a
   dashboard.
4. **Trustworthy.** Destructive actions (delete, remove someone, sign out) are unmistakable,
   because this is someone's only copy of their thoughts.
5. **Its own.** It must not look like a known brand (see §6).

Words that fit: quiet, focused, paper-like, quick, personal, honest.
Words that don't: playful, loud, corporate, techy-neon, luxury.

## 3. Where colour shows up

A notes app is mostly text on a background. Colour has few jobs, so each one should be
deliberate.

| Surface                        | What it is                                               | Token(s)                                           |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| Page / editor                  | Where you read and write for long stretches              | `--background`, `--foreground`                     |
| Sidebar                        | Note list, search, account footer                        | `--sidebar`, `--sidebar-foreground`                |
| Selected / hovered note row    | Which note is open, where the pointer is                 | `--sidebar-accent`                                 |
| Secondary text                 | "Edited 2h ago", character count, hints, ticked tasks    | `--muted-foreground`                               |
| Hover backgrounds, code blocks | Toolbar toggles, menu items, inline code, `pre`          | `--muted`, `--accent`, `--secondary`               |
| Popovers, menus, dialogs       | Link box, note menu, share dialog, gear menu             | `--popover`, `--card`                              |
| Lines                          | Borders, dividers, inputs, blockquote bar, `hr`          | `--border`, `--input`                              |
| **Accent**                     | Main button per screen, links, checkboxes, "Current" dot | `--primary`, `--primary-foreground`                |
| Focus                          | Keyboard focus ring, selected image outline              | `--ring`                                           |
| **Destructive**                | Delete, Leave, Remove person, Remove link, Sign out      | `--destructive`                                    |
| Text cursor                    | Your own caret in the editor                             | `caret-color` on `.ProseMirror` (uses `--primary`) |
| Other people's cursors         | Live cursors in a shared note (white labels)             | fixed list in `src/features/sharing/caret-user.ts` |
| Outside the app                | Windows title bar, iOS status bar, splash, static pages  | `theme-color` meta, manifest, `public/*.html`      |

The accent appears in only a few places: one main button per screen, links, checkboxes and the
"Current" dot. Everyday buttons (New note, toolbar) are `ghost` / `outline`, not the accent.

## 4. Rules any palette must follow

### Modes

- **Light and dark, both first-class.** Many Windows 11 users run dark mode, and Raycast users
  mostly live in it. Each mode gets its own tuned values, not an inverted copy.
- On first launch the app follows the system setting. After that, a **Dark mode** toggle in the
  gear menu decides (owner, 2026-11-18).
- Dark mode is not pure black. Use a soft near-black so text does not glare and shadows still
  show.

### Contrast (WCAG AA)

| Pair                                                      | Minimum               |
| --------------------------------------------------------- | --------------------- |
| Body text on page, sidebar, popover                       | 4.5:1 (aim for 12:1+) |
| Muted text on page **and** on the selected-row background | 4.5:1                 |
| Accent as text (links) on page and on `--muted`           | 4.5:1                 |
| Text on an accent button                                  | 4.5:1                 |
| Destructive text on page and on its 10% tint              | 4.5:1                 |
| Focus ring, borders that carry meaning, icons             | 3:1                   |

Check each pair in **both** modes. A colour that passes on the page can fail on `--muted` or
`--sidebar-accent`; that is how ochre was ruled out.

### Accent and destructive

- **One accent.** No second brand colour.
- **Destructive must be clearly different from the accent** in hue, not just in shade. Red only
  ever means "removes something". Nothing else (status dots, badges) may use it.
- Keep the accent away from the colours in the shared-cursor list, or swap that cursor colour.

### Long reading

- The page colour is what users look at for hours. Prefer a low-saturation tint (or a neutral)
  over strong colour. A subtle warmth is easier on the eyes than pure white.
- Text is near-black or near-white, not a coloured grey that reduces contrast.

### Platform

- **Windows PWA:** the title bar takes the `theme-color` meta, so it must match the page colour in
  each mode.
- **iPhone PWA:** the status bar and safe areas should blend with the page. Dark mode may need
  `black-translucent` (see the plan).
- **Icons** (`public/icon-source.svg`, `public/favicon.svg`) are ink on white today. If the palette
  changes, the icon can follow, but it must still read at 16 px in a browser tab.

### Technical

- Colours are CSS variables in `src/styles/index.css` (`:root` = light, `.dark` = dark). Tailwind
  and every shadcn component read them, so **one file changes the app**. Hex values are fine.
- Hard-coded copies to keep in sync: `index.html` (`theme-color`), `vite.config.ts` (manifest
  `theme_color`, `background_color`), `public/privacy.html` and `public/terms.html`.
- Don't hand-edit `src/components/ui/*` to change colours. Change the tokens.

## 5. Typography and shape (fixed)

These are already decided. A palette should suit them, not change them.

- **Font:** Figtree Variable (self-hosted, so it works offline). A friendly, rounded sans.
- **Editor text:** 16 px minimum (iOS zooms in on smaller inputs), line height 1.5, 0.4em between blocks (owner, 2026-11-20).
- **Radius:** small, `0.2rem` base: buttons and toggles are rectangles, not pills.
- **Density:** compact, Raycast-like. Two-line note rows in the sidebar.

## 6. Tried and rejected

Record every palette decision here, so the same ground is not covered twice.

| Palette                                            | Verdict                      | Why                                                                |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ |
| shadcn default (pure white / greys)                | Replaced                     | Generic and cold; no identity                                      |
| Navy + hot pink                                    | Rejected                     | Too loud for a calm daily tool                                     |
| Charcoal + sand + electric blue                    | Rejected                     | Generic blue clashes with warm sand                                |
| Navy + cream + coral                               | Rejected                     | Coral too weak for text on cream                                   |
| Forest green + sand beige                          | Rejected                     | No accent colour to mark focus, selection or actions               |
| Cream `#F3EEE3` + ink + **burnt orange** `#D9541E` | Rejected (owner, 2026-11-19) | Cream with warm orange looks like Anthropic / Zen Browser branding |
| Same cream + **deep teal** `#1F6F6B` / `#5FBFB4`   | Rejected (owner, 2026-11-19) | Did not look good                                                  |
| Ochre accent on cream                              | Ruled out                    | About 4.3:1 on `--muted`: fails AA for links and checkboxes        |
| Plum accent                                        | Not tried                    | Too close to the crimson destructive                               |
| Same cream + **acid moss** `#265C00` / `#A3E635`   | Rejected (owner, 2026-11-20) | Tried in the app and reverted (contrast passed: 7.0:1 / 11.1:1)    |
| Same cream + **sage** `#46604F` / `#A8BFAE`        | Not chosen (2026-11-21)      | Calm, but links stand out least; green next to red delete          |
| Same cream + **heather** `#5A4E7C` / `#B4A9D6`     | Not chosen (2026-11-21)      | Violet sits nearer the crimson than blue does                      |
| Same cream + **ink blue** `#2F4A7A` / `#9DB2D9`    | Chosen (owner, 2026-11-21)   | Calm, paper-and-ink; 7.6:1 / 7.8:1 on page; blue caret → cyan      |

In use: the cream / charcoal surfaces, the ink-blue accent and the crimson
destructive (`#C8102E` light, `#F0566A` dark, which passes 4.5:1 in both modes).

## 7. How to propose a palette

1. Write the light and dark value for every token in §3 (the plan's palette table is the
   template).
2. Check every pair in §4's contrast table in both modes.
3. Make sure the accent and destructive are clearly different hues, and neither looks like a
   known brand.
4. Try it in the app: change `src/styles/index.css`, run `pnpm dev`, and look at the login screen,
   sidebar, editor (links, checklist, code), a popover and a dialog. Add `class="dark"` to `<html>`
   to see dark mode until the toggle exists.
5. Record the decision in §6 and in `docs/project-context.md` §12, then update the plan's palette
   table.

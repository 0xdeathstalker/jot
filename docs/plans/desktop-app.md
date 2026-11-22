# Plan: Windows desktop app (Raycast Notes style)

Status (2026-11-22): merged (PR #8) and released as `desktop-v0.1.0`. Left: the install test (4.5,
with 2.4) and the first self-update, which needs a second release (4.3).

Goal: a Windows app that a global hotkey brings up, like Raycast Notes, with everything the web app
already does (editor, offline, sync, sharing, theme, Google login). The web app and the iPhone PWA
stay one React codebase and keep working as they are.

## Decisions (owner, 2026-11-21)

| Topic            | Choice                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shell            | **Tauri v2** (uses the WebView2 that ships with Windows 11). Not Electron: about 10x the installer size and more memory, no gain                                                           |
| What it loads    | **The live site** (`https://jot.deathstalker.dev`), not bundled files. Same origin, so cookie auth, sockets, service worker and IndexedDB work unchanged, and a web deploy updates the app |
| Window           | One window, like Raycast. Frameless, rounded, **always on top**. Remembers size and position                                                                                               |
| Focus loss       | The window stays up. No hide on blur                                                                                                                                                       |
| Close / minimize | Minimize works as usual. **Close hides to the tray** (quitting would kill the hotkey). Quit is in the tray menu                                                                            |
| Taskbar          | **Tray only**, no taskbar button. Launches at login, hidden                                                                                                                                |
| Hotkey           | **User-set**, saved on the device. Toggles the window. A suggested default (`Ctrl+Alt+J`) until the user picks one                                                                         |
| Who uses it      | The owner and friends (still gated by `ALLOWED_EMAILS` / invites)                                                                                                                          |
| Code signing     | **None for now** (it is paid, about $10/month). Friends click through SmartScreen ("More info, then Run anyway"). Revisit if it bothers anyone                                             |
| Shell updates    | `tauri-plugin-updater` with GitHub Releases (free). The web part updates itself with each deploy                                                                                           |

## Why the live site, not bundled files

Bundled files run on `tauri://localhost`, so calls to the Worker are cross-origin. The session
cookie would be third-party and not sent on the WebSocket upgrade, which forces token auth and CORS
and breaks "one origin, no CORS" (context §2). Loading the live site keeps everything as it is.

The cost: the site must be allowed to call the shell's commands (Tauri `remote.urls` capability).
Expose only harmless commands (show/hide, always on top, set hotkey). Never file system or shell
access: anything an XSS on the site could reach, it would reach.

## Open risk: Google sign-in inside the app

**Closed (2026-11-22): login works in WebView2.** Kept as the fallback if Google starts blocking
it. Google blocks OAuth in some embedded webviews (`disallowed_useragent`). If it ever blocks
WebView2:

1. The app opens Google login in the system browser.
2. After login the Worker redirects to `jot://auth?code=…` (Tauri `deep-link` plugin).
3. The app sends the code to a new Worker endpoint, which sets the session cookie in the webview.

The code must be single-use, expire in about 60 seconds and be bound to the request that started
it. This is auth code: it gets its own review.

## Phases

Each phase ends in something that works and is its own commit. Tick a task when it is done.

### Phase 1: Spike (about a day)

Answer the unknowns before building anything for real.

- [x] **1.1** Install Rust (`rustup`) and the MSVC build tools. `src-tauri/` with a window that
      loads the live site.
- [x] **1.2** Google login inside the window: works, or `disallowed_useragent`?
- [x] **1.3** Offline start: load once, go offline, restart the app. The notes open.
- [x] **1.4** Sync: edit in the app and in a browser tab at the same time. Both update within a
      second.
- [x] **1.5** Numbers: installer size, memory with the window shown and hidden, time from hotkey to
      a visible window (target under 100 ms when hidden, not closed).

Outcome (2026-11-22, branch `spike/desktop-app`): **go.**

| Check          | Result                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google login   | Works inside WebView2. No deep-link flow needed; the "Open risk" section above is closed                                                                                               |
| Offline start  | Restarted offline: the notes that were open come back                                                                                                                                  |
| Sync           | App and a browser tab stay in step                                                                                                                                                     |
| Hotkey         | Show + focus 5–42 ms, hide 6–30 ms (debug build, window calls only)                                                                                                                    |
| Size           | Release `jot.exe` 9.5 MB. The NSIS installer was not built: the tool download (2.3 MB from GitHub) timed out on a slow link. Build it on CI (phase 4)                                  |
| Memory (shown) | About 185 MB private across 8 processes (`jot` 4 MB, the rest WebView2). Debug shell, one note open. Hidden-window memory not measured yet; check it in phase 2 with the release build |

The app keeps its own WebView2 profile (`dev.deathstalker.jot`), separate from Edge, so it needs
its own sign-in once.

### Phase 2: Shell

All in `src-tauri/src/lib.rs`. Two items moved to phase 3, because they need the React side:
frameless (without the drag bar of 3.3 the window could not be moved) and the tray's New note.

- [x] **2.1** Always-on-top window. Hidden at start, shown when the page has finished loading (no
      blank flash, so no background colour needed).
- [x] **2.2** Global hotkey (`Ctrl+Alt+J` until 3.6) toggles it, like Raycast: hides it if it is up
      and focused, otherwise brings it up and focuses it.
- [x] **2.3** Close and minimize hide to the tray (minimize too: without a taskbar button a
      minimized window sits as a stub above the taskbar). No taskbar button (`skipTaskbar`). Tray:
      left click toggles on visibility alone (the click itself takes focus from the window); menu
      has Show Jot, Launch at login (checkbox), Quit Jot.
- [ ] **2.4** Launch at login with `--hidden` (`autostart`): turned on once on the first run of a
      release build, then the tray checkbox owns it. Never in debug builds. One instance only
      (`single-instance`): a second launch brings up the running one. Single instance tested;
      launch at login is written but needs an installed build to test (phase 4).
- [x] **2.5** Remember size and position (`window-state`). Saved on every hide, not only on a
      clean exit, so a kill or shutdown keeps them.

### Phase 3: Desktop UI in the shared React code

- [x] **3.1** `isDesktop()` in `src/lib/platform.ts`. When true, add `desktop` to `<html>` and a
      Tailwind `desktop:` variant (same pattern as `dark:`).
- [x] **3.2** `src/desktop/`: everything that talks to Tauri, loaded with a dynamic `import()` only
      when `isDesktop()`. `@tauri-apps/api` is imported nowhere else (add a lint rule like the
      `fetch` one), so the web and phone bundles do not change.
- [x] **3.3** Frameless, rounded window (`decorations: false`, moved from 2.1) with a drag bar at
      the top (`data-tauri-drag-region`), with minimize and close.
- [x] **3.3b** Tray **New note** (moved from 2.3): the shell emits an event, `src/desktop/` creates
      the note.
- [x] **3.4** Small-window layout: compact spacing (`desktop:`). Below 768 px the sidebar is already
      a sheet, so it starts closed with no extra code.
- [x] **3.5** Note switcher (`src/features/notes/note-switcher.tsx`): `Ctrl+P` / `⌘K` opens it
      **everywhere**, web and phone too (owner, 2026-11-22; on the web it replaces print). Same
      search as the sidebar; arrows and Enter. `Ctrl+N` new note, desktop only (browsers keep it
      for a new window). The page stays loaded while hidden, so it reopens on the same note.
- [x] **3.6** Hotkey setting: gear menu **Global hotkey…** (desktop only,
      `src/desktop/hotkey-dialog.tsx`). Press a combo with Ctrl or Alt; the shell registers the
      new one before dropping the old, so "taken" keeps the current one. Saved by the shell in
      `hotkey.txt` (works even if the page cannot load).
- [x] **3.7** Owner feedback (2026-11-22):
  - The switcher and the phone sidebar blur what is behind them instead of darkening it
    (`overlayClassName` on `DialogContent`; the drawer backdrop in `sidebar.tsx`).
  - The sidebar toggle shows its keys (Ctrl B) on hover, no label (`sidebar-toggle.tsx`). The
    tooltip uses the popover colours, not the bright foreground.
  - Fix: the first **Global hotkey…** click blanked the app. Its lazy chunk failed to load (the
    dev server was bundling `@tauri-apps/api/core` for the first time), `React.lazy` threw, and
    nothing caught it. `lazyOrReload()` (`src/lib/lazy.ts`) reloads once instead. The same
    happens in production when a deploy replaces chunks while the window stays open.

### Phase 4: Packaging and updates

**Order matters: merge to `main` (web deploy) before the first release.** The release app loads the
live site, and without phase 3 deployed it has no title bar, so a frameless window could not be
moved or closed.

- [x] **4.1** `pnpm desktop:dev` (`tauri dev`: runs `pnpm dev` and the shell on `localhost:5173`)
      and `pnpm desktop:build` (`tauri build`; locally it needs `TAURI_SIGNING_PRIVATE_KEY` set to
      the key file path). Jot's icon from `public/icon-source.svg` (`pnpm tauri icon`), Windows
      sizes only. `frontendDist` is the live site URL: nothing to build or embed.
- [x] **4.2** `.github/workflows/desktop-release.yml`: a `desktop-v*` tag builds on a Windows
      runner (free, public repo) with `tauri-action` and publishes a GitHub Release with the NSIS
      installer and `latest.json`. To release: bump `version` in `src-tauri/tauri.conf.json`,
      commit, then tag `desktop-v<version>`. Needs the `TAURI_SIGNING_PRIVATE_KEY` repo secret.
      Also uploads the installer as `Jot-setup.exe`, so
      `releases/latest/download/Jot-setup.exe` is a download link that never changes (README).
      Done: `desktop-v0.1.0` built in about 7 minutes (2026-11-22).
- [ ] **4.3** Updater (`tauri-plugin-updater`, release builds only): checks
      `releases/latest/download/latest.json` at start and every 6 hours, downloads in the
      background, installs only while the window is hidden (installing closes the app; the
      installer starts the new version). Signed with a free minisign key, not Windows code
      signing: private key at `%USERPROFILE%\.tauri\jot-updater.key` (back it up; losing it means
      installed apps can never update), public key in `tauri.conf.json`. Note: `releases/latest`
      means every GitHub Release in this repo must be a desktop release. Half done: v0.1.0
      published a signed `latest.json` (the CI key works). Tick it when an installed v0.1.0
      updates itself to the next release.
- [x] **4.4** After a web deploy: `main.tsx` checks for a service worker update hourly, when the
      page becomes visible, and (new) on window `focus`; `autoUpdate` reloads onto it. Tested
      2026-11-22: a hidden Tauri window leaves the page "visible" in WebView2 (no
      `visibilitychange`), but the shell focuses the window on every show and `focus` fires.
- [ ] **4.5** First release: install it, check launch at login (2.4), the tray icon, and that a
      second release updates the first.

### Phase 5: Docs

- [x] **5.1** `docs/project-context.md`: §1 (native apps are no longer a non-goal for Windows), §2
      (desktop shell row), §5 (`src-tauri/`, `src/desktop/`), §6 (Tauri packages), §11 (traps below).
- [x] **5.2** `CLAUDE.md`: desktop commands, and the rule that `@tauri-apps/api` stays in
      `src/desktop/`.
- [x] **5.3** README: how a friend installs it (and the SmartScreen click-through).

## Watch out

- Only harmless commands for the remote site (see above).
- Hotkey clashes: `Alt+Space` is PowerToys Run; `Ctrl+Shift+…` clashes with editor shortcuts.
- Mixed-DPI monitors when restoring the window position.
- The shell needs Rust and MSVC: the first non-JS toolchain in the repo.
- Not in this plan: Apple Notes / Raycast parity features (tables, folders or tags, note links,
  quick capture, export). Each gets its own plan.

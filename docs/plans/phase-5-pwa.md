# Plan: Phase 5 – PWA polish

Status: ready, decisions made, not started
Source: `docs/project-context.md` §10 Phase 5, §11 "iOS / PWA traps", `docs/plans/phase-4-auth.md` (login, `run_worker_first`, offline session gate).

Goal: Jot installs like an app on Windows and iPhone, opens with no network, and behaves on iOS (safe areas, zoom, backgrounding). Notes already work offline from IndexedDB; this phase makes the **app itself** (HTML, JS, CSS) available offline and installable.

## Decisions (made by owner)

| Topic        | Choice                                                                                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App icon     | **A simple placeholder "J" made for now** (white J on a near-black square, `public/icon-source.svg`), to be replaced later by your own artwork. `@vite-pwa/assets-generator` turns the source into every size, so swapping it later is one file and one command (see "Changing the logo later") |
| App updates  | **Silent auto-update.** The new service worker takes over and the page reloads itself. Safe because notes live in IndexedDB and on the server, never in the app files. No update UI                                                                                                             |
| Install hint | **iPhone only.** iOS has no install prompt, so a small dismissible hint ("Share, then Add to Home Screen") shows once when the app is not yet installed. Chrome and Edge already show their own install icon                                                                                    |

Defaults I chose without asking (change them if you disagree): light theme only (`theme_color` and `background_color` are white; no dark mode work), the installed app opens at `/` in `standalone` mode, no push notifications, no share target, no app shortcuts.

## Out of scope

Dark mode, push notifications, background sync (iOS has none), share target, a custom install button for Chrome/Edge, Tauri global hotkey (Windows), splitting the 800 kB JS chunk (only if it nears the precache limit, see traps), sharing (Phase 6).

## New packages (flagged per CLAUDE.md; all MIT and free)

`vite-plugin-pwa` (2.0.0, supports Vite 8), its peers `workbox-build` and `workbox-window`, and dev-only `@vite-pwa/assets-generator` (uses `sharp`). All are added at the start of this phase, as `docs/project-context.md` §6 says.

## Task list

Small tasks, in order. Each ends with a "done when" check, and `pnpm check` must pass after every code task. **Checkpoints** are the points to stop and test. Test the service worker only against a **production build** (`pnpm build`, then `pnpm preview`): the plugin does not run in `pnpm dev`, because caching confuses dev.

### Step A: Plugin spike (verify it works with the Cloudflare plugin first)

- [x] **A1. Install.** `pnpm add -D vite-plugin-pwa @vite-pwa/assets-generator workbox-build workbox-window`. Done when: all four are in `package.json` and `pnpm install` shows no new peer errors.
- [x] **A2. Config.** In `vite.config.ts` add `VitePWA({ registerType: "autoUpdate", workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/parties\//], cleanupOutdatedCaches: true }, manifest: {...} })` after the existing plugins. The manifest comes in B3; use `manifest: false` for now. **The denylist is mandatory:** the Google callback `/api/auth/callback/google` is a browser navigation, and without it the service worker would answer with a cached `index.html` and login would silently break. Done when: `pnpm check` passes.
- [x] **A3. Checkpoint: does the build emit the files?** `pnpm build`, then list `dist/client`. Done when: `sw.js` and a `workbox-*.js` are there. **Spike result: it works, no workaround needed.** The build prints `PWA v2.0.0 generateSW` and emits `sw.js`, `workbox-*.js` and `registerSW.js` into `dist/client` next to the Cloudflare plugin's output. (The risk was a report that the plugin's build hook can be skipped when another plugin builds several Vite environments; it does not happen here.)
- [x] **A4. Worker routing still correct.** `pnpm exec wrangler deploy --dry-run` shows the assets, and under `wrangler dev` a request for `/sw.js` returns JavaScript (not `index.html`) while `/api/auth/ok` and `/parties/...` still hit the Worker. Done when: all three behave. **Verified** on `vite preview`: `/sw.js` and `/registerSW.js` come back as JavaScript, `/api/auth/ok` returns `{"ok":true}`, and `/parties/note-room/abc` reaches the Worker guard (401).

### Step B: Icons and manifest

- [x] **B1. Source image (placeholder, awaiting your approval).** `public/icon-source.svg` is a white "J" with a short top bar, drawn as a stroke (no font needed), on a full-bleed `#111111` square, with all artwork inside the middle 80% so Android's circle crop does not cut it. Done when: you approve it. The browser-tab icon is a separate file, `public/favicon.svg`: the same J on a **rounded** square (`rx` 104 of 512) with transparent corners, because tabs look better rounded while the app icons must stay full-bleed squares (Android and iOS round those themselves). It replaces the old Vite logo that was in that file.
- [x] **B2. Generate all sizes.** `pwa-assets.config.ts` using the `minimal-2023` preset, plus a script `pnpm pwa:icons` (`pwa-assets-generator`). Commit the generated PNGs (64, 192, 512, maskable 512, the 180x180 `apple-touch-icon`, `favicon.ico`). Done when: they exist in `public/` and look right. The generated `favicon.ico` (old-browser fallback) comes from the square source and has square corners; point the favicon image at `public/favicon.svg` in `pwa-assets.config.ts` if you want it rounded too.
- [x] **B3. Manifest.** In the plugin config: `id: "/"`, `name: "Jot"`, `short_name: "Jot"`, a one-line `description`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `theme_color` and `background_color` set to white, and the icons including one `purpose: "maskable"`. Done when: DevTools > Application > Manifest shows no warnings.
- [x] **B4. `index.html`.** Keep `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` (now the rounded J) and add `<link rel="icon" href="/favicon.ico" sizes="48x48">` as a fallback; add `<meta name="theme-color">`, `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-title`, `apple-mobile-web-app-status-bar-style` (`default`), and `viewport-fit=cover` on the viewport meta. Update the title to "Jot". Done when: the tab icon and title are Jot's.

### Step C: Offline app shell and updates

- [x] **C1. Register.** In `main.tsx`: `import { registerSW } from "virtual:pwa-register"` and `registerSW({ immediate: true })`; add `vite-plugin-pwa/client` to the types. Done when: `pnpm check` passes.
- [x] **C2. Keep long-lived apps fresh.** In `onRegisteredSW`, call `registration.update()` every hour and when the page becomes visible. An installed app can stay open for days without a reload. Done when: it type-checks.
- [x] **C3. Auto-update behavior and precache list.** Add `globPatterns: ["**/*.{js,css,html,woff2,svg,png,ico}"]` to `workbox` so the fonts and icons are cached too. `registerType: "autoUpdate"` with the new worker skipping the wait and claiming clients, so the page reloads once on the new version. Done when: deploying a visible change shows up after the next reopen with no prompt.
- [x] **C4. Checkpoint: offline start (manual).** `pnpm build && pnpm preview`, open the printed URL once while online and sign in, then DevTools > Network > Offline (and, better, stop the preview server) and hard-reload. Done when: the app opens, shows your cached user and your notes, and typing works. The login screen must **not** appear (see the offline session rule in the Phase 4 plan).
- [x] **C5. Checkpoint: login still works with the worker active.** Sign out and sign in with Google on the production preview. Done when: the callback completes (proves the denylist).

### Step D: iOS fixes (`src/`)

- [x] **D1. Safe areas.** Pad the sidebar and main areas with `env(safe-area-inset-top/bottom/left/right)` so the notch and home bar never cover content; add `overscroll-behavior: none` to `html` and `body`. Done when: nothing sits under the notch in an installed iPhone app.
- [x] **D2. Inputs 16 px or larger.** The shadcn `Input` is already `text-base md:text-sm` (16 px on phones) and the editor text is 1rem. Audit every input/textarea added since; Safari zooms in on anything smaller. Done when: focusing the search box on iPhone does not zoom.
- [x] **D3. Reconnect after restore.** `provider.ts` reconnects on `visibilitychange` and `online`; add a `pageshow` listener for pages restored from the back/forward cache, where iOS leaves a dead socket and may not fire `visibilitychange`. Done when: it type-checks.
- [x] **D4. Ask for durable storage.** Once signed in, call `navigator.storage?.persist?.()` once. It is a request, not a guarantee; harmless where unsupported. Done when: it is called after login without errors.

### Step E: iPhone install hint

- [x] **E1. Detection.** A tiny helper `isIosBrowser()`: iPhone/iPad (including iPadOS, which reports "Macintosh" with touch) **and** not already installed (`navigator.standalone` false and `display-mode: standalone` false). Done when: it is true only in a regular iOS browser tab.
- [x] **E2. Hint component.** A small card at the bottom of the screen: "Install Jot: tap the Share button, then Add to Home Screen", the share icon (`Share01Icon`), and a close button. Dismissal is saved in `localStorage` (wrapped in try/catch). Shown only inside the signed-in app, never on the login screen. Done when: it appears once on iPhone Safari and stays dismissed.
- [x] **E3. Checkpoint (manual).** Done when: the hint shows in Safari, does not show in the installed app, and does not show on desktop.

### Step F: Wrap-up

- [ ] **F1. Real-iPhone test (manual).** Add to Home Screen from the deployed URL, then **sign in again inside the installed app** (iOS gives installed apps their own cookie storage, so a Safari login does not carry over). Then: open it in airplane mode (the app and notes load), edit offline, turn the network back on (it syncs), background it for a few minutes and return (it reconnects), and deploy a small change and reopen (the new version appears). Done when: all pass.
- [ ] **F2. Installability audit.** Chrome DevTools > Lighthouse (or Application > Manifest) reports the app as installable with no errors. Done when: it does.
- [ ] **F3. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all pass.
- [ ] **F4. Docs.** Tick Phase 5 in `docs/project-context.md`, add the packages to §6 and the layout to §5, add "how to regenerate icons" and an "Install" note to `README.md`, and add the service-worker rules to `CLAUDE.md` "Never". Done when: no stale "Phase 5" wording remains.
- [ ] **F5. Commit** in the split: `feat: PWA plugin and manifest` (A–B), `feat: offline app shell and updates` (C), `feat: iOS fixes and install hint` (D–E), `docs: update project context for phase 5` (F). Done when: the pre-commit hook passes on each.

## Details and traps

- **The service worker must never answer `/api/*` or `/parties/*`.** The OAuth callback is a navigation (the denylist in A2 prevents a cached `index.html` from hijacking it), and WebSockets and auth responses must always reach the Worker. Test login again whenever the worker config changes (C5).
- **The plugin may not emit `sw.js` under `@cloudflare/vite-plugin`** (multi-environment build). A3 checks it before anything is built on top.
- **Never test the service worker in `pnpm dev`.** The plugin is off there. Use `pnpm build && pnpm preview`, and "Application > Service Workers > Unregister" plus "Clear site data" between experiments, or you will test a stale copy.
- **Auto-update reloads the page.** A reload mid-typing is safe (y-indexeddb saves each edit as it happens), but the cursor position is lost. Acceptable.
- **Fonts are not precached by default** (only js, css and html are). The Figtree `.woff2` files must be added to `workbox.globPatterns` in C3 or the offline app falls back to a system font. The main JS chunk is now about 1.0 MB (precache total 1018 KiB) against the 2 MiB per-file limit.
- **Precache size limit.** Workbox skips any file over 2 MiB by default (`maximumFileSizeToCacheInBytes`). The main chunk is about 800 kB now; if it ever passes the limit the app silently stops working offline. The build warns; do not ignore it.
- **Installed iPhone apps have their own cookie jar.** Signing in through Safari does not sign in the installed app, so people sign in once inside it. Google sign-in runs as a normal in-app navigation in the standalone window; confirm it on a real device (F1).
- **iOS and IndexedDB.** Safari can delete a site's storage after about a week without use; apps added to the Home Screen are reportedly exempt, and D4 asks for durable storage. The server copy remains the safety net, which is why sign-out syncs first.
- **Installs are per origin.** `jot.<account>.workers.dev` and `jot.deathstalker.dev` are separate installs with separate sessions. Install from the custom domain.
- **`apple-touch-icon` must be an opaque PNG** (180x180); iOS fills transparency with black. The generator preset handles it.
- **Maskable icons need padding.** Keep artwork in the middle 80% or Android crops it.
- **Re-running the icon generator** overwrites the committed PNGs; do it only when the source image changes.
- **Hosting headers.** Cloudflare serves static files with `Cache-Control: max-age=0, must-revalidate`, so `sw.js` is re-checked on every visit, which is what update detection needs. Do not add long cache headers to it.

## Changing the logo later

The whole icon set comes from one source file, so replacing the logo is quick.

1. **Prepare the new image.** A square SVG, or a PNG of at least 1024x1024. Put the artwork on a full-bleed background (the generator does not add one to the main icons) and keep everything important inside the **middle 80%** of the square: Android crops icons to circles and rounded squares, and iOS rounds the corners itself. An opaque background is best (iOS fills transparency with black on the home screen icon).
2. **Replace the files.** Overwrite `public/icon-source.svg` with the new image (full-bleed, used for the app icons). Also update `public/favicon.svg`, the browser-tab icon: the same artwork but with rounded corners and transparent outside, as in the current file (a `rect` with `rx` about 20% of the width). If it is a PNG, save it as `public/icon-source.png` and change the `images` entry in `pwa-assets.config.ts` (created in B2) to point at it.
3. **Regenerate every size:**
   ```bash
   pnpm pwa:icons
   ```
   This overwrites the generated files in `public/` (the 64, 192 and 512 px icons, the maskable 512, the 180 px `apple-touch-icon` and `favicon.ico`). The manifest and `index.html` already point at those file names, so nothing else changes.
4. **Check it.** Run `pnpm build && pnpm preview`, then DevTools > Application > Manifest and look at each icon, including the maskable preview (use the "Show only the minimum safe area for maskable icons" checkbox to see what gets cropped). Update the `theme_color` and `background_color` in `vite.config.ts` if the new logo's colours differ.
5. **Deploy** with `pnpm run deploy`. Installed apps pick up the new manifest and icons on a later visit; **iPhone home screen icons do not update by themselves**. To see the new icon on iOS, delete the app from the Home Screen and add it again. Desktop browsers refresh the installed app's icon within a day or so.
6. **Commit** the new source image and the regenerated icons together: `feat: update app icon`.

Do not edit the generated PNGs by hand: the next `pnpm pwa:icons` run would overwrite them. Edit the source and regenerate.

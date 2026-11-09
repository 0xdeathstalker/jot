# Phase 1 research: y-partyserver sync + Tiptap

Researched 2026-11-09. Every claim carries its source. "UNVERIFIED" = not confirmed from a primary source.

## Summary

- Versions today: `partyserver` 0.5.10, `y-partyserver` 2.2.0, `yjs` 13.6.33, all `@tiptap/*` 3.33.0 (`pnpm view`, npm registry). Tiptap is on **v3**, so StarterKit's undo/redo key is `undoRedo` (not `history`) ([StarterKit docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)).
- cloudflare/partykit ships a **`fixtures/tiptap-yjs`** example that is almost exactly our stack (Tiptap 3 + Collaboration + YServer + hibernate + Vite + `@cloudflare/vite-plugin` + Tailwind 4 + `onLoad`/`onSave` into DO SQLite): <https://github.com/cloudflare/partykit/tree/main/fixtures/tiptap-yjs>. Copy it.
- Party name = kebab-case of the DO binding name, so `NoteRoom` becomes `/parties/note-room/<room>` ([partyserver src](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/src/index.ts)).
- Install peers explicitly: `@tiptap/extension-collaboration` needs `@tiptap/y-tiptap ^3.0.7` and `yjs` as peers ([npm](https://www.npmjs.com/package/@tiptap/extension-collaboration)); `y-partyserver` needs `partyserver`, `yjs`, `@cloudflare/workers-types` as peers ([npm](https://www.npmjs.com/package/y-partyserver)). `@tiptap/y-tiptap` also peers on `y-protocols` and `prosemirror-*` (provided by `@tiptap/pm`; `y-protocols` comes via `y-partyserver`'s own deps).
- Read-only (phase 6): override `YServer.isReadOnly(connection)`; when true, incoming sync step 2 and update messages are ignored ([y-partyserver server source](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/server/index.ts)).
- Hibernation caveat: YServer's save debounce is a `setTimeout`, which keeps the DO awake (and billed) while anyone types; open issue [#427](https://github.com/cloudflare/partykit/issues/427). Idle rooms do hibernate. Fine for a personal app; revisit if free quota matters.
- **Tiptap Simple Editor template is MIT but a poor fit**: SCSS + Radix + Floating UI, React 18 target, ships its own undo/redo buttons, and the npm `@tiptap/cli` package carries Tiptap's _Pro license_ text. Recommendation: build a small toolbar with shadcn components and `editor.chain()` commands; every mark/node needed is in free StarterKit.
- Worker today returns 404 for everything not an asset (`worker/index.ts`); phase 1 must wrap `routePartykitRequest(request, env)` there. WebSocket upgrades are not navigation requests, so they reach the Worker (inference from [SPA docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/); confirm in dev).

---

## A. partyserver / y-partyserver

### A1. Versions, peers, install

| Package       | Version | License | peerDependencies                                                                        | Source                    |
| ------------- | ------- | ------- | --------------------------------------------------------------------------------------- | ------------------------- |
| partyserver   | 0.5.10  | ISC     | `@cloudflare/workers-types ^4.20260424.1 \|\| ^5.20260703.1`                            | `pnpm view partyserver`   |
| y-partyserver | 2.2.0   | ISC     | `@cloudflare/workers-types ^4.20260424.1`, `partyserver >=0.2.0 <1.0.0`, `yjs ^13.6.14` | `pnpm view y-partyserver` |
| yjs           | 13.6.33 | MIT     | none                                                                                    | `pnpm view yjs`           |

- Hono is **not** a peer (that is the separate `hono-party` package; [CHANGELOG](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/CHANGELOG.md) lists it as a sibling).
- `y-partyserver` dependencies: `lib0`, `lodash.debounce`, `nanoid`, `y-protocols` (npm registry).
- `@cloudflare/workers-types` is a required peer. The repo gets types via `wrangler types` (script `cf-typegen`). Whether pnpm warns about the missing peer: UNVERIFIED. If it does, `pnpm add -D @cloudflare/workers-types`.
- Install: `pnpm add partyserver y-partyserver yjs` (matches the fixture's deps: [package.json](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/package.json)).
- Package entry points: `y-partyserver` (server), `y-partyserver/provider` (client `YProvider`), `y-partyserver/react` (`useYProvider` hook) (npm `exports`).

### A2. YServer API

All from [y-partyserver server source](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/server/index.ts) and [README](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/README.md):

- `class NoteRoom extends YServer` (`import { YServer } from "y-partyserver"`). `this.document` is a `Y.Doc` (gc on) with awareness.
- `onLoad(): Promise<YDoc | void>`: called once at room start (`onStart()` calls it). Apply saved state onto `this.document` (e.g. `Y.applyUpdate`), or return a doc whose state is applied.
- `onSave(): Promise<void>`: called after edits (debounced) and when the room empties.
- `static callbackOptions: CallbackOptions`: `debounceWait` default 2000 ms, `debounceMaxWait` default 10000 ms, `timeout` default 5000 ms (declared but, per the source read, not referenced).
- `isReadOnly(connection): boolean` (default false). Read-only connections: sync step 2 / update messages ignored; sync step 1 and awareness still work. Pointer for phase 6: decide the role in the Worker (`onBeforeConnect`, put role in a query param or header) and read it in `isReadOnly`, or store it with `connection.setState()` in `onConnect`. The exact plumbing is UNVERIFIED; do not trust a client-supplied param without Worker auth.
- Hooks inherited from `Server` ([partyserver src](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/src/index.ts)): `onStart(props?)` (once per start/wake, inside `blockConcurrencyWhile`; call `super.onStart()` if overridden), `onConnect(connection, ctx)`, `onMessage(connection, message)`, `onClose(connection, code, reason, wasClean)`, `onError`, `onRequest`, `onAlarm`. YServer already implements `onConnect`/`onMessage`/`onClose`; if you override them call `super`.
- Custom string messages use a `__YPS:` prefix: `onCustomMessage`, `sendCustomMessage`, `broadcastCustomMessage` (not needed for phase 1).
- Persistence is **your job**: the Y.Doc lives in DO memory; nothing is stored unless `onSave` writes it. Official example persists with `this.ctx.storage.sql` ([fixture server.ts](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/src/server.ts)). Store `Y.encodeStateAsUpdate(this.document)` (compacted), which matches project-context §11. A single SQLite row/BLOB maxes at 8 MB ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
- Hibernation: `static options = { hibernate: true }` (default `false`; [partyserver src](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/src/index.ts), [README](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md)). On wake, in-memory state (the Y.Doc) is gone, so `onStart` -> `onLoad` rebuilds it from SQLite, and YServer sends sync step 1 to surviving connections so clients re-send what the server lacks. Awareness client ids per connection are kept via `conn.setState()` so they survive hibernation. (y-partyserver server source.) Consequence: edits made within the save debounce window before hibernation are recovered from clients, not lost, while clients are connected ([issue #427](https://github.com/cloudflare/partykit/issues/427) describes this behaviour).
- Hibernation does not occur while a timer is pending ([CF WebSockets doc](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)), and YServer's debounce is a timer (issue #427, open). Billed duration does not accrue during hibernation (CF WebSockets doc).

### A3. Worker routing

- `routePartykitRequest(request, env, options?)` returns `Promise<Response | null>`; `null` means no match ([partyserver README](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md)).
- URL shape `/{prefix}/{party}/{room}`; prefix default `parties`; party = kebab-cased binding name, matched against DO namespace bindings in `env` (`MyAgent` -> `my-agent`, `NoteRoom` -> `note-room`) ([partyserver src](https://github.com/cloudflare/partykit/blob/main/packages/partyserver/src/index.ts)). Unknown party returns 400.
- Options: `prefix`, `cors`, `jurisdiction`, `locationHint`, `props`, `routingRetry` (on by default), `onBeforeConnect(req, lobby)` (WebSocket only; return a `Request`, a `Response` e.g. 403, or nothing), `onBeforeRequest` (HTTP). This is the phase-4 auth hook (partyserver src).
- Our worker, adapting the official fixture (which uses `import { env } from "cloudflare:workers"`; the other fixtures use `fetch(request, env)`; [monaco-yjs](https://github.com/cloudflare/partykit/blob/main/fixtures/monaco-yjs/src/server.ts)):

```ts
// worker/index.ts (shape taken from fixtures/monaco-yjs/src/server.ts)
import { routePartykitRequest } from "partyserver"
export { NoteRoom } from "./rooms/note-room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) || new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

- Assets coexistence: with `assets.not_found_handling: "single-page-application"` and a compatibility date >= 2025-04-01 (ours is 2026-11-04), navigation requests (`Sec-Fetch-Mode: navigate`) get `index.html`; non-navigation requests (fetch, WebSocket upgrade) that match no asset reach the Worker. `/parties/...` is not an asset, so it reaches the Worker. To make it explicit, `run_worker_first: ["/parties/*"]` is available (Wrangler >= 4.20 / vite plugin >= 1.7) ([SPA docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). Not required per the fixture, which has no such setting.
- wrangler.jsonc: **already correct** in the repo: binding `NoteRoom`, `migrations: [{tag:"v1", new_sqlite_classes:["NoteRoom"]}]`. Same shape as the fixture ([wrangler.jsonc](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/wrangler.jsonc)). The class must be exported from the Worker entry (already done in `worker/index.ts`).
- Env typing: `wrangler types` (script `cf-typegen`) generates `Env` with `NoteRoom: DurableObjectNamespace<import("./worker/...").NoteRoom>` (see fixture [env.d.ts](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/env.d.ts)).
- Room name with a colon (`note:<id>`, project-context §7): path segment encoding of `:` through YProvider/router is UNVERIFIED. Test it, or use `note-<id>` / plain `<id>`.

### A4. Client: YProvider

Source: [provider source](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/provider/index.ts), [README](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/README.md), [react hook](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/provider/react.tsx).

- `new YProvider(host, room, doc?, options?)`. `host` and `room` must be strings; `doc` defaults to a new `Y.Doc`.
- Options: `party` (default `"main"`; **we must pass `"note-room"`**), `prefix` (replaces `/parties/<party>`), `params` (object, or sync/async function; re-evaluated on reconnect since 2.1.4), `connect` (default true), `protocol` (`ws`/`wss`), `connectionId`, `awareness`, `WebSocketPolyfill`, `resyncInterval` (default -1), `maxBackoffTime` (README says `maxBackoffTimeout`, default 2500 ms; the source type says `maxBackoffTime`: use source, verify), `disableBc` (disable BroadcastChannel cross-tab).
- Host: leading `http(s)://` / `ws(s)://` and trailing slash are stripped. Protocol is `ws` for localhost / 127.* / 192.168.* / 10.* / 172.*, else `wss`. So `window.location.host` works for both Vite dev (`localhost:5173`) and production (`jot.deathstalker.dev`), with no per-env config. The `useYProvider` hook defaults `host` to `window.location.host`. Dev path: `@cloudflare/vite-plugin` serves the Worker on the Vite port, and the fixture does exactly this (its client passes no host) ([fixture client.tsx](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/src/client.tsx)).
- Reconnect: automatic with exponential backoff (`2^n * 100` ms, capped by `maxBackoffTime`); params refreshed on reconnect.
- `connect()` (async) / `disconnect()` (sets shouldConnect false, clears awareness, closes socket) / `destroy()`.
- Events: `status` (`connecting|connected|disconnected`), `synced`/`sync` (boolean), `connection-error`, `connection-close`, `custom-message`. Properties: `synced`, `wsconnected`, `awareness`, `doc`, `id`.
- Awareness: `provider.awareness` (y-protocols `Awareness`); `awareness.setLocalStateField("user", {...})` is the standard y-protocols API (UNVERIFIED in partykit docs, but this is how `CollaborationCaret` consumes `provider`). Needed in phase 6 only.
- `useYProvider({ host?, room, party?, doc?, prefix?, options? })` creates the provider once in `useState`, calls `connect()` on mount and `disconnect()` on unmount. Note: it does not re-create on `room` change, so key the component by note id. Project rule says only `src/sync/provider.ts` imports y-partyserver: wrap it there.
- visibilitychange (iOS): not built in (no occurrences in provider source). Pattern, using public fields: on `document.visibilitychange` with `visible`, if `!provider.wsconnected` call `provider.connect()`. The provider's `connect()` is a no-op if a socket exists (`this.ws === null` check at source line ~541), so calling it is safe. Also listen to `window` `online`. Exact behaviour on a zombie (half-open) socket is UNVERIFIED; `resyncInterval` or `disconnect(); connect()` are the fallbacks.

### A5. Official examples

Repo: <https://github.com/cloudflare/partykit/tree/main/fixtures>. Relevant: `tiptap-yjs`, `monaco-yjs`, `lexical-yjs`, `hono`.

`fixtures/tiptap-yjs` (files: `src/server.ts`, `src/client.tsx`, `wrangler.jsonc`, `vite.config.ts`, `env.d.ts`, `package.json`). Deps: `@tiptap/extension-collaboration ^3.22.5`, `@tiptap/react`, `@tiptap/starter-kit`, `partyserver ^0.5.10`, `y-partyserver ^2.2.0`, react 19, tailwind 4. Its vite config is `plugins: [cloudflare(), react(), tailwindcss()]`.

Server (condensed from [server.ts](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/src/server.ts)):

```ts
export class Document extends YServer {
  static callbackOptions: CallbackOptions = {
    debounceWait: 1000,
    debounceMaxWait: 10000,
    timeout: 10000,
  }
  static options = { hibernate: true }
  async onStart() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, content BLOB)",
    )
    return super.onStart()
  }
  async onLoad() {
    const document = [
      ...this.ctx.storage.sql.exec("SELECT * FROM documents WHERE id = ? LIMIT 1", this.name),
    ][0]
    if (document) Y.applyUpdate(this.document, new Uint8Array(document.content as ArrayBuffer))
  }
  async onSave() {
    const update = Y.encodeStateAsUpdate(this.document)
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO documents (id, content) VALUES (?, ?)",
      this.name,
      update,
    )
  }
}
```

Client (condensed from [client.tsx](https://github.com/cloudflare/partykit/blob/main/fixtures/tiptap-yjs/src/client.tsx)):

```tsx
const provider = useYProvider({ party: "document", room: "y-partyserver-text-editor-example" })
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      /* history: false  <- commented out in the fixture; v3 name is undoRedo */
    }),
    Collaboration.configure({ document: provider.doc }),
  ],
})
```

Note: the fixture leaves undo/redo enabled (the `history: false` line is commented, and `history` is the v2 name). Jot disables it (see B2).

Phase-1 value: this fixture already persists via `onLoad`/`onSave`, which project-context assigns to phase 2; including it in phase 1 costs ~15 lines and proves persistence. Decide (see C).

### A6. Gotchas and open issues

- Save timer blocks hibernation while typing (billing): [issue #427](https://github.com/cloudflare/partykit/issues/427), open. Free limits: DO requests 100,000/day with incoming WebSocket messages billed 20:1; duration 13,000 GB-s/day; SQLite rows written 100,000/day (each `onSave` is one row write; with debounce 1-10 s this is fine) ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Exceeding fails requests until 00:00 UTC.
- Awareness bugs (phase 6): late joiner does not get existing awareness ([#420](https://github.com/cloudflare/partykit/issues/420)); one peer disconnect wipes everyone's awareness ~15 s ([#421](https://github.com/cloudflare/partykit/issues/421)); provider echoes others' awareness to server ([#424](https://github.com/cloudflare/partykit/issues/424)). All open at research time.
- `provider.destroy()` leaks a reconnect timer ([#402](https://github.com/cloudflare/partykit/issues/402), open): relevant to React Strict Mode double mount; `useYProvider` uses `disconnect()`, not `destroy()`, in cleanup.
- Old "Network connection lost" errors with y-partyserver: [#63](https://github.com/cloudflare/partykit/issues/63), open, empty body. Treat as noise unless seen.
- Vite dev with workerd: open workers-sdk issue about a phantom server-side WebSocket attached to a hibernating DO in dev, count off by one until dev restart ([workers-sdk#16491](https://github.com/cloudflare/workers-sdk/issues/16491)). Restart `pnpm dev` if a dev tab behaves oddly.
- Limits ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)): 10 GB storage per DO (a FAQ line says 1 GB on Free: the page contradicts itself; project-context says 1 GB, keep that), 5 GB per account on Free, 8 MB max BLOB/row/string, 32 MiB max received WebSocket message, 30 s CPU default per request/message. Notes are tiny against these; a note whose encoded state nears 8 MB would fail `onSave`. Large-doc chunking is not needed for Jot.
- Hibernation attachment limit 16,384 bytes per connection (CF WebSockets doc), so don't put large user data in `connection.setState`.
- `this.name` requires name-based addressing (`routePartykitRequest`); `idFromString`/`newUniqueId` unsupported ([CHANGELOG 2.2.0](https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/CHANGELOG.md)).

---

## B. Tiptap

### B1. Versions and install

All MIT, version 3.33.0 (`pnpm view`, 2026-11-09):

| Package                                 | peerDependencies                                                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tiptap/react`                         | react/react-dom ^17 \|\| ^18 \|\| ^19, `@tiptap/pm` 3.33.0, `@tiptap/core` 3.33.0, `@types/react*`                                                                  |
| `@tiptap/core`                          | `@tiptap/pm` 3.33.0                                                                                                                                                 |
| `@tiptap/pm`                            | none                                                                                                                                                                |
| `@tiptap/starter-kit`                   | none (depends on `@tiptap/core`, `@tiptap/pm`, `@tiptap/extensions`, bold/italic/strike/code/underline/link/list/heading/blockquote/code-block/hr/etc., all 3.33.0) |
| `@tiptap/extension-collaboration`       | `yjs ^13`, `@tiptap/pm`, `@tiptap/core`, `@tiptap/y-tiptap ^3.0.7`                                                                                                  |
| `@tiptap/extension-collaboration-caret` | `@tiptap/pm`, `@tiptap/core`, `@tiptap/y-tiptap ^3.0.7`                                                                                                             |
| `@tiptap/y-tiptap` 3.2.0                | `yjs ^13.6.13`, `y-protocols ^1.0.1`, `prosemirror-view/model/state`                                                                                                |

- `@tiptap/y-tiptap` is Tiptap's fork replacing `y-prosemirror`; we do **not** install `y-prosemirror`. Collaboration docs install `@tiptap/extension-collaboration @tiptap/y-tiptap yjs y-websocket` ([docs](https://tiptap.dev/docs/editor/extensions/functionality/collaboration)); we skip `y-websocket` since `y-partyserver` has its own provider.
- Exact install: `pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/y-tiptap`. (Core `@tiptap/core` is pulled in via starter-kit; add it explicitly if pnpm reports an unmet peer. The fixture does not list `@tiptap/y-tiptap`, relying on peer auto-install; listing it explicitly is safer.)
- Collaboration docs note `enableContentCheck` needs extension-collaboration >= 3.33.0 and y-tiptap >= 3.2.0 (we satisfy both).

### B2. Disable undo/redo, configure Collaboration, Caret

- StarterKit v3 includes Undo/Redo, Link, Underline, ListKeymap, TrailingNode. Disable with `StarterKit.configure({ undoRedo: false })` ([StarterKit docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)). The Collaboration page says to disable `UndoRedo` when using StarterKit and that Collaboration brings its own undo/redo (`editor.commands.undo()/redo()`, same shortcuts) ([Collaboration docs](https://tiptap.dev/docs/editor/extensions/functionality/collaboration), [UndoRedo docs](https://tiptap.dev/docs/editor/extensions/functionality/undo-redo)).
- Collaboration options: `document` (Y.Doc), `field` (fragment name, default `'default'`), `fragment` (raw fragment instead) (Collaboration docs). Use `document: provider.doc` and keep default field (or set `field: "content"` explicitly; must never change later).
- Caret (phase 6): package `@tiptap/extension-collaboration-caret` (renamed from the older cursor extension: the rename is **not** stated on the page; the fixture imports a commented-out `extension-collaboration-cursor`, which is the old name). Options `provider`, `user` (`name`, `color` as `#RRGGBB`), `render`, `selectionRender` ([docs](https://tiptap.dev/docs/editor/extensions/functionality/collaboration-caret)). Peers per npm: `@tiptap/y-tiptap`, core, pm.
- Gotcha from docs: with `UniqueID` + Collaboration, create the editor only after the provider has synced (not used by us).
- Gotcha: initial content must come from the Y.Doc, not Tiptap's `content` option (not stated verbatim in docs read; standard Collaboration practice, UNVERIFIED here).

### B3. Tiptap's own UI (Simple Editor / UI Components)

Facts and sources:

- Repo `ueberdosis/tiptap-ui-components`, license MIT ([LICENSE](https://github.com/ueberdosis/tiptap-ui-components/blob/main/LICENSE), [README](https://github.com/ueberdosis/tiptap-ui-components/blob/main/README.md)). README warns the repo "may not always contain the latest version"; use the CLI.
- Install: `npx @tiptap/cli@latest add simple-editor` (existing project) / `init simple-editor` (new) ([docs](https://tiptap.dev/docs/ui-components/templates/simple-editor)). `add <component>` copies source files into the project plus hooks/icons/libs/styles it depends on ([overview](https://tiptap.dev/docs/ui-components/getting-started/overview)). CLI designed for Vite or Next.js ([CLI docs](https://tiptap.dev/docs/ui-components/getting-started/cli)).
- Account/token: the CLI registry code attaches a Bearer token if one exists, errors 401/403 for components needing a subscription, and has a separate "free registry" endpoint ([registry source](https://github.com/ueberdosis/tiptap-ui-components/blob/main/packages/cli/src/utils/registry/index.ts)). CLI docs say `login` is for paid components. So free components should need no account (docs imply it; not stated outright: UNVERIFIED by running).
- **License trap**: the npm package `@tiptap/cli` 3.19.5 declares `"license": "SEE LICENSE IN LICENSE.md"`, and that LICENSE.md is titled "Tiptap pro license for extensions, UI components and templates", while stating MIT-licensed components are not Pro Software ([unpkg LICENSE.md](https://unpkg.com/@tiptap/cli@3.19.5/LICENSE.md)). Running the CLI via `npx` does not add it to our dependencies, but our hard rule says no `@tiptap-pro/*` and no paid features; this is a grey area worth the owner's call.
- Styling: components are **SCSS**; CLI installs `sass`/`sass-embedded` and adds `_variables.scss` and `_keyframe-animations.scss` imports to the global stylesheet (Vite+React: `src/index.css`). Tailwind and shadcn are not mentioned ([style docs](https://tiptap.dev/docs/ui-components/getting-started/style)). The template's own app uses `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@floating-ui/react`, `react-hotkeys-hook`, `lodash.throttle`, extra extensions (image, highlight, text-align, task list, sub/superscript, typography), `sass-embedded`, React 18 ([apps/web/package.json](https://github.com/ueberdosis/tiptap-ui-components/blob/main/apps/web/package.json)). Docs say React 19 is "not yet fully supported" ([overview](https://tiptap.dev/docs/ui-components/getting-started/overview)); we run React 19.3.
- Free vs paid (README + overview): free MIT = Simple Editor template, UI components (blockquote, code block, color highlight, heading button/dropdown, image upload, link popover, list button/dropdown, mark button, text align, undo-redo button), node components (code block, image, image upload, list, paragraph), primitives (avatar, badge, button, dropdown menu, popover, separator, spacer, toolbar, tooltip). Paid/Cloud-connected: Comments, Version History, Notion-like template and other cloud components; they require a Tiptap Cloud subscription or trial ([overview](https://tiptap.dev/docs/ui-components/getting-started/overview)). The Notion-like template's paid status is stated in project-context; I did not find a primary page confirming it (UNVERIFIED).
- Minimal toolbar mapping: bold/italic/strike/code/underline = `MarkButton` (free) or just `editor.chain().focus().toggleBold().run()`; headings = `HeadingDropdownMenu` (free) or `toggleHeading({level})`; lists = `ListDropdownMenu` (free) or `toggleBulletList()/toggleOrderedList()`; link = `LinkPopover` (free; Link ships in StarterKit v3) or `setLink`/`unsetLink`; blockquote, code block free; undo/redo button must NOT be used (see B4). Everything the toolbar needs is in free StarterKit, so custom shadcn buttons are ~60 lines with no new dependency.
- Recommendation: do not run the CLI. Build the toolbar from shadcn `Button`/`Toggle` + the Tiptap commands above; keep SCSS, Radix and Floating UI out. Revisit only for the link popover UX.

### B4. Simple Editor and Collaboration

Yes, it conflicts: the template's toolbar renders `<UndoRedoButton action="undo" />` / `redo` and uses `StarterKit` with its default (history enabled) ([simple-editor.tsx](https://github.com/ueberdosis/tiptap-ui-components/blob/main/apps/web/src/components/tiptap-templates/simple/simple-editor.tsx), [template docs](https://tiptap.dev/docs/ui-components/templates/simple-editor)). If used: set `StarterKit.configure({ undoRedo: false })` and leave Collaboration's own undo/redo (calling `editor.commands.undo()` is safe; buttons from the template call `editor.can().undo()` which depends on the UndoRedo extension: whether it falls back to Collaboration's commands is UNVERIFIED). Simplest: delete the undo/redo buttons or rewrite them to call the Collaboration-provided commands.

---

## C. Synthesis

### Packages (phase 1 only)

```
pnpm add yjs partyserver y-partyserver @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/y-tiptap
```

Do not add now: `y-indexeddb` (phase 2), `@tiptap/extension-collaboration-caret` (phase 6), `y-websocket`, `y-prosemirror`, anything `@tiptap-pro/*`, the Tiptap CLI, `sass`. If `@cloudflare/workers-types` peer warns: `pnpm add -D @cloudflare/workers-types` (UNVERIFIED need).

### Ordered tasks

1. Install packages above; run `pnpm cf-typegen`.
2. `worker/rooms/note-room.ts`: `export class NoteRoom extends YServer { static options = { hibernate: true } }`. (Add `onLoad`/`onSave` here only if the owner wants persistence in phase 1; otherwise it is phase 2.)
3. `worker/index.ts`: call `routePartykitRequest(request, env)`, fall back to the existing 404.
4. `src/sync/provider.ts`: the only importer of `y-partyserver`; export a hook/factory that builds `YProvider(window.location.host, roomName, doc, { party: "note-room" })`. Include visibilitychange/online reconnect here.
5. `src/editor/Editor.tsx`: `useEditor` with `StarterKit.configure({ undoRedo: false })` + `Collaboration.configure({ document: provider.doc })`; render `EditorContent`; base `.ProseMirror` styles in `src/styles`.
6. `src/App.tsx`: read `?note=` (default `test`), render `<Editor key={noteId} />`. No router.
7. Minimal toolbar (optional for the phase goal): shadcn Button/Toggle for bold, italic, heading, lists, link calling Tiptap commands. Defer if the goal is only "prove sync".
8. Test: two tabs on `?note=test` in `pnpm dev`; type in both; check `provider.status`; kill/restart dev to confirm reconnect; confirm `/parties/note-room/test` is hit (devtools WS).
9. Update project-context §10 phase 1 checkboxes; write `docs/plans/phase-1-sync.md` (per rule 2 in §13).

### Files

Create: `worker/rooms/note-room.ts` (exists as a stub: modify), `src/sync/provider.ts`, `src/editor/Editor.tsx`, optionally `src/editor/Toolbar.tsx`, `docs/plans/phase-1-sync.md`. Modify: `worker/index.ts`, `src/App.tsx`, `src/styles/index.css` (editor typography), `package.json` + lockfile, `docs/project-context.md` (checkboxes). `wrangler.jsonc` needs no change (binding and migration already exist). `worker-configuration.d.ts` regenerated by wrangler (if tracked).

### Open questions for the owner

1. Persist in phase 1? The fixture's `onLoad`/`onSave` is ~15 lines; without it, a DO eviction while no client is connected loses the note on the server. Phase 2 plans it; pull forward?
2. Room naming: keep `note:<id>` (colon in URL path unverified) or use `note-<id>`? Needs a one-line edit to project-context §7.
3. Toolbar: confirm "no Tiptap CLI / Simple Editor" (SCSS, Radix, Floating UI, React 19 not fully supported, Pro-license text on the CLI package) and build with shadcn instead.
4. Accept issue #427 (save timer prevents hibernation while typing, so billed duration only while someone types)? Alternatives: patch/alarm-based save later (the issue's proposal), or ignore for a single-user app.
5. `@cloudflare/workers-types` peer: ok to add as a devDependency alongside `wrangler types`?
6. Add `run_worker_first: ["/parties/*"]` for explicitness, or rely on default routing?

---

## Sources

- partyserver README: https://github.com/cloudflare/partykit/blob/main/packages/partyserver/README.md
- partyserver source: https://github.com/cloudflare/partykit/blob/main/packages/partyserver/src/index.ts
- y-partyserver README: https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/README.md
- y-partyserver server source: https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/server/index.ts
- y-partyserver provider source: https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/provider/index.ts
- y-partyserver react hook: https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/src/provider/react.tsx
- y-partyserver CHANGELOG: https://github.com/cloudflare/partykit/blob/main/packages/y-partyserver/CHANGELOG.md
- Fixture tiptap-yjs: https://github.com/cloudflare/partykit/tree/main/fixtures/tiptap-yjs ; monaco-yjs: https://github.com/cloudflare/partykit/blob/main/fixtures/monaco-yjs/src/server.ts
- Issues: https://github.com/cloudflare/partykit/issues/427, /420, /421, /424, /402, /63 ; https://github.com/cloudflare/workers-sdk/issues/16491
- Cloudflare: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ ; https://developers.cloudflare.com/durable-objects/platform/limits/ ; https://developers.cloudflare.com/durable-objects/platform/pricing/ ; https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Tiptap docs: https://tiptap.dev/docs/editor/extensions/functionality/collaboration ; .../collaboration-caret ; .../starterkit ; .../undo-redo ; https://tiptap.dev/docs/ui-components/getting-started/overview ; .../getting-started/cli ; .../getting-started/style ; .../templates/simple-editor
- Tiptap UI components repo: https://github.com/ueberdosis/tiptap-ui-components (README, LICENSE, apps/web/package.json, simple-editor.tsx, packages/cli registry source)
- @tiptap/cli license text: https://unpkg.com/@tiptap/cli@3.19.5/LICENSE.md
- npm registry via `pnpm view` (2026-11-09): partyserver, y-partyserver, yjs, y-prosemirror, @tiptap/* , @tiptap/y-tiptap, @tiptap/cli, @cloudflare/vite-plugin 1.67.0, wrangler 4.158.0

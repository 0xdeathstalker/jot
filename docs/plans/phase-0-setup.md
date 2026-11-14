# Plan: Phase 0 – Setup (manual runbook)

Status: owner runs these steps by hand. Claude helps only when asked.
Source: `docs/project-context.md` §10 Phase 0, plus shadcn/ui support.

## Decisions

| Topic                     | Choice                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Package manager           | **pnpm**                                                                           |
| Scaffold                  | `create-cloudflare` **in this repo dir** (see step 2 for the non-empty-dir prompt) |
| shadcn style / base color | Pick yourself during `shadcn init`                                                 |
| shadcn components         | None pre-installed. Add per feature                                                |
| Dark mode toggle          | Not in Phase 0. Keep shadcn's `.dark` CSS variables only                           |

## Out of scope

No TipTap, Yjs, y-partyserver, auth, PWA plugin. Those come in their phases (context §6).

## Known issue (found when Claude tried)

Non-interactive `pnpm create cloudflare@latest . --framework=react` fails: create-vite cancels on the non-empty directory ("Operation cancelled"), then the Cloudflare step crashes with `ENOENT package.json`. It leaves partial files (`src/`, `worker/`, `wrangler.jsonc`, `tsconfig.worker.json`). Run it **interactively** instead (step 2). Repo was cleaned; only `docs/plans/` is untracked right now.

## Steps

All commands run in the repo root. Use Git Bash or PowerShell.

### 1. Check starting point

```
git status          # only docs/plans/ untracked
node -v             # LTS (v22 ok)
pnpm -v
```

### 2. Scaffold

```
pnpm create cloudflare@latest .
```

Answer the prompts:

- Category: **Framework Starter** → framework: **React** → platform: **Workers with Assets** → variant: **TypeScript**
- When create-vite says the directory is not empty: choose **Ignore files and continue** (never "Remove existing files").
- Git: **No** (repo exists). Deploy: **No**.

Then protect your files:

```
git checkout README.md        # create-vite overwrites README; restore yours
git status                    # docs/ must still be there
```

Verify:

```
pnpm install
pnpm dev                      # template page loads
```

If the prompt flow still fails: run the same command in an empty temp folder, then copy everything **except** `README.md` and `.git` into this repo.

### 3. pnpm build scripts

If install warns "Ignored build scripts" (`esbuild`, `workerd`, `sharp`) and `pnpm dev` fails:

```
pnpm approve-builds           # select the reported packages
```

This writes `pnpm.onlyBuiltDependencies` into `package.json`.

### 4. Tailwind v4 (needed by shadcn)

Check first: `package.json` may already list `tailwindcss`. If not:

```
pnpm add tailwindcss @tailwindcss/vite
```

- `vite.config.ts`: `import tailwindcss from "@tailwindcss/vite"` and add `tailwindcss()` to `plugins`.
- `src/index.css`: replace contents with `@import "tailwindcss";`

### 5. Path alias `@/*` → `src/*`

`@` means the `src` folder, so imports read `@/components/ui/button`.

Set it in **both** TypeScript and Vite:

- `tsconfig.json` (add a `compilerOptions` block, it has none) and `tsconfig.app.json` (existing `compilerOptions`):
  ```json
  "paths": { "@/*": ["./src/*"] }
  ```
  Do **not** add `baseUrl`: newer TypeScript deprecates it, and `paths` resolves relative to the tsconfig without it.
- `vite.config.ts`:
  ```ts
  import path from "path"
  // inside defineConfig:
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  ```
- `pnpm add -D @types/node`

### 6. shadcn/ui

```
pnpm dlx shadcn@latest init
```

Pick style and base color yourself. Afterwards check `components.json` aliases:
`components` → `@/components`, `ui` → `@/components/ui`, `lib` → `@/lib`, `utils` → `@/lib/utils`.

Smoke test (then delete, so nothing is pre-installed):

```
pnpm dlx shadcn@latest add button
```

Render `<Button>Test</Button>` in `src/app.tsx`, confirm it is styled, then remove the usage and `src/components/ui/button.tsx`.

From now on, add components only when a feature needs them: `pnpm dlx shadcn@latest add <name>`.

### 7. Repo layout (context §5)

Create:

- `src/editor/`, `src/sync/`, `src/features/notes/` (add a `.gitkeep` file in each so git tracks the empty dir)
- `worker/rooms/note-room.ts` – stub only, see step 8

Skip `src/features/sharing/`, `worker/auth/`, `src/sync/provider.ts` (later phases).
Strip template demo code: unused assets, template CSS, demo content in `src/app.tsx`. Keep `main.tsx`.

### 8. `wrangler.jsonc` + NoteRoom stub

`wrangler.jsonc` should contain:

```jsonc
{
  "name": "jot",
  "assets": { "not_found_handling": "single-page-application" },
  "durable_objects": { "bindings": [{ "name": "NoteRoom", "class_name": "NoteRoom" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["NoteRoom"] }],
}
```

Keep the template's other fields (`main`, `compatibility_date`, etc.).

`worker/rooms/note-room.ts`:

```ts
import { DurableObject } from "cloudflare:workers"

// Phase 1 replaces this with a y-partyserver YServer.
export class NoteRoom extends DurableObject {}
```

In `worker/index.ts` add `export { NoteRoom } from "./rooms/note-room"`.

Then regenerate types: `pnpm wrangler types` (add a `cf-typegen` script if the template lacks one).

Rules (context §11): DO classes go under `new_sqlite_classes`. Never edit the `v1` migration later; add `v2`.

### 9. Docs

- `CLAUDE.md`: short agent rules from context §13. Mention pnpm.
- `README.md`: make sure setup/run/deploy use `pnpm`; add the shadcn add-component command.
- `docs/project-context.md`:
  - §2: add rows `Package manager: pnpm`, `UI kit: shadcn/ui + Tailwind v4`.
  - §5: add `components.json`, `src/components/ui/`.
  - §6: add a Phase 0 row for Tailwind + shadcn.
  - §10 Phase 0: tick boxes, add `- [ ] shadcn/ui init`.
  - Replace `npm` commands with `pnpm`.

### 10. Done checklist

- [x] `pnpm dev` runs React app + Worker with no errors
- [x] `pnpm build` passes; typecheck clean (`pnpm exec tsc -b` or template script)
- [x] `pnpm exec wrangler deploy --dry-run` accepts the config
- [x] shadcn smoke test passed and cleaned up
- [x] Layout matches context §5, no leftover template junk
- [x] `README.md` is still yours (not create-vite's)
- [x] Context §10 Phase 0 boxes ticked

### 11. Commit (suggested split)

1. `chore: scaffold cloudflare react template`
2. `feat: add tailwind v4, path alias and shadcn/ui init`
3. `chore: configure wrangler NoteRoom binding and sqlite migration`
4. `docs: add CLAUDE.md, update README and project context`

## Traps

- create-vite overwriting `README.md` (step 2).
- pnpm blocking `workerd`/`esbuild` postinstall (step 3).
- shadcn init fails if alias is missing from either tsconfig file (steps 4–5).
- Missing `new_sqlite_classes` breaks DOs on the free plan (step 8).

## Next

`docs/plans/phase-1-sync.md`: TipTap + Yjs + `NoteRoom` as `YServer`. Write after Phase 0 is done.

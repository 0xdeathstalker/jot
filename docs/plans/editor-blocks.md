# Plan: Editor blocks (checklists, Markdown, link, image, paragraph)

Status: in progress (A done; B to E in code, manual checks pending)
Source: GitHub issue [#1](https://github.com/0xdeathstalker/jot/issues/1), `docs/project-context.md` §6 (dependencies), §11 (traps).

Goal: the editor gets checklists, a Raycast Notes style toolbar (dropdowns for headings, text styles and lists; highlighted when the cursor is in that formatting), links, images and Markdown copy/download/paste. Everything still lives in the note's Y.Doc and syncs as today.

## Packages (all MIT, checked with `pnpm view` on 2026-11-14)

| Package                   | Version | Why                                                    |
| ------------------------- | ------- | ------------------------------------------------------ |
| `@tiptap/extension-list`  | 3.34.0  | `TaskList` + `TaskItem`                                |
| `@tiptap/extension-image` | 3.34.0  | Image node                                             |
| `@tiptap/markdown`        | 3.34.0  | `editor.getMarkdown()`, parse Markdown (uses `marked`) |

The new packages peer on `@tiptap/core`/`@tiptap/pm` **3.34.0 exactly**; we run 3.33.1. Bump every `@tiptap/*` package together to 3.34.0 first (`@tiptap/y-tiptap` is versioned separately, leave it).

## Decisions

| Topic          | Choice                                                                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Image storage  | **Decided: inside the note (base64 data URL in the Y.Doc).** Shrunk on the device first. Free, works offline, syncs like text, no new service. Caps: **300 KB per image** (after shrinking), **4 MB per note** (the server row limit is 8 MB, `docs/project-context.md` §11). Server uploads (R2) are out of scope |
| Image sources  | Paste (screenshots, "Copy image"), drag and drop, and a toolbar button that opens the file picker (photo library / camera on iOS). When the clipboard has both a file and an `<img>` address, the file wins, so the image never depends on another site                                                            |
| Code blocks    | **Decided: unchanged.** Plain StarterKit code block with its current styles. No languages, no highlighting                                                                                                                                                                                                         |
| Markdown scope | **Decided: both directions.** Out: "Copy as Markdown" and "Download .md" in a toolbar menu. In: pasting plain text that looks like Markdown becomes rich text. No `.md` file import                                                                                                                                |
| Link click     | `openOnClick: false` while editing (click places the cursor); viewers can click through. Links open in a new tab with `rel="noopener noreferrer nofollow"` (Link's default)                                                                                                                                        |

## Risk: old app versions delete new blocks (read before shipping)

`y-tiptap` (like `y-prosemirror`) builds ProseMirror nodes from the Y.Doc. When a client's schema does not know a node type (an old cached PWA meets a `taskList`), it cannot build the node and **removes it from the shared Y.Doc**, which syncs the deletion to everyone. **Confirmed** in `@tiptap/y-tiptap` 3.3.0 (`deleteYType`, "Deletes shared content that the editor schema cannot display"). With `enableContentCheck` it reports the error instead of deleting, and Collaboration emits `contentError` with `disableCollaboration()` (sets `isDisabled`, destroys the Y.Doc).

Mitigations, all in this plan:

1. Ship all new node types (**taskList, taskItem, image**) in **one release**, so there is one "old vs new" boundary, not several.
2. Turn on Collaboration's `enableContentCheck` (needs extension-collaboration ≥ 3.33 and y-tiptap ≥ 3.2: we have both). On `contentError`, stop syncing that editor (`editor.storage.collaboration.isDisabled = true`, per Tiptap docs; verify) and show "This note uses a newer version of Jot. Reload to update." This protects every future schema change, not only this one.
3. The service worker already uses `registerType: "autoUpdate"`; check that an open old tab reloads on update (phase 5 behaviour) and note the result in step F.

## Steps

### A. Packages

- [x] **A1.** `pnpm up "@tiptap/*"` to 3.34.0, then `pnpm add @tiptap/extension-list @tiptap/extension-image @tiptap/markdown`. Update §6 in `docs/project-context.md`. Done when: `pnpm check` passes and the app still syncs two tabs.

### B. Schema safety (before any new node)

- [ ] **B1.** `enableContentCheck: true` on the editor plus `onContentError` and a banner in `src/editor/editor.tsx`. **Done in code:** on error it stops the socket (`stopSyncing`), calls `disableCollaboration()`, makes the editor read-only and shows "This note uses a newer version of Jot. Reload to update." with a Reload button. Manual check (`pnpm dev`, one tab): temporarily add `TaskList, TaskItem` to the extensions, make a checklist in a note (type `[ ] `, with the space), remove them again (the page reloads), open the note: the banner shows and nothing can be typed. Add them back: the checklist is still there (nothing was deleted from IndexedDB or the server).

### C. Checklists and toolbar

- [x] **C1. Checklist node.** `TaskList` + `TaskItem.configure({ nested: true })` in the editor. Done when: a checklist renders with a checkbox per line and ticking one syncs to a second tab. **Done in code** (`src/editor/editor.tsx`).
- [x] **C1a. Typing shortcuts (Raycast Notes style).** At the start of a line, these turn the line into a checklist item when the **space** after them is typed: **Done in code** (`src/editor/task-item.ts`). The `- [ ] ` rule swaps the bullet item for a checklist item directly (ProseMirror's `liftListItem` refuses a transaction that already holds the deletion of `[ ] `). Checked headlessly (happy-dom, a throwaway script outside the repo): `[] `, `[ ] `, `[x] `, `- [ ] `, `* [x] `, `+ [] `, middle of a bullet list (splits it), nested bullet (checkbox under the parent), text before the brackets (no change): all pass. Enter/Backspace behaviour still to check by hand.
  - `[] `, `[ ] ` (unticked) and `[x] ` (ticked). TaskItem's built-in rule already matches these (`/^\s*(\[([( |x])?\])\s$/` in `@tiptap/extension-list` 3.34.0): note the trigger is the space (owner confirmed: convert after the space, not on `]`), typing `[]` alone does nothing.
  - `- [] `, `- [ ] `, `- [x] ` (also with `*` or `+`). Today `- ` becomes a bullet first, then `[ ] ` inside it would nest a checklist **inside** the bullet (bullet + checkbox). Fix: extend `TaskItem` with one extra input rule that fires when the match is at the start of a `bulletList` item. It deletes the typed `[ ] `, lifts that one item out of the bullet list (`liftListItem("listItem")`) and wraps it in a checklist (`toggleTaskList()`), ticked for `x`. Only that item changes: in a 5-item bullet list, doing it on item 3 splits the list around one checklist item.
  - Backspace right after a shortcut undoes it (Tiptap's `undoInputRule`), so `[ ]` can still be typed literally.
  - Done when: each shortcut above gives one checkbox and **no bullet**; `[x] ` gives a ticked item; Enter on a filled item makes a new unticked item; Enter on an empty item leaves the checklist; Backspace at the start of an empty item turns it into a plain line.
- [x] **C1b. Other Markdown typing shortcuts (Raycast Notes style).** Already built into StarterKit 3.34.0 (rules checked in the installed packages), so no code: test each once and fix only what fails. At the start of a line, after the space: `# ` to `###### ` (headings 1–6), `- `, `* `, `+ ` (bullet list), `1. ` (numbered list), `> ` (quote). Three backticks or `~~~` then space or Enter (code block). `---`, `___ `, `*** ` (divider). Inline, when the closing mark is typed: `` `code` ``, `**bold**` / `__bold__`, `*italic*` / `_italic_`, `~~strike~~`. Typing a URL then a space links it (Link `autolink`, D1). Backspace right after any of these undoes it. Done when: each one converts in a note, syncs to a second tab, and survives a reload.
- [x] **C2. Toolbar in Raycast Notes layout.** Rebuild `src/editor/toolbar.tsx` as one row, left to right, groups split by a thin divider: **Done in code** for every slot except Link, Image and `…` (steps D2, E5, F2 add them). Menu items show their keyboard shortcut on the right (⌘⌥⇧ on Apple, Ctrl+Alt+Shift elsewhere, hidden on touch screens; buttons show it in their tooltip), and the active item gets an accent background with medium weight instead of a tick. Not yet seen in a browser: check the focus and iOS points above.

  | Slot          | Control                                                                   | Inside                                                                                                                 | Active when                                     |
  | ------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
  | Heading       | Dropdown `H ▾` (`HeadingIcon` + `ArrowDown01Icon`)                        | Heading 1, Heading 2, Heading 3 (radio items, `toggleHeading({ level })`)                                              | cursor in any heading; the menu marks the level |
  | Text style    | Dropdown `I ▾` (`TextItalicIcon`)                                         | Bold, Italic, Strikethrough, Underline (checkbox items: several can be on at once)                                     | any of the four marks is on                     |
  | Link          | Button (`Link01Icon`), step D2                                            | popover with a URL input                                                                                               | cursor in a link                                |
  | Image         | Button (`Image01Icon`), step E5                                           | file picker                                                                                                            | an image is selected                            |
  | Inline code   | Toggle (`SourceCodeIcon`, `toggleCode()`)                                 | -                                                                                                                      | cursor in inline code                           |
  | Blocks        | Two toggles: Quote (`QuoteDownIcon`), Code block (`CodeSquareIcon`)       | -                                                                                                                      | cursor in that block                            |
  | Lists         | Dropdown (icon of the active list type, else `LeftToRightListBulletIcon`) | Bulleted list, Numbered list, Checklist (radio items: `toggleBulletList()`, `toggleOrderedList()`, `toggleTaskList()`) | cursor in any list; the menu marks the type     |
  | Markdown (F2) | Dropdown `…` (`MoreHorizontalIcon`), pushed to the right                  | Copy as Markdown, Download .md                                                                                         | never                                           |
  - **Highlighting.** Every control is pressed (same style as today's `Toggle`) when the formatting under the cursor or selection matches. A dropdown trigger is pressed when any item inside is active, and its open menu shows which ones (radio dot / check). Keep one `useEditorState` selector that returns all flags, as today.
  - **Back to plain text** (issue's "paragraph" task): choosing the active heading again in the `H` menu turns it back into text (`toggleHeading` does this). No separate "Text" button, to match Raycast.
  - **Underline** is already in StarterKit 3 (`Mod+U`); it only needs the menu item. Markdown has no underline syntax: check what `@tiptap/markdown` exports for it in F1 (probably `<u>…</u>`, acceptable).
  - **Focus.** Choosing a menu item must return the cursor to the editor, not to the trigger: run the command with `chain().focus()` and set the Base UI popup's `finalFocus` so it does not pull focus back (verify the prop on `MenuPrimitive.Popup`). The selection must survive opening a menu, also on iOS. Done when: select a word, pick Bold from `I ▾`, keep typing: the text stays bold and the cursor never jumps.
  - **Components.** Existing shadcn `dropdown-menu` (it has `DropdownMenuRadioItem` and `DropdownMenuCheckboxItem`) and `toggle`. No new package, no new shadcn component except `popover` if D2 needs it.
  - **Viewers.** Every editing control is disabled; the `…` Markdown menu stays enabled.
  - **Phone width.** The row fits a 360 px screen without wrapping (8 controls); if not, the `…` menu wraps last.
  - Done when: every control works, the highlight follows the cursor through bold text, a heading, a link, inline code, a quote, a code block and each list type, and a second tab sees the same formatting.

- [x] **C3.** Styles in `src/styles/index.css`: checkbox aligned with the first line, ticked items muted with a strike-through, no bullet. Done when: it looks right in light and dark. **Done in code.**
- [x] **C4.** Viewer: TaskItem disables its checkbox when the editor is not editable (no `onReadOnlyChecked`). Done when: a viewer cannot tick (and the server already drops viewer edits). **Done in code:** TaskItem reverts a click when read-only; CSS also turns off pointer events on the checkbox for viewers.

### D. Link

- [x] **D1.** `StarterKit.configure({ link: { openOnClick: false, autolink: true } })`, keep the default URL check (blocks `javascript:`). **Done in code:** `openOnClick: false`, `autolink`, `defaultProtocol: "https"`. Ctrl/Cmd+click opens a link in a new tab while editing (`editorProps.handleClick`); for viewers the editor is not editable, so a plain click follows the link. Link styles (colour, underline) in `src/styles/index.css`.
- [x] **D2. Link box (Raycast Notes style).** `src/editor/link-box.tsx`. The toolbar "Link" button (`Link01Icon`, C2 slot) is enabled when text is selected or the cursor is in a link, and is pressed when the cursor is in a link. Clicking it opens a small box **next to the selected text** (not under the button):
  - One input, placeholder "Enter a link...", prefilled with the current link; a ✓ button (apply) and a 🗑 button (remove, shown only when there is a link). Icons: `Tick02Icon`, `Delete02Icon`.
  - Enter or ✓ applies `extendMarkRange("link").setLink({ href })`; an empty value or 🗑 runs `unsetLink()`; Escape closes without changes. `https://` is added when the user typed no scheme. Link's own URL check still blocks `javascript:` and similar.
  - Position: Base UI `Popover` (already installed) with a virtual anchor built from `editor.view.coordsAtPos(from)` / `(to)`, below the selection, flipping above near the bottom of the screen. No new package (Tiptap's `BubbleMenu` would add `@floating-ui/dom`), no shadcn `popover` needed.
  - Focus: the input takes focus when the box opens; after apply/remove/Escape the cursor returns to the editor with the text still selected.
  - **Shortcut: `Ctrl+L` / `⌘L`** (Raycast Notes), only while the note has focus (it overrides the browser's address-bar shortcut there). `⌘K` / `Ctrl+K` stays free for a future command palette (separate issue).
  - **What gets linked:** the selection; else the whole link under the cursor; else the word under the cursor (`src/editor/select-word.ts`, Unicode letters and digits). With none of these (empty line, cursor next to spaces or punctuation only), nothing opens and a short message shows at the bottom: "Select text to add a link" / "Place the cursor inside a word or select text first." (`src/editor/notice.tsx`, closes after 4 s or with ✕). The toolbar button is always enabled for editors, so a click can show that message.
  - **Pointer cursor** over linked text, also while editing (a click still places the cursor; Ctrl/Cmd+click opens).
  - Word selection checked headlessly: inside, at the end and at the start of a word, accented letters, both sides of a line break, a word half in bold, a word in brackets, and no word (punctuation only, empty line): all pass.
  - Done when: select text, open the box, type `example.com`, Enter: the text links to `https://example.com`; reopen on the link: the URL is prefilled; 🗑 removes it; works on a phone (box stays on screen above the keyboard) and a second tab sees the link.
  - **Done in code** (`src/editor/link-box.tsx`, Base UI `Popover` with a virtual anchor at the selection). Checked headlessly with the same commands the box runs: `javascript:` and `data:` refused, `https:` and `mailto:` accepted, applying links the selection, the cursor inside a link selects the whole link, editing replaces the whole link, removing from the cursor removes the whole link. Not yet seen in a browser. Known gap: while the box has focus the editor does not draw the selection highlight (browser behaviour); add a decoration if it confuses.

### E. Images (stored inside the note)

- [ ] **E1. Image node.** `Image.configure({ inline: false, allowBase64: true })`. Accept a `src` only if it is `data:image/(png|jpeg|webp|gif);base64,...` or `https://` (override `src`'s `parseHTML` to drop anything else, e.g. `javascript:` or `data:image/svg+xml`). Done when: a pasted `<img src="javascript:...">` inserts nothing. **Done in code** (`NoteImage` in `src/editor/images.ts`): pasted `<img>` with any other `src` is not parsed, and a bad `src` written straight into the shared doc renders as an empty, hidden image.
- [ ] **E2. Shrink helper.** `src/editor/shrink-image.ts`: `shrinkImage(file: File): Promise<string>` returns a data URL or throws a user-facing message. Steps: refuse anything not `image/*`, and refuse `image/svg+xml`. Decode with `createImageBitmap(file)` (applies EXIF rotation). Scale so the long side is at most 1280 px, draw on a canvas, `toBlob("image/webp", 0.8)`. Safari may not encode WebP: if the blob is not `image/webp`, encode `image/jpeg` instead (fill white first, JPEG has no transparency). Over 300 KB: retry at quality 0.6, then at 1024 px; still over: throw "This image is too large, even after shrinking". Animated GIFs come out as a still image (accepted). Done when: a 4000×3000 phone photo becomes ≤ 300 KB with the right orientation, in Chrome and iOS Safari. **Done in code** (`src/editor/shrink-image.ts`). Needs a real browser to check (canvas encoding).
- [ ] **E3. Note budget.** `fitsInNote(doc, extraBytes)`: `Y.encodeStateAsUpdate(doc).byteLength + extraBytes <= 4 MB`. Every path that adds images calls it with the total length of the new `src`s; over budget, insert nothing and show "This note is full. Put more images in a new note". Done when: inserting past 4 MB is refused and the note still saves and reloads. **Done in code** (`fitsInNote`, `MAX_NOTE_BYTES` in `images.ts`).
- [ ] **E4. Paste and drop.** `editorProps.handlePaste` / `handleDrop`:
  - Clipboard or drop has image files: `preventDefault`, shrink each (E2), check the budget once for all of them (E3), insert at the cursor (paste) or at `view.posAtCoords` (drop). Show a small "Adding image…" state while shrinking.
  - No files but the parsed `slice` contains image nodes (HTML from a web page or another Jot note): drop any `data:` image over 300 KB, then check the budget for the rest. Remote `https://` images are kept as links (they load from that site, and only while it serves them).
  - Done when: a screenshot paste, a "Copy image" from a website, and a dragged file each insert one shrunk image; pasting a web article keeps its text.
  - **Done in code** (`handlePaste`, `handleDrop`, `transformPasted` in `editor.tsx`). Oversized embedded images in pasted HTML are left out (the rest of the paste goes in), and the whole paste is refused only when its images would push the note past 4 MB.
- [ ] **E5. Toolbar button.** "Image" (`Image01Icon`, C2 slot) clicks a hidden `<input type="file" accept="image/*" multiple>`, then runs the same path as E4. `alt` = file name without extension (screenshots get "Image"). Disabled for viewers like every other button. Done when: picking photos on iOS inserts them. **Done in code** (`ImageButton` in `toolbar.tsx`, between link and inline code). `alt`: "image.png" (clipboard screenshots) becomes "Image".
- [ ] **E6. Messages.** Errors from E2/E3 use the same bottom message as the link box (`notify` from `src/editor/notice.tsx`). No toast library. Done when: each refusal shows its message. **Done in code:** "Adding image…" while shrinking, then the error or nothing; "This note is full" / "Put more images in a new note."; "A large image was left out" for oversized embedded images in pasted HTML.
- [ ] **E7. Style.** `max-width: 100%`, `height: auto`, rounded, outline when selected. Done when: a wide image fits on a phone and a selected image is visible in light and dark. **Done in code.**
- Checked headlessly (happy-dom, throwaway script): only `data:image/png|jpeg|webp|gif` and `https://` images parse (javascript:, SVG, http:, data:text/html refused); a bad `src` inserted directly renders empty; an oversized embedded image is dropped with a message while text and small images stay; the byte counting and the 4 MB check; two images inserted mid-paragraph split it and keep their order. Not checked yet: shrinking (needs a browser canvas), paste/drop/picker in a browser, iOS.

### F. Markdown

- [ ] **F1.** Add the `Markdown` extension. Check that it serialises task lists, images and code blocks, and that `- [ ] item` parses as a checklist item, not a bullet with a checkbox (same rule as C1a); any missing piece gets a small custom `renderMarkdown`/`parseMarkdown` on that extension (docs: tiptap.dev/docs/editor/markdown). Images export as `![alt](data:image/webp;base64,...)`: long lines, but the file stays self-contained and opens in most Markdown viewers.
- [ ] **F2.** The `…` toolbar menu (`MoreHorizontalIcon`, C2 slot, shadcn `dropdown-menu`): "Copy as Markdown" (`navigator.clipboard.writeText(editor.getMarkdown())`) and "Download .md" (Blob + `<a download>`, filename from the note title). Works for viewers too.
- [ ] **F3.** Paste: when the clipboard has `text/plain` but no `text/html` and the text looks like Markdown (starts a line with `#`, `-`, `*`, `1.`, `>`, `[ ]`, ` ``` `, `[ ]`, or contains `[x](y)`), insert it with `insertContent(text, { contentType: "markdown" })`. Pasting from web pages (has HTML) keeps the normal behaviour. Images in pasted Markdown go through the E3 budget check. Done when: pasting the test snippet below renders headings, a checklist, a link and a code block.

### G. Check and close

- [ ] **G1.** `getTitleAndPreview(editor.getText())` still gives a sensible title for a note that starts with a checklist, a code block or an image (no code change expected).
- [ ] **G2.** Two tabs, one offline: every block above edits offline and merges on reconnect, including an image pasted while offline.
- [ ] **G3.** Viewer account: cannot tick, cannot edit links, cannot paste, drop or pick images; Markdown copy/download works.
- [ ] **G3b. Heavy note.** Fill a note to about 4 MB with images. Check, in `wrangler dev` and on the deployed app: typing still saves (no `onSave` error in the Worker logs, no CPU-limit error), a reload from another device restores every image, and opening the note on a phone is acceptable. Write the result here. If saves fail below 4 MB, lower the note cap (E3) to what works.
- [ ] **G4.** `pnpm check`; `pnpm build && pnpm preview`: no precached file over 2 MiB (note the main chunk size before and after in this plan). Before this plan: not measured. After step C: main chunk 1,058.68 kB (gzip 341 kB), precache 1,149 KiB. After step D: 1,069.74 kB (gzip 344 kB), precache 1,161 KiB. After step E: 1,086.49 kB (gzip 350 kB), precache 1,178 KiB.
- [ ] **G5.** Old-client test: build the current `main`, open a note in it, add a checklist from the new build in another tab; the old tab shows the banner (B1) and the checklist survives.
- [ ] **G6.** Tick §6 in `docs/project-context.md`, add the image-storage and Markdown decisions to §12, add two traps to §11: "old schema deletes unknown nodes" and "images live inside the note: keep the 4 MB note cap, the DO row limit is 8 MB and a failed save is lost server-side". Close issue #1.

Test snippet for F3:

````md
# Heading

- [ ] todo
- [x] done

A [link](https://example.com).

```
const x: number = 1
```
````

## Out of scope

Image upload to a server (R2), image resizing or captions inside the editor, downloading remote images into the note, a server-side note size check, `.md` file import, tables, text colour/highlight, slash commands, code-block languages and syntax highlighting (plain code block with its current styles stays).

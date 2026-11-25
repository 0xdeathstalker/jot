import { Popover } from "@base-ui/react/popover"
import {
  ArrowUpRight01Icon,
  Copy01Icon,
  Delete02Icon,
  Link01Icon,
  PencilEdit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { type Editor, getMarkRange, useEditorState } from "@tiptap/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Toggle } from "@/components/ui/toggle"
import type { Notify } from "@/editor/notice"
import { selectWordAtCursor } from "@/editor/select-word"
import { formatShortcut, isApple } from "@/lib/platform"

// "example.com" -> "https://example.com"; anything with a scheme (https:, mailto:) is kept as typed.
// The Link extension still refuses unsafe schemes such as javascript: (setLink returns false).
function toHref(raw: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
}

// A rectangle under the selected text for the box to sit next to (Raycast Notes style). Read on
// every layout pass, so it follows the text when the note scrolls. Multi-line selection: first line.
function selectionAnchor(editor: Editor) {
  return {
    getBoundingClientRect() {
      const { from, to } = editor.state.selection
      const start = editor.view.coordsAtPos(from)
      const end = editor.view.coordsAtPos(to)
      const right = end.top === start.top ? end.right : start.left
      return new DOMRect(start.left, start.top, right - start.left, start.bottom - start.top)
    },
  }
}

// The whole link around the cursor, for the preview to sit above. Lazy like selectionAnchor.
function linkAnchor(editor: Editor) {
  return {
    getBoundingClientRect() {
      const { state, view } = editor
      const range = getMarkRange(state.selection.$from, state.schema.marks.link) ?? state.selection
      const start = view.coordsAtPos(range.from)
      const end = view.coordsAtPos(range.to)
      const right = end.top === start.top ? end.right : start.left
      return new DOMRect(start.left, start.top, right - start.left, start.bottom - start.top)
    },
  }
}

const LINK_KEYS = ["Mod", "L"]

// Toolbar link button plus the box it opens: one URL field, ✓ applies, 🗑 removes. Also Ctrl/Cmd+L
// (Raycast Notes). What it links: the selection; else the whole link under the cursor; else the
// word under the cursor; else nothing, and a short message says what to do.
export function LinkBox({
  editor,
  inLink,
  disabled,
  notify,
}: {
  editor: Editor
  inLink: boolean
  disabled: boolean
  notify: Notify
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const show = () => {
    if (disabled) return
    if (editor.state.selection.empty) {
      // In a link: select all of it, so the box sits under it and edits all of it.
      if (editor.isActive("link")) editor.chain().extendMarkRange("link").run()
      else if (!selectWordAtCursor(editor)) {
        notify({
          title: "Select text to add a link",
          description: "Place the cursor inside a word or select text first.",
        })
        editor.commands.focus()
        return
      }
    }
    setValue((editor.getAttributes("link").href as string | undefined) ?? "")
    setInvalid(false)
    setOpen(true)
  }

  // Ctrl/Cmd+L while typing in the note. Browsers use it for the address bar; the editor takes it
  // only while it has focus. The ref keeps the listener on the latest `show`.
  const showRef = React.useRef(show)
  React.useLayoutEffect(() => {
    showRef.current = show
  })
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isApple() ? event.metaKey : event.ctrlKey
      if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "l") return
      if (!editor.isFocused) return
      event.preventDefault()
      showRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [editor])

  // Close and put the cursor back in the editor, selection unchanged.
  const close = () => {
    setOpen(false)
    editor.commands.focus()
  }

  // Preview (Raycast Notes): cursor inside a link, nothing selected, editor focused, link box closed.
  // Escape or a click elsewhere hides it until the cursor moves.
  const preview = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { selection } = editor.state
      const show = editor.isFocused && selection.empty && editor.isActive("link")
      return show
        ? { href: String(editor.getAttributes("link").href ?? ""), at: selection.from }
        : null
    },
  })
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null)
  const showPreview = !!preview?.href && !open && !disabled && preview.at !== dismissedAt

  // Copied: the copy button shows a tick for 2 s instead of a toast. A refusal still gets a toast.
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copyLink = (href: string) => {
    navigator.clipboard.writeText(href).then(
      () => setCopied(true),
      () => notify({ title: "Could not copy", description: "The browser did not allow it." }),
    )
  }

  // Unlink but keep the cursor where it was (remove() leaves the old link text selected).
  const unlinkAtCursor = () => {
    const { from } = editor.state.selection
    editor.chain().focus().extendMarkRange("link").unsetLink().setTextSelection(from).run()
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    setOpen(false)
  }

  const apply = (event: React.FormEvent) => {
    event.preventDefault()
    const raw = value.trim()
    if (!raw) return remove()
    const href = toHref(raw)
    if (!editor.can().setLink({ href })) {
      setInvalid(true)
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
    setOpen(false)
  }

  return (
    <>
      <Popover.Root
        open={showPreview}
        onOpenChange={(next) => {
          if (!next && preview) setDismissedAt(preview.at)
        }}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={linkAnchor(editor)}
            side="top"
            align="start"
            sideOffset={6}
            className="z-50"
          >
            {/* No focus moves into the preview: typing continues in the note. Buttons keep the
              editor focused (onMouseDown preventDefault in PreviewButton). */}
            <Popover.Popup
              initialFocus={false}
              finalFocus={false}
              className="flex items-center gap-0.5 rounded-[10px] bg-popover p-1 pl-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
            >
              <span
                className="mr-1 max-w-48 truncate text-sm text-muted-foreground"
                title={preview?.href}
              >
                {preview?.href}
              </span>
              <PreviewButton label="Edit link" icon={PencilEdit02Icon} onClick={show} />
              <PreviewButton
                label={copied ? "Copied" : "Copy link"}
                icon={copied ? Tick02Icon : Copy01Icon}
                onClick={() => preview && copyLink(preview.href)}
              />
              <PreviewButton
                label="Open link"
                icon={ArrowUpRight01Icon}
                onClick={() =>
                  preview && window.open(preview.href, "_blank", "noopener,noreferrer")
                }
              />
              <PreviewButton
                label="Remove link"
                icon={Delete02Icon}
                variant="destructive"
                onClick={unlinkAtCursor}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Popover.Root open={open} onOpenChange={(next) => (next ? show() : close())}>
        <Toggle
          size="sm"
          aria-label="Link"
          aria-keyshortcuts={isApple() ? "Meta+L" : "Control+L"}
          title={`Link (${formatShortcut(LINK_KEYS)})`}
          pressed={inLink}
          disabled={disabled}
          onPressedChange={show}
        >
          <HugeiconsIcon icon={Link01Icon} />
        </Toggle>
        <Popover.Portal>
          <Popover.Positioner
            anchor={selectionAnchor(editor)}
            side="bottom"
            align="start"
            sideOffset={6}
            className="z-50"
          >
            {/* finalFocus false: close() returns focus to the editor itself. */}
            <Popover.Popup
              initialFocus={inputRef}
              finalFocus={false}
              className="rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10"
            >
              <form onSubmit={apply} className="flex items-center gap-1">
                <Input
                  ref={inputRef}
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Link address"
                  placeholder="Enter a link..."
                  aria-invalid={invalid || undefined}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value)
                    setInvalid(false)
                  }}
                  className="h-8 w-64 max-w-[calc(100vw-7rem)]"
                />
                <Button type="submit" size="icon-sm" variant="ghost" aria-label="Apply link">
                  <HugeiconsIcon icon={Tick02Icon} />
                </Button>
                {inLink && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="destructive"
                    aria-label="Remove link"
                    onClick={remove}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                )}
              </form>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}

function PreviewButton({
  label,
  icon,
  variant = "ghost",
  onClick,
}: {
  label: string
  icon: IconSvgElement
  variant?: "ghost" | "destructive"
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={variant}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  )
}

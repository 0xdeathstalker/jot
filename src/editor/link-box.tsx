import { Popover } from "@base-ui/react/popover"
import { Delete02Icon, Link01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Editor } from "@tiptap/react"
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
                  variant="ghost"
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
  )
}

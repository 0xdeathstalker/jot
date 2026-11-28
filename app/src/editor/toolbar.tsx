import {
  ArrowDown01Icon,
  Cancel01Icon,
  CheckListIcon,
  CodeSquareIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  HeadingIcon,
  Image01Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  QuoteDownIcon,
  SourceCodeIcon,
  TextBoldIcon,
  TextFontIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { type Editor, useEditorState } from "@tiptap/react"
import * as React from "react"

import { ShortcutTooltip } from "@/components/shortcut-tooltip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Toggle, toggleVariants } from "@/components/ui/toggle"
import { imageFiles } from "@/editor/images"
import { LinkBox } from "@/editor/link-box"
import type { Notify } from "@/editor/notice"
import { getTitleAndPreview } from "@/features/notes/note-meta"
import { useLayout } from "@/hooks/use-layout"
import { useToolbarHidden } from "@/hooks/use-toolbar-hidden"
import { shortcutKeys } from "@/lib/platform"
import { cn } from "@/lib/utils"

type Item = {
  label: string
  icon: IconSvgElement
  // Tiptap's default shortcut for this command ("Mod" = Cmd on Apple, Ctrl elsewhere).
  keys: string[]
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const headingIcons = [Heading01Icon, Heading02Icon, Heading03Icon]
// Choosing the active heading again turns it back into plain text (toggleHeading does that).
const headings: Item[] = ([1, 2, 3] as const).map((level) => ({
  label: `Heading ${level}`,
  icon: headingIcons[level - 1],
  keys: ["Mod", "Alt", String(level)],
  isActive: (e) => e.isActive("heading", { level }),
  run: (e) => e.chain().focus().toggleHeading({ level }).run(),
}))

const textStyles: Item[] = [
  {
    label: "Bold",
    icon: TextBoldIcon,
    keys: ["Mod", "B"],
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    icon: TextItalicIcon,
    keys: ["Mod", "I"],
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: "Strikethrough",
    icon: TextStrikethroughIcon,
    keys: ["Mod", "Shift", "S"],
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    label: "Underline",
    icon: TextUnderlineIcon,
    keys: ["Mod", "U"],
    isActive: (e) => e.isActive("underline"),
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
]

const inlineCode: Item = {
  label: "Inline code",
  icon: SourceCodeIcon,
  keys: ["Mod", "E"],
  isActive: (e) => e.isActive("code"),
  run: (e) => e.chain().focus().toggleCode().run(),
}

const blocks: Item[] = [
  {
    label: "Quote",
    icon: QuoteDownIcon,
    keys: ["Mod", "Shift", "B"],
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    icon: CodeSquareIcon,
    keys: ["Mod", "Alt", "C"],
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
]

const lists: Item[] = [
  {
    label: "Bulleted list",
    icon: LeftToRightListBulletIcon,
    keys: ["Mod", "Shift", "8"],
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: LeftToRightListNumberIcon,
    keys: ["Mod", "Shift", "7"],
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Checklist",
    icon: CheckListIcon,
    keys: ["Mod", "Shift", "9"],
    isActive: (e) => e.isActive("taskList"),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
]

const flags = (editor: Editor, items: Item[]) => items.map((item) => item.isActive(editor))

// Raycast Notes layout: H ▾ | I ▾ | link | image | <> | quote, code block | lists ▾
// No undo/redo buttons: Collaboration owns undo/redo (keyboard shortcuts still work).
export function Toolbar({
  editor,
  disabled = false,
  notify,
  onPickImages,
  inBar = false,
}: {
  editor: Editor
  disabled?: boolean
  notify: Notify
  onPickImages: (files: File[]) => void
  // Web layout: inside the top bar (editor.tsx portals it there): no frame of its own, one line.
  inBar?: boolean
}) {
  // Tiptap v3 does not re-render React on every transaction: subscribe to the active flags.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      headings: flags(editor, headings),
      textStyles: flags(editor, textStyles),
      inlineCode: inlineCode.isActive(editor),
      inLink: editor.isActive("link"),
      onImage: editor.isActive("image"),
      blocks: flags(editor, blocks),
      lists: flags(editor, lists),
    }),
  })
  const activeList = lists[active.lists.indexOf(true)]
  // Phone and desktop can hide it; web keeps it in the top bar.
  const [hidden, setHidden] = useToolbarHidden()
  const collapsed = hidden && !inBar

  // Phone (phase 9): iOS and Android already keep this bottom-fixed bar above the keyboard (no
  // extra lift; adding the keyboard height doubled it). The close-keyboard button was removed
  // (owner, 2026-11-28): it pushed the bar past the screen width.
  const phone = useLayout() === "phone"
  // Counted only while collapsed: getText on every keystroke is wasted work otherwise.
  const chars = useEditorState({
    editor,
    selector: ({ editor }) => (collapsed ? getTitleAndPreview(editor.getText()).chars : 0),
  })

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      // As wide as its buttons, centred, sticky at the top. Compact like Raycast Notes: 28px
      // buttons, 16px icons, a 34px bar (the [&_button] rules size the Toggles, menu triggers and
      // the link button alike). Below sm: pinned to the bottom of the window (inset-x +
      // mx-auto centres it; left-1/2 would halve the width it may use). Phones (`phone:`, never the
      // desktop app, whose window is often that narrow too) get 36px buttons and 18px
      // icons, still fine to tap. On a phone the formatting buttons scroll sideways when they do
      // not fit, and the Hide toolbar button stays fixed at the end; the desktop app still wraps
      // it (centred), as a mouse wheel cannot scroll sideways.
      // Desktop app: always at the bottom of the window, like Raycast Notes. Web: inside the top
      // bar (`inBar`), same frame; a narrow bar scrolls it sideways rather than wrapping it.
      // Hover and pressed: the text colour at 10% / 15% over the bar. The theme's muted is almost the
      // bar's own colour in dark mode, so the usual hover:bg-muted barely showed.
      className={cn(
        "sticky top-0 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-[10px] border bg-popover p-0.5 max-sm:fixed max-sm:inset-x-2 max-sm:top-auto max-sm:bottom-[max(0.5rem,env(safe-area-inset-bottom))] desktop:fixed desktop:inset-x-2 desktop:top-auto desktop:bottom-2 [&_button]:h-7 [&_button]:min-w-7 [&_button]:px-1.5 phone:[&_button]:h-9 phone:[&_button]:min-w-9 phone:[&_button]:px-1 [&_button:hover]:bg-foreground/10 [&_button[aria-pressed=true]]:bg-foreground/15 [&_svg:not([class*='size-'])]:size-4 phone:[&_svg:not([class*='size-'])]:size-[18px]",
        inBar &&
          "static w-auto max-w-full [scrollbar-width:none] flex-nowrap justify-start overflow-x-auto",
        // Phone (owner): one row, never wrapped. `w-fit` of an unwrapped row is its full width, and
        // max-w-full is the whole screen, not less the inset-x-2 margins: cap it at the screen
        // less those 1rem, or it runs off the right edge. The scrolling happens inside (below).
        phone && "max-w-[calc(100vw-1rem)] flex-nowrap",
      )}
    >
      {collapsed ? (
        // Hidden (phase 8): the note's character count, same rule as the switcher's, and a T
        // button that brings the toolbar back.
        <>
          <span className="px-2 text-xs text-muted-foreground tabular-nums">
            {chars} character{chars === 1 ? "" : "s"}
          </span>
          <ShortcutTooltip label="Show toolbar">
            <button
              type="button"
              aria-label="Show toolbar"
              className={toggleVariants({ size: "sm" })}
              onClick={() => setHidden(false)}
            >
              <HugeiconsIcon icon={TextFontIcon} />
            </button>
          </ShortcutTooltip>
        </>
      ) : (
        <>
          {/* Phone: the formatting groups scroll sideways in here (hidden scrollbar), so Hide
              toolbar, outside it, is always in view. shadcn's `scroll-fade-x` fades the right edge
              while more buttons lie that way (the left once scrolled). Elsewhere `contents`. */}
          <div
            className={
              phone
                ? "flex min-w-0 scroll-fade-x [scrollbar-width:none] items-center overflow-x-auto overscroll-x-contain [&>*]:shrink-0"
                : "contents"
            }
          >
            <Group>
              <Menu
                label="Headings"
                icon={HeadingIcon}
                items={headings}
                checked={active.headings}
                single
                editor={editor}
                disabled={disabled}
              />
              <Menu
                label="Text style"
                icon={TextItalicIcon}
                items={textStyles}
                checked={active.textStyles}
                editor={editor}
                disabled={disabled}
              />
              <LinkBox editor={editor} inLink={active.inLink} disabled={disabled} notify={notify} />
              <ImageButton pressed={active.onImage} disabled={disabled} onPick={onPickImages} />
              <Button
                item={inlineCode}
                pressed={active.inlineCode}
                editor={editor}
                disabled={disabled}
              />
            </Group>
            <Group>
              {blocks.map((item, i) => (
                <Button
                  key={item.label}
                  item={item}
                  pressed={active.blocks[i]}
                  editor={editor}
                  disabled={disabled}
                />
              ))}
            </Group>
            <Group>
              <Menu
                label="Lists"
                icon={activeList?.icon ?? LeftToRightListBulletIcon}
                items={lists}
                checked={active.lists}
                single
                editor={editor}
                disabled={disabled}
              />
            </Group>
          </div>
          {!inBar && (
            <Group>
              <ShortcutTooltip label="Hide toolbar">
                <button
                  type="button"
                  aria-label="Hide toolbar"
                  className={toggleVariants({ size: "sm" })}
                  onClick={() => setHidden(true)}
                >
                  <span className="grid size-4 place-items-center rounded-full bg-muted-foreground/25">
                    <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" strokeWidth={2.5} />
                  </span>
                </button>
              </ShortcutTooltip>
            </Group>
          )}
        </>
      )}
    </div>
  )
}

// Opens the file picker (photo library / camera on phones). Pressed when an image is selected.
function ImageButton({
  pressed,
  disabled,
  onPick,
}: {
  pressed: boolean
  disabled: boolean
  onPick: (files: File[]) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <ShortcutTooltip label="Image">
        <Toggle
          size="sm"
          aria-label="Image"
          pressed={pressed}
          disabled={disabled}
          onPressedChange={() => inputRef.current?.click()}
        >
          <HugeiconsIcon icon={Image01Icon} />
        </Toggle>
      </ShortcutTooltip>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = imageFiles(event.target.files)
          event.target.value = "" // picking the same file again must fire onChange
          if (files.length) onPick(files)
        }}
      />
    </>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 not-first:ml-0.5 not-first:border-l not-first:pl-1">
      {children}
    </div>
  )
}

type Common = { editor: Editor; disabled: boolean }

function Button({ item, pressed, editor, disabled }: Common & { item: Item; pressed: boolean }) {
  return (
    <ShortcutTooltip label={item.label} keys={item.keys}>
      <Toggle
        size="sm"
        aria-label={item.label}
        pressed={pressed}
        disabled={disabled}
        onPressedChange={() => item.run(editor)}
      >
        <HugeiconsIcon icon={item.icon} />
      </Toggle>
    </ShortcutTooltip>
  )
}

// A dropdown that looks pressed when anything inside it is active. `single`: one choice at a time
// (headings, lists), radio items; otherwise checkbox items (several marks can be on). Both keep their
// checked state for screen readers but show it as an accent background, not a tick. Font weight tells
// it apart from the hover highlight, which uses the same accent colour in this theme.
const itemClass =
  "pr-3 focus:bg-foreground/10 data-checked:bg-foreground/15 data-checked:font-medium data-checked:text-accent-foreground *:data-[slot$=indicator]:hidden rounded-4xl"
function Menu({
  label,
  icon,
  items,
  checked,
  single = false,
  editor,
  disabled,
}: Common & {
  label: string
  icon: IconSvgElement
  items: Item[]
  checked: boolean[]
  single?: boolean
}) {
  const anyActive = checked.includes(true)
  const entries = items.map((item, i) => {
    const content = (
      <>
        <HugeiconsIcon icon={item.icon} />
        {item.label}
        {/* Hidden on touch screens: no keyboard to press them on. */}
        <DropdownMenuShortcut className="flex gap-0.5 pl-4 tracking-normal pointer-coarse:hidden">
          {shortcutKeys(item.keys).map((key) => (
            <Kbd key={key} size="sm" className="border border-muted-foreground/60">
              {key}
            </Kbd>
          ))}
        </DropdownMenuShortcut>
      </>
    )
    // onClick, not onValueChange: choosing the selected heading again must still run (back to text).
    return single ? (
      <DropdownMenuRadioItem
        key={item.label}
        value={item.label}
        className={itemClass}
        closeOnClick
        onClick={() => item.run(editor)}
      >
        {content}
      </DropdownMenuRadioItem>
    ) : (
      <DropdownMenuCheckboxItem
        key={item.label}
        checked={checked[i]}
        className={itemClass}
        closeOnClick
        onClick={() => item.run(editor)}
      >
        {content}
      </DropdownMenuCheckboxItem>
    )
  })

  return (
    <DropdownMenu>
      <ShortcutTooltip label={label}>
        <DropdownMenuTrigger
          aria-label={label}
          disabled={disabled}
          className={cn(
            toggleVariants({ size: "sm" }),
            "gap-0.5 px-2",
            "data-popup-open:bg-foreground/15",
            anyActive && "bg-foreground/15 text-foreground",
          )}
        >
          <HugeiconsIcon icon={icon} />
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3!" />
        </DropdownMenuTrigger>
      </ShortcutTooltip>
      {/* finalFocus false: the command already put the cursor back in the editor; returning focus
          to the trigger would take it away again. */}
      {/* `bg-raised` (styles/index.css): lighter than the page in dark mode, so the open menu stands
          out from the note behind it. Hover and checked rows use the text colour, as on the bar. */}
      <DropdownMenuContent finalFocus={false} className="w-auto rounded-[12px] bg-raised">
        {single ? (
          <DropdownMenuRadioGroup value={items[checked.indexOf(true)]?.label ?? ""}>
            {entries}
          </DropdownMenuRadioGroup>
        ) : (
          entries
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import {
  ArrowDown01Icon,
  CheckListIcon,
  CodeSquareIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  HeadingIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  QuoteDownIcon,
  SourceCodeIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { type Editor, useEditorState } from "@tiptap/react"
import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toggle, toggleVariants } from "@/components/ui/toggle"
import { LinkBox } from "@/editor/link-box"
import type { Notice } from "@/editor/notice"
import { formatShortcut as shortcut } from "@/lib/platform"
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

// Raycast Notes layout: H ▾ | I ▾ | link | <> | quote, code block | lists ▾.
// No undo/redo buttons: Collaboration owns undo/redo (keyboard shortcuts still work).
export function Toolbar({
  editor,
  disabled = false,
  notify,
}: {
  editor: Editor
  disabled?: boolean
  notify: (notice: Notice) => void
}) {
  // Tiptap v3 does not re-render React on every transaction: subscribe to the active flags.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      headings: flags(editor, headings),
      textStyles: flags(editor, textStyles),
      inlineCode: inlineCode.isActive(editor),
      inLink: editor.isActive("link"),
      blocks: flags(editor, blocks),
      lists: flags(editor, lists),
    }),
  })
  const activeList = lists[active.lists.indexOf(true)]

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-background py-2"
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
        <Button item={inlineCode} pressed={active.inlineCode} editor={editor} disabled={disabled} />
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
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1 not-first:border-l not-first:pl-1">{children}</div>
}

type Common = { editor: Editor; disabled: boolean }

function Button({ item, pressed, editor, disabled }: Common & { item: Item; pressed: boolean }) {
  return (
    <Toggle
      size="sm"
      aria-label={item.label}
      title={`${item.label} (${shortcut(item.keys)})`}
      pressed={pressed}
      disabled={disabled}
      onPressedChange={() => item.run(editor)}
    >
      <HugeiconsIcon icon={item.icon} />
    </Toggle>
  )
}

// A dropdown that looks pressed when anything inside it is active. `single`: one choice at a time
// (headings, lists), radio items; otherwise checkbox items (several marks can be on). Both keep their
// checked state for screen readers but show it as an accent background, not a tick. Font weight tells
// it apart from the hover highlight, which uses the same accent colour in this theme.
const itemClass =
  "pr-3 data-checked:bg-accent data-checked:font-medium data-checked:text-accent-foreground *:data-[slot$=indicator]:hidden"
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
        <DropdownMenuShortcut className="pl-4 pointer-coarse:hidden">
          {shortcut(item.keys)}
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
      <DropdownMenuTrigger
        aria-label={label}
        disabled={disabled}
        className={cn(
          toggleVariants({ size: "sm" }),
          "gap-0.5 px-2",
          anyActive && "bg-muted text-foreground",
        )}
      >
        <HugeiconsIcon icon={icon} />
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3!" />
      </DropdownMenuTrigger>
      {/* finalFocus false: the command already put the cursor back in the editor; returning focus
          to the trigger would take it away again. */}
      <DropdownMenuContent finalFocus={false} className="w-auto">
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

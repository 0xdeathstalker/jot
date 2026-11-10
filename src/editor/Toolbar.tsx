import {
  CodeSquareIcon,
  Heading01Icon,
  Heading02Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  QuoteDownIcon,
  SourceCodeIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { type Editor, useEditorState } from "@tiptap/react"

import { Toggle } from "@/components/ui/toggle"

type Item = {
  label: string
  icon: IconSvgElement
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

// No undo/redo buttons: Collaboration owns undo/redo (keyboard shortcuts still work).
const groups: Item[][] = [
  [
    {
      label: "Bold",
      icon: TextBoldIcon,
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      icon: TextItalicIcon,
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      label: "Strikethrough",
      icon: TextStrikethroughIcon,
      isActive: (e) => e.isActive("strike"),
      run: (e) => e.chain().focus().toggleStrike().run(),
    },
    {
      label: "Inline code",
      icon: SourceCodeIcon,
      isActive: (e) => e.isActive("code"),
      run: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      label: "Heading 1",
      icon: Heading01Icon,
      isActive: (e) => e.isActive("heading", { level: 1 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "Heading 2",
      icon: Heading02Icon,
      isActive: (e) => e.isActive("heading", { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
  ],
  [
    {
      label: "Bulleted list",
      icon: LeftToRightListBulletIcon,
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: LeftToRightListNumberIcon,
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
  ],
  [
    {
      label: "Quote",
      icon: QuoteDownIcon,
      isActive: (e) => e.isActive("blockquote"),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "Code block",
      icon: CodeSquareIcon,
      isActive: (e) => e.isActive("codeBlock"),
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
  ],
]

export function Toolbar({ editor }: { editor: Editor }) {
  // Tiptap v3 does not re-render React on every transaction: subscribe to the active flags.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => groups.map((group) => group.map((item) => item.isActive(editor))),
  })

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-background py-2"
    >
      {groups.map((group, g) => (
        <div
          key={group[0].label}
          className="flex items-center gap-1 not-first:border-l not-first:pl-1"
        >
          {group.map((item, i) => (
            <Toggle
              key={item.label}
              size="sm"
              aria-label={item.label}
              pressed={active[g][i]}
              onPressedChange={() => item.run(editor)}
            >
              <HugeiconsIcon icon={item.icon} />
            </Toggle>
          ))}
        </div>
      ))}
    </div>
  )
}

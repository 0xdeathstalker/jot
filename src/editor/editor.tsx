import Collaboration, { isChangeOrigin } from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"
import { TaskList } from "@tiptap/extension-list"
import { Markdown } from "@tiptap/markdown"
import type { Node as PMNode } from "@tiptap/pm/model"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  NOTE_FULL,
  NoteImage,
  dropOversizedImages,
  fitsInNote,
  imageFiles,
  insertImageFiles,
  sliceImageBytes,
} from "@/editor/images"
import { MarkdownPaste } from "@/editor/markdown"
import { type Notice, NoticeToast } from "@/editor/notice"
import { TaskItem } from "@/editor/task-item"
import { Toolbar } from "@/editor/toolbar"
import { getTitleAndPreview } from "@/features/notes/note-meta"
import type { CaretUser } from "@/features/sharing/caret-user"
import { NoAccess } from "@/features/sharing/no-access"
import { useAccessLost } from "@/hooks/use-access-lost"
import type { SharedRole } from "@/sync/index-doc"
import { stopSyncing, useNoteSession } from "@/sync/provider"

const META_DEBOUNCE_MS = 500

type Props = {
  noteId: string
  // Called (debounced) after the user's own edits with the note's first line and a preview.
  // Pass a stable function: a new one re-subscribes.
  onMetaChange?: (meta: { title: string; preview: string }) => void
  // Set when someone else owns the note. "viewer" makes the editor read-only (the server also
  // drops a viewer's edits, this is so the screen does not pretend otherwise).
  role?: SharedRole
  // The note is shared (by us, or with us): other people's edits change the title too, so refresh it
  // from them as well, not only from our own typing.
  followRemote?: boolean
  // After access was lost: remove the note from the list and from this device.
  onRemoveLost?: () => void
  // The owner changed our role: the caller reads the new one and updates the list.
  onRoleChanged?: () => void
  // The server said we are no longer a member (learned before opening: no socket is kept).
  noAccess?: boolean
  // Name and colour other people see on our cursor.
  caret: CaretUser
  // Called once, on the first local edit that leaves the note no longer blank (a draft joins the list).
  onEdited?: () => void
  // Focus the editor when set, and again each time it changes (New note pressed while in the draft).
  focusKey?: number
}

// The default content: one empty paragraph. An empty checklist or heading is not blank.
function isBlankDoc(node: PMNode) {
  const first = node.firstChild
  return node.childCount === 1 && first?.type.name === "paragraph" && first.content.size === 0
}

// Content comes from the Y.Doc, never from Tiptap's `content` option.
// undoRedo is off: Collaboration brings its own undo/redo (same shortcuts).
// Keep the default Collaboration `field`; changing it later orphans existing notes.
export function Editor({
  noteId,
  onMetaChange,
  role,
  followRemote,
  onRemoveLost,
  onRoleChanged,
  noAccess,
  caret,
  onEdited,
  focusKey,
}: Props) {
  const session = useNoteSession(noteId)
  const { doc } = session
  const readOnly = role === "viewer"
  const lost = useAccessLost(session, noteId, role !== undefined, onRoleChanged) || !!noAccess
  React.useEffect(() => {
    if (noAccess) stopSyncing(session) // do not keep knocking on a door that is closed
  }, [noAccess, session])

  // The shared doc holds content this version's schema cannot show (a newer Jot added a block type).
  // Without enableContentCheck, y-tiptap deletes that content from the shared doc for everyone.
  const [outdated, setOutdated] = React.useState(false)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const clearNotice = React.useCallback(() => setNotice(null), [])

  const editor = useEditor({
    editable: !readOnly,
    enableContentCheck: true,
    editorProps: {
      handleClick: (_view, _pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) return false
        const link = (event.target as HTMLElement).closest("a[href]")
        if (!(link instanceof HTMLAnchorElement)) return false
        // The Link mark has already dropped unsafe hrefs (javascript: etc.) when rendering.
        window.open(link.href, "_blank", "noopener,noreferrer")
        return true
      },
      // Images are stored inside the note (docs/plans/editor-blocks.md, step E). Files are shrunk
      // first; HTML that already holds images is trimmed to the limits.
      transformPasted: (slice) => dropOversizedImages(slice, setNotice),
      handlePaste: (view, event, slice) => {
        const files = imageFiles(event.clipboardData?.files)
        if (files.length) {
          // "Copy image" in a browser also puts an <img> address on the clipboard: the file wins,
          // so the image never depends on another site.
          event.preventDefault()
          void insertImageFiles(view, doc, files, setNotice)
          return true
        }
        if (fitsInNote(doc, sliceImageBytes(slice))) return false
        setNotice(NOTE_FULL)
        return true
      },
      handleDrop: (view, event, slice, moved) => {
        if (moved) return false // dragging within the note
        const files = imageFiles(event.dataTransfer?.files)
        if (files.length) {
          event.preventDefault()
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
          void insertImageFiles(view, doc, files, setNotice, at?.pos)
          return true
        }
        if (fitsInNote(doc, sliceImageBytes(slice))) return false
        setNotice(NOTE_FULL)
        return true
      },
    },
    onContentError: ({ disableCollaboration }) => {
      // Stop before anything is written back: no sync, no local edits, until the app is reloaded.
      stopSyncing(session)
      disableCollaboration()
      setOutdated(true)
    },
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        // Clicking a link while editing places the cursor; Ctrl/Cmd+click opens it (handleClick
        // below). Viewers' editor is not editable, so a plain click follows the link natively.
        // Ctrl/Cmd+L opens the link box (link-box.tsx). markdownLinks: typing or pasting
        // `[text](url)` makes a link (GitHub style); unsafe URLs stay plain text.
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", markdownLinks: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      NoteImage,
      // Paste plain-text Markdown as formatted text.
      Markdown,
      MarkdownPaste.configure({ doc, notify: setNotice }),
      Collaboration.configure({ document: doc }),
      // Cursors live in Yjs awareness (in memory, never saved): they vanish when a socket closes.
      CollaborationCaret.configure({ provider: session.provider, user: caret }),
    ],
  })

  React.useEffect(() => {
    editor?.setEditable(!readOnly && !outdated)
  }, [editor, readOnly, outdated])

  React.useEffect(() => {
    if (!editor || !onMetaChange) return
    let timer: ReturnType<typeof setTimeout> | undefined

    const push = () => {
      timer = undefined
      if (!editor.isDestroyed) onMetaChange(getTitleAndPreview(editor.getText()))
    }
    // Skip changes that came from Yjs (other devices, IndexedDB load): only local edits write the
    // index, otherwise every device would rewrite the same value forever. Shared notes also follow
    // other people's edits: updateMeta skips unchanged values, so nothing loops.
    const handleUpdate = ({
      transaction,
    }: {
      transaction: Parameters<typeof isChangeOrigin>[0]
    }) => {
      if (!followRemote && isChangeOrigin(transaction)) return
      clearTimeout(timer)
      timer = setTimeout(push, META_DEBOUNCE_MS)
    }

    editor.on("update", handleUpdate)
    return () => {
      editor.off("update", handleUpdate)
      if (timer !== undefined) {
        clearTimeout(timer)
        push() // switching notes inside the debounce window: save the last edit anyway
      }
    }
  }, [editor, onMetaChange, followRemote])

  // The Editor is keyed by note, so "once" means once per opened note. Ref: callers need not memoize.
  const onEditedRef = React.useRef(onEdited)
  React.useLayoutEffect(() => {
    onEditedRef.current = onEdited
  })
  React.useEffect(() => {
    if (!editor) return
    let fired = false
    const handleUpdate = ({
      editor: e,
      transaction,
    }: {
      editor: typeof editor
      transaction: Parameters<typeof isChangeOrigin>[0]
    }) => {
      if (fired || isChangeOrigin(transaction) || isBlankDoc(e.state.doc)) return
      fired = true
      onEditedRef.current?.()
    }
    editor.on("update", handleUpdate)
    return () => {
      editor.off("update", handleUpdate)
    }
  }, [editor])

  React.useEffect(() => {
    if (editor && focusKey !== undefined) editor.commands.focus()
  }, [editor, focusKey])

  if (lost) return <NoAccess onRemove={() => onRemoveLost?.()} />

  return (
    <>
      {outdated ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
          <span>This note uses a newer version of Jot. Reload to update.</span>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      ) : (
        readOnly && (
          <p className="mb-2 rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            View only: you can read this note but not change it.
          </p>
        )
      )}
      <Toolbar
        editor={editor}
        disabled={readOnly || outdated}
        notify={setNotice}
        onPickImages={(files) => void insertImageFiles(editor.view, doc, files, setNotice)}
      />
      <EditorContent editor={editor} />
      <NoticeToast notice={notice} onClose={clearNotice} />
    </>
  )
}

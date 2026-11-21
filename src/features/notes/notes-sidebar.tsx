import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { AccountFooter } from "@/auth/account-footer"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  useSidebar,
} from "@/components/ui/sidebar"
import { NoteList } from "@/features/notes/note-list"
import type { AuthUser } from "@/hooks/use-auth-user"
import { useNoteSearch } from "@/hooks/use-note-search"
import type { Note } from "@/sync/index-doc"

type Props = {
  user: AuthUser
  notes: Note[]
  loading: boolean
  activeId: string | null
  onNew: () => void
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  onShare: (id: string) => void
  onDelete: (id: string) => void
}

// The search text lives here, not in the app: typing in it re-renders the sidebar only, not the
// editor. On phones the sidebar is a sheet (unmounted while closed); picking something closes it.
export function NotesSidebar({ user, notes, loading, onNew, onOpen, onShare, ...rest }: Props) {
  const [query, setQuery] = React.useState("")
  const visibleNotes = useNoteSearch(notes, query)
  const { setOpenMobile } = useSidebar()

  const thenClose =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A) => {
      action(...args)
      setOpenMobile(false)
    }

  return (
    <Sidebar className="pl-[env(safe-area-inset-left)]">
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button onClick={thenClose(onNew)}>
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          New note
        </Button>
        <SidebarInput
          type="search"
          placeholder="Search notes"
          aria-label="Search notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </SidebarHeader>
      <SidebarContent className="px-2">
        {query.trim() && visibleNotes.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No matching notes</p>
        )}
        <NoteList
          notes={visibleNotes}
          loading={loading}
          onOpen={thenClose(onOpen)}
          onShare={thenClose(onShare)}
          {...rest}
        />
      </SidebarContent>
      <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <AccountFooter user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

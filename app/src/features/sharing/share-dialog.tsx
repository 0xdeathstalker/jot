import { Delete02Icon, PencilEdit01Icon, ViewIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type ApiResult,
  changeMemberRole,
  getShareInfo,
  type LinkRole,
  removeMember,
  type ShareInfo,
} from "@/features/sharing/api"

// The chosen role in each toggle group shows in the accent colour.
const SELECTED =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"

const MESSAGES: Record<string, string> = {
  offline: "Go online to share this note.",
  full: "This note already has the maximum number of other people. Remove someone first.",
}

// The owner's Share dialog, opened from the note list: copy the note's permanent view or edit link,
// see who has access, change roles, remove people (which also gives the note new links).
// Everything needs the server, so offline it only says so.
// The caller remounts it (new `key`) on each open, so stale details never flash.
export function ShareDialog({
  noteId,
  open,
  onOpenChange,
  onShared,
}: {
  noteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // Someone besides the owner has access: the list shows the note as "Shared".
  onShared: () => void
}) {
  const [info, setInfo] = React.useState<ShareInfo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<LinkRole>("viewer")
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  // Bumped after every change so the details are read again from the server.
  const [version, setVersion] = React.useState(0)
  const onSharedRef = React.useRef(onShared)
  React.useLayoutEffect(() => {
    onSharedRef.current = onShared
  })

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void getShareInfo(noteId).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setInfo(result.data)
        if (result.data.members.some((m) => m.role !== "owner")) onSharedRef.current()
      } else setError(MESSAGES[result.error] ?? "Could not load sharing details.")
    })
    return () => {
      cancelled = true
    }
  }, [open, noteId, version])

  // "Copied" shows for 2 s, then the button reads "Copy link" again.
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const act = async (action: () => Promise<ApiResult<unknown>>) => {
    setBusy(true)
    setCopied(false)
    const result = await action()
    setError(result.ok ? null : (MESSAGES[result.error] ?? "Something went wrong. Try again."))
    setVersion((v) => v + 1)
    setBusy(false)
  }

  const others = info?.members.filter((m) => m.role !== "owner") ?? []
  const link = info?.links.find((l) => l.role === role)
  const full = info ? others.length >= info.limit : false

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
    } catch {
      // Clipboard blocked: the link is in the box, selectable.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
          <DialogDescription>
            Anyone with a Jot account who opens the link gets access, up to 2 other people.
          </DialogDescription>
        </DialogHeader>

        {/* Two tabs over one fixed-height area: the dialog keeps its size while loading, on errors
            and when switching tabs. The height sits on Tabs, not the panels: TabsContent is flex-1,
            which ignores a panel height. At most 2 other people, so the list fits. */}
        <Tabs defaultValue="link" className="h-36">
          <TabsList className="w-full">
            <TabsTrigger value="link">Link</TabsTrigger>
            <TabsTrigger value="people">People{info ? ` (${others.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="min-h-0 overflow-y-auto pt-2">
            {error && !info ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : !info ? (
              <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
                <span className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
                <span className="h-8 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <ToggleGroup
                  value={[role]}
                  onValueChange={(value) => {
                    const next = value[0]
                    if (next === "editor" || next === "viewer") {
                      setRole(next)
                      setCopied(false)
                    }
                  }}
                  variant="outline"
                  // Full note: no link is shown, so there is nothing to choose a role for.
                  disabled={full}
                  aria-label="What people with the link can do"
                >
                  <ToggleGroupItem value="viewer" className={SELECTED}>
                    Can view
                  </ToggleGroupItem>
                  <ToggleGroupItem value="editor" className={SELECTED}>
                    Can edit
                  </ToggleGroupItem>
                </ToggleGroup>

                {/* Same link for everyone with this role; it admits nobody once the note is full. */}
                {full ? (
                  <p className="text-xs text-muted-foreground">{MESSAGES.full}</p>
                ) : (
                  link && (
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        aria-label={role === "editor" ? "Edit link" : "View link"}
                        value={link.url}
                        onFocus={(event) => event.target.select()}
                        // Ctrl/Cmd+C (or the context menu) on the whole link counts as copied too.
                        onCopy={(event) => {
                          const { selectionStart, selectionEnd, value } = event.currentTarget
                          if (selectionStart === 0 && selectionEnd === value.length) setCopied(true)
                        }}
                      />
                      <Button onClick={() => void copy()} className="h-9">
                        {copied ? "Copied" : "Copy link"}
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="people" className="min-h-0 overflow-y-auto pt-2">
            {error && !info ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : !info ? (
              <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
                <span className="h-9 w-full animate-pulse rounded-lg bg-muted" />
                <span className="h-9 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            ) : others.length === 0 ? (
              <p className="text-sm text-muted-foreground">Only you, so far.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {others.map((member) => (
                  <li key={member.userId} className="flex items-center gap-2 text-sm">
                    {/* Email under the name: two accounts can share a name. */}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{member.name || member.email}</span>
                      <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                    </span>
                    <ToggleGroup
                      value={[member.role]}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`Access for ${member.name || member.email}`}
                      onValueChange={(value) => {
                        const next = value[0]
                        if ((next === "editor" || next === "viewer") && next !== member.role) {
                          void act(() => changeMemberRole(noteId, member.userId, next))
                        }
                      }}
                    >
                      <ToggleGroupItem
                        value="viewer"
                        aria-label="Can view"
                        title="Can view"
                        className={`px-2 ${SELECTED}`}
                      >
                        <HugeiconsIcon icon={ViewIcon} />
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="editor"
                        aria-label="Can edit"
                        title="Can edit"
                        className={`px-2 ${SELECTED}`}
                      >
                        <HugeiconsIcon icon={PencilEdit01Icon} />
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Button
                      size="icon-sm"
                      variant="destructive"
                      disabled={busy}
                      aria-label={`Remove ${member.name || member.email}`}
                      title="Remove"
                      onClick={() => void act(() => removeMember(noteId, member.userId))}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {/* A failed change or removal: the list stays, the reason shows below it. */}
            {error && info && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {error}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

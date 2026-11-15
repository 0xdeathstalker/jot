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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type ApiResult,
  changeMemberRole,
  getShareInfo,
  type LinkRole,
  makeShareLink,
  removeMember,
  type ShareInfo,
  turnOffShareLink,
} from "@/features/sharing/api"

const MESSAGES: Record<string, string> = {
  offline: "Go online to share this note.",
  full: "This note already has the maximum number of other people. Remove someone first.",
}

const daysLeft = (expiresAt: number) =>
  Math.max(1, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))

// The owner's Share dialog, opened from the note list: make or turn off a link for each role, see
// who has access, remove people. Everything needs the server, so offline it only says so.
// The caller remounts it (new `key`) on each open, so stale details never flash.
export function ShareDialog({
  noteId,
  open,
  onOpenChange,
  onLinkMade,
}: {
  noteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinkMade: () => void
}) {
  const [info, setInfo] = React.useState<ShareInfo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [role, setRole] = React.useState<LinkRole>("viewer")
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  // Bumped after every change so the details are read again from the server.
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void getShareInfo(noteId).then((result) => {
      if (cancelled) return
      if (result.ok) setInfo(result.data)
      else setError(MESSAGES[result.error] ?? "Could not load sharing details.")
    })
    return () => {
      cancelled = true
    }
  }, [open, noteId, version])

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

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {info && (
          <div className="flex flex-col gap-4">
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
              aria-label="What people with the link can do"
            >
              <ToggleGroupItem value="viewer">Can view</ToggleGroupItem>
              <ToggleGroupItem value="editor">Can edit</ToggleGroupItem>
            </ToggleGroup>

            {link ? (
              <div className="flex flex-col gap-2">
                <Input
                  readOnly
                  aria-label="Share link"
                  value={link.url}
                  onFocus={(event) => event.target.select()}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void copy()}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(() => turnOffShareLink(noteId, role))}
                  >
                    Turn off link
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Expires in {daysLeft(link.expiresAt)} day
                    {daysLeft(link.expiresAt) === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                className="w-fit"
                disabled={busy || full}
                onClick={() =>
                  void act(async () => {
                    const result = await makeShareLink(noteId, role)
                    if (result.ok) onLinkMade()
                    return result
                  })
                }
              >
                {role === "editor" ? "Create edit link" : "Create view link"}
              </Button>
            )}
            {full && !link && <p className="text-xs text-muted-foreground">{MESSAGES.full}</p>}

            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">People with access</h3>
              {others.length === 0 ? (
                <p className="text-sm text-muted-foreground">Only you, so far.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {others.map((member) => (
                    <li key={member.userId} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate" title={member.email}>
                        {member.name || member.email}
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
                        <ToggleGroupItem value="viewer">View</ToggleGroupItem>
                        <ToggleGroupItem value="editor">Edit</ToggleGroupItem>
                      </ToggleGroup>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void act(() => removeMember(noteId, member.userId))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

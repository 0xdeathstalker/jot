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
import type { JoinInfo } from "@/features/sharing/api"

const invitesLeft = (info: JoinInfo) => Math.max(0, info.limit - info.used)

// "Invites ... n left" in the account area, n = invites left. `info` is null for invited users (the
// server answers 403) and offline: nothing is shown. The dialog itself lives in app.tsx, so the
// Action Panel can open it too (on phones the sidebar is unmounted while closed).
export function InviteButton({ info, onOpen }: { info: JoinInfo | null; onOpen: () => void }) {
  if (!info) return null
  return (
    <div className="border-t pt-2">
      <Button variant="ghost" size="sm" className="w-full justify-between" onClick={onOpen}>
        <span>Invites</span>
        <span className="text-muted-foreground">{invitesLeft(info)} left</span>
      </Button>
    </div>
  )
}

export function InviteDialog({
  info,
  open,
  onOpenChange,
}: {
  info: JoinInfo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copied, setCopied] = React.useState(false)

  // "Copied" shows for 2 s, then the button reads "Copy link" again.
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  if (!info) return null

  const left = invitesLeft(info)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.url)
      setCopied(true)
    } catch {
      // Clipboard blocked: the link is in the box, selectable.
    }
  }

  const handleOpenChange = (next: boolean) => {
    setCopied(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a friend to Jot</DialogTitle>
          <DialogDescription>
            {left === 0
              ? `All ${info.limit} of your invites are used.`
              : `You can invite ${left} more ${left === 1 ? "person" : "people"} (${info.used} of ${info.limit} used).`}
          </DialogDescription>
        </DialogHeader>
        {/* Same link for everyone you invite; it stops admitting people once your invites run out. */}
        {left > 0 && (
          <div className="flex gap-2">
            <Input
              readOnly
              aria-label="Invite link"
              value={info.url}
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
        )}
      </DialogContent>
    </Dialog>
  )
}

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { getJoinInfo, type JoinInfo } from "@/features/sharing/api"

// "Invites (n)" in the account area, n = invites left. Shown only to original users: invited users
// get a 403 from the server and see nothing. Also hidden offline, because it needs the server.
export function InviteFriend() {
  const [info, setInfo] = React.useState<JoinInfo | null>(null)
  const [open, setOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  // On mount (for the count) and again each time the dialog opens, so the count is fresh.
  React.useEffect(() => {
    let cancelled = false
    void getJoinInfo().then((result) => {
      if (!cancelled && result.ok) setInfo(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!info) return null

  const left = Math.max(0, info.limit - info.used)

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
    setOpen(next)
  }

  return (
    <div className="border-t pt-2">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={<Button variant="ghost" size="sm" className="w-full justify-start" />}
        >
          Invites ({left})
        </DialogTrigger>
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
              />
              <Button size="sm" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

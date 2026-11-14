import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getJoinInfo, type JoinInfo, makeJoinLink, turnOffJoinLink } from "@/features/sharing/api"

// "Invite a friend to Jot" in the account area. Shown only to original users: invited users get a
// 403 from the server and see nothing. Also hidden offline, because it needs the server.
export function InviteFriend() {
  const [info, setInfo] = useState<JoinInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getJoinInfo().then((result) => {
      if (!cancelled && result.ok) setInfo(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!info) return null

  const run = async (action: typeof makeJoinLink) => {
    setBusy(true)
    const result = await action()
    if (result.ok) setInfo(result.data)
    setCopied(false)
    setBusy(false)
  }

  const copy = async () => {
    if (!info.link) return
    try {
      await navigator.clipboard.writeText(info.link.url)
      setCopied(true)
    } catch {
      // Clipboard blocked: the link is in the box below, selectable.
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-2 text-sm">
      <Button variant="ghost" size="sm" className="justify-start" onClick={() => setOpen(!open)}>
        Invite a friend to Jot ({info.used} of {info.limit} places used)
      </Button>
      {open && (
        <div className="flex flex-col gap-2 px-1">
          {info.used >= info.limit ? (
            <p className="text-xs text-muted-foreground">All your places are taken.</p>
          ) : info.link ? (
            <>
              <Input
                readOnly
                aria-label="Invite link"
                value={info.link.url}
                onFocus={(event) => event.target.select()}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(turnOffJoinLink)}
                >
                  Turn off
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Valid for 7 days. Send it to up to {info.limit - info.used} more{" "}
                {info.limit - info.used === 1 ? "person" : "people"}.
              </p>
            </>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void run(makeJoinLink)}>
              Create invite link
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

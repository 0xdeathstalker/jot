import { useState } from "react"

import { type AuthUser, signOut } from "@/auth/useAuthUser"
import { Button } from "@/components/ui/button"
import { InviteFriend } from "@/features/sharing/InviteFriend"
import { syncAllLocalData } from "@/sync/provider"

export function AccountFooter({ user }: { user: AuthUser }) {
  const [busy, setBusy] = useState(false)

  // Push everything to the server first. Only if something could not be synced do we ask before
  // throwing it away.
  const handleSignOut = async () => {
    setBusy(true)
    const { failed } = await syncAllLocalData(user.id)
    if (
      failed > 0 &&
      !window.confirm(
        `${failed} note${failed === 1 ? "" : "s"} could not be synced (offline, or not yours). Sign out and discard ${failed === 1 ? "it" : "them"} from this device?`,
      )
    ) {
      setBusy(false)
      return
    }
    await signOut()
  }

  return (
    <div className="flex flex-col gap-2">
      <InviteFriend />
      <div className="flex items-center gap-2 border-t pt-2">
        {user.image ? (
          // Google avatars refuse requests that carry a referrer.
          <img
            src={user.image}
            alt=""
            referrerPolicy="no-referrer"
            className="size-7 rounded-full"
          />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm" title={user.email}>
          {user.name || user.email}
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleSignOut()}>
          {busy ? "Syncing…" : "Sign out"}
        </Button>
      </div>
    </div>
  )
}

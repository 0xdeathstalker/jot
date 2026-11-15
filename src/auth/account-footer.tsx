import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { InviteFriend } from "@/features/sharing/invite-friend"
import { type AuthUser, signOut } from "@/hooks/use-auth-user"
import { syncAllLocalData } from "@/sync/provider"

export function AccountFooter({ user }: { user: AuthUser }) {
  const [busy, setBusy] = React.useState(false)
  // Notes that could not be synced: set while the "discard them?" dialog is open.
  const [unsynced, setUnsynced] = React.useState<number | null>(null)

  // Push everything to the server first. Only if something could not be synced do we ask before
  // throwing it away.
  const handleSignOut = async () => {
    setBusy(true)
    const { failed } = await syncAllLocalData(user.id)
    if (failed > 0) setUnsynced(failed)
    else await signOut()
  }

  // Cancel, Escape: keep the notes and stay signed in.
  const handleDialogChange = (open: boolean) => {
    if (open) return
    setUnsynced(null)
    setBusy(false)
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

      <AlertDialog open={unsynced !== null} onOpenChange={handleDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unsynced === 1 ? "1 note is not synced" : `${unsynced} notes are not synced`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unsynced === 1 ? "It" : "They"} could not be saved to the server (offline, or not
              yours). Signing out deletes {unsynced === 1 ? "it" : "them"} from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void signOut()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

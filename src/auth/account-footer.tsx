import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Logout03Icon, Moon02Icon, Settings02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InviteFriend } from "@/features/sharing/invite-friend"
import { type AuthUser, signOut } from "@/hooks/use-auth-user"
import { useTheme } from "@/hooks/use-theme"
import { syncAllLocalData } from "@/sync/provider"

// Moon first, then sun (owner's sketch).
const THEMES = [
  { value: "dark", label: "Dark mode", icon: Moon02Icon },
  { value: "light", label: "Light mode", icon: Sun03Icon },
]

export function AccountFooter({ user }: { user: AuthUser }) {
  const [busy, setBusy] = React.useState(false)
  // Notes that could not be synced: set while the "discard them?" dialog is open.
  const [unsynced, setUnsynced] = React.useState<number | null>(null)
  const [isDark, setDark] = useTheme()
  const label = user.name ? `${user.name} (${user.email})` : user.email

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
            title={label}
            referrerPolicy="no-referrer"
            className="size-6 rounded-full"
          />
        ) : (
          <span
            title={label}
            className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {(user.name || user.email).charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {busy && "Syncing…"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Settings for ${user.name || user.email}`}
              />
            }
          >
            <HugeiconsIcon icon={Settings02Icon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="rounded-[12px]">
            <div className="flex items-center justify-between gap-4 py-1 pr-1 pl-3 text-sm">
              Mode
              <MenuPrimitive.RadioGroup
                value={isDark ? "dark" : "light"}
                onValueChange={(value) => setDark(value === "dark")}
                className="flex gap-0.5 rounded-4xl border p-0.5"
              >
                {THEMES.map(({ value, label, icon }) => (
                  <MenuPrimitive.RadioItem
                    key={value}
                    value={value}
                    aria-label={label}
                    title={label}
                    className="flex size-7 items-center justify-center rounded-3xl text-muted-foreground outline-hidden data-highlighted:ring-2 data-highlighted:ring-ring/50 data-checked:bg-accent data-checked:text-foreground"
                  >
                    <HugeiconsIcon icon={icon} className="size-4" />
                  </MenuPrimitive.RadioItem>
                ))}
              </MenuPrimitive.RadioGroup>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void handleSignOut()}
              className="rounded-4xl"
            >
              <HugeiconsIcon icon={Logout03Icon} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

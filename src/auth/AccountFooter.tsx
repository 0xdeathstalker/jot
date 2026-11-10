import { type AuthUser, signOut } from "@/auth/useAuthUser"
import { Button } from "@/components/ui/button"

export function AccountFooter({ user }: { user: AuthUser }) {
  return (
    <div className="flex items-center gap-2 border-t pt-2">
      {user.image ? (
        // Google avatars refuse requests that carry a referrer.
        <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm" title={user.email}>
        {user.name || user.email}
      </span>
      <Button variant="ghost" size="sm" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  )
}

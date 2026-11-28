import * as React from "react"

import { getJoinInfo, type JoinInfo } from "@/features/sharing/api"

// Your invite link and count (null for invited users, who get a 403, and offline). Read on mount
// and again each time the invite dialog opens, so the count is fresh.
export function useJoinInfo(dialogOpen: boolean): JoinInfo | null {
  const [info, setInfo] = React.useState<JoinInfo | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void getJoinInfo().then((result) => {
      if (!cancelled && result.ok) setInfo(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [dialogOpen])
  return info
}

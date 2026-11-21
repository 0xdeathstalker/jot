import * as React from "react"

const RELOADED_KEY = "jot-lazy-reloaded"

// React.lazy, but a chunk that fails to load reloads the page once instead of unmounting the whole
// app (React.lazy throws, and nothing above catches it: blank screen). It fails when a deploy
// replaced the file while the page stayed open (the desktop window can stay open for days), or
// when the dev server re-bundles a new dependency. The flag stops a reload loop if it is truly gone.
export function lazyOrReload<P extends object>(
  load: () => Promise<{ default: React.ComponentType<P> }>,
) {
  return React.lazy(() =>
    load().then(
      (module) => {
        try {
          sessionStorage.removeItem(RELOADED_KEY)
        } catch {
          // storage blocked
        }
        return module
      },
      (error: unknown) => {
        try {
          if (!sessionStorage.getItem(RELOADED_KEY)) {
            sessionStorage.setItem(RELOADED_KEY, "1")
            window.location.reload()
            return new Promise<never>(() => {}) // the reload takes over
          }
        } catch {
          // storage blocked: no loop guard, so do not reload
        }
        throw error
      },
    ),
  )
}

// True when focus sits in a dialog other than the one holding `own`: a dialog that closes as
// another opens (Ctrl/⌘+K from the note switcher) must not pull focus back out of it.
export function focusInOtherDialog(own: Element | null): boolean {
  const other = document.activeElement?.closest('[role="dialog"]')
  return !!other && other !== own?.closest('[role="dialog"]')
}

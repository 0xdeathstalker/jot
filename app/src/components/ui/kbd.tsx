import type * as React from "react";
import { cn } from "@/lib/utils";

// A fixed height, not padding: the keycap is as tall as its size says whatever line-height
// it inherits, and text keys and the Enter icon come out the same. `min-w` keeps a
// one-character key from collapsing to a sliver; longer ones grow through `px`.
const SIZES = {
  /** Key-hint bars and ShortcutButton: a filled chip, lighter than the outlined caps below. */
  sm: "h-[18px] min-w-[18px] border-input bg-surface px-1.5 text-[10px] leading-none",
  /** Keys in prose. */
  md: "h-5 min-w-5 px-1 text-[11px] leading-none",
  /** Prominent dialog footers built by hand (not ShortcutButton). */
  lg: "h-6 min-w-6 px-2 text-[10px] leading-none",
} as const;

/** Names a caller may write for the Enter key; all print as the one icon. */
const ENTER_KEYS = new Set(["Enter", "Return", "↵"]);

/** Lucide's corner-down-left, inline: the Enter / Return key. Sized to the keycap's text. */
function EnterIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[1em]"
    >
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
      <path d="m9 10-5 5 5 5" />
    </svg>
  );
}

/**
 * One keycap: outlined, never filled, in the mono face. Every key shown in the UI
 * goes through this, so a key looks the same wherever it appears. Enter prints as
 * an icon, Escape as "Esc"; any other key prints as given.
 */
function Kbd({
  size = "md",
  className,
  children,
  ...props
}: React.ComponentProps<"kbd"> & { size?: keyof typeof SIZES }) {
  const text = typeof children === "string" ? children : null;
  const enter = text !== null && ENTER_KEYS.has(text);
  return (
    <kbd
      aria-label={enter ? "Enter" : undefined}
      className={cn(
        "inline-flex items-center justify-center",
        "rounded border border-muted-foreground/60 font-sans text-muted-foreground",
        SIZES[size],
        className,
      )}
      {...props}
    >
      {enter ? <EnterIcon /> : text === "Escape" ? "Esc" : children}
    </kbd>
  );
}

export { Kbd };

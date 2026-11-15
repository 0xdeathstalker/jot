# Plan: Invites dialog and permanent join link

Status: done in code
Source: owner request, 2026-11-15 (branch `feat/ui-improvements`).

Goal: the sidebar's inline "Invite a friend to Jot…" panel becomes one button, `Invites (<n>)`, that opens a dialog. Each original user has one permanent invite link to copy and share.

## How it works

- `GET /api/join` (`worker/join.ts`) makes the user's link if they have none, makes an existing 7-day link permanent (its URL stays the same), and returns `{ url, used, limit }`. `POST` / `DELETE` are gone.
- `n` = invites left (`limit - used`). Read on mount, and again each time the dialog opens.
- The dialog shows the places left and the link with Copy. Once no places are left it hides the link.
- Every join still checks the 3-place limit on the server (`joinStatus`, `recordJoin`), so the link admits nobody once the places are used.
- Still hidden for invited users (server 403) and offline.

## Decisions

| Topic          | Choice                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link lifetime  | Permanent: `expires_at` set to the largest Date (`8.64e15`). No migration; the columns and the `user_invite_live` unique index stay                        |
| Turn off       | Removed (owner). A leaked link can admit at most the places left                                                                                           |
| GET writes     | `GET /api/join` creates the link. It is idempotent, and a cross-site request cannot read the response, so skipping the Origin check (GET only) is harmless |
| Join page text | `gone` now means only "maker left ALLOWED_EMAILS"; messages no longer say "ask for a new one"                                                              |

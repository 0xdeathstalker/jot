# Sidebar toggle on the toolbar's line

> Superseded (2026-11-28): the sidebar was removed. See `action-panel.md`, phase 5.

Web app, `sm` to `md`: the sidebar toggle sat on its own line above the toolbar. Put it on the
toolbar's line instead, sticky with it when the note scrolls.

- [x] Toggle wrapper in `app.tsx`: `sticky top-2 h-0`, shifted 5px so the 32px button centres on
      the 42px toolbar, at rest and when stuck. Phones (below `sm`) and `md`+ unchanged.
- [ ] Check in the browser at 640 to 767px wide, scrolled and not.

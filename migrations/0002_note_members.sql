-- Who may open which note. Phase 4 writes only role 'owner' (claimed on first connection);
-- Phase 6 adds 'editor' / 'viewer'. See docs/project-context.md section 7.
CREATE TABLE note_members (
  note_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);

-- At most one owner per note: this is what makes "claim on first connection" race-safe.
CREATE UNIQUE INDEX note_one_owner ON note_members (note_id) WHERE role = 'owner';

-- "All notes I can open" (Shared with me, Phase 6).
CREATE INDEX note_members_user_idx ON note_members (user_id);

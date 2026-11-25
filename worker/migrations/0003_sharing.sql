-- Phase 6 sharing. Two kinds of link, both stored as an unguessable token (32 random bytes).

-- "Share this note" links. One live link per note and role; making a new one revokes the old one.
CREATE TABLE note_invites (
  token      TEXT PRIMARY KEY,
  note_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX note_invite_live ON note_invites (note_id, role) WHERE revoked_at IS NULL;

-- "Join Jot" links. One live link per original user (an email on ALLOWED_EMAILS).
CREATE TABLE user_invites (
  token      TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX user_invite_live ON user_invites (created_by) WHERE revoked_at IS NULL;

-- Who joined through whom. The row count per inviter is the "3 places" limit.
CREATE TABLE invited_users (
  user_id    TEXT PRIMARY KEY,
  invited_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX invited_users_by_idx ON invited_users (invited_by);

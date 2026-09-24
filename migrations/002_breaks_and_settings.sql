-- Breaks between focus blocks, and timer lengths the owner can change in the app.

-- A single row. Until it exists, the server uses its built-in defaults.
CREATE TABLE settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  focus_minutes      INTEGER NOT NULL,
  break_minutes      INTEGER NOT NULL,
  long_break_minutes INTEGER NOT NULL,
  -- A long break after this many focus blocks; 0 turns long breaks off.
  long_break_every   INTEGER NOT NULL
);

CREATE TABLE breaks (
  id              INTEGER PRIMARY KEY,
  workday_id      INTEGER NOT NULL REFERENCES workdays (id),
  after_block_id  INTEGER REFERENCES focus_blocks (id),
  kind            TEXT NOT NULL CHECK (kind IN ('short', 'long')),
  started_at      TEXT NOT NULL,
  planned_seconds INTEGER NOT NULL,
  ended_at        TEXT
);

CREATE INDEX breaks_by_workday ON breaks (workday_id);

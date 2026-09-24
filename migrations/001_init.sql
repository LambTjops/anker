-- Phase 1 schema. All timestamps are UTC ISO-8601 strings.

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'inbox'
               CHECK (status IN ('inbox', 'current', 'done', 'dropped')),
  created_at   TEXT NOT NULL,
  completed_at TEXT
);

-- At most one current task.
CREATE UNIQUE INDEX tasks_one_current ON tasks (status) WHERE status = 'current';

CREATE TABLE steps (
  id             INTEGER PRIMARY KEY,
  task_id        INTEGER NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  position       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'replaced')),
  parent_step_id INTEGER REFERENCES steps (id) ON DELETE SET NULL,
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'coach')),
  created_at     TEXT NOT NULL,
  done_at        TEXT
);

CREATE INDEX steps_by_task ON steps (task_id, position);
CREATE INDEX steps_by_done_at ON steps (done_at) WHERE done_at IS NOT NULL;

CREATE TABLE workdays (
  id         INTEGER PRIMARY KEY,
  local_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  end_reason TEXT CHECK (end_reason IN ('manual', 'auto'))
);

CREATE INDEX workdays_by_date ON workdays (local_date);

CREATE TABLE focus_blocks (
  id              INTEGER PRIMARY KEY,
  step_id         INTEGER REFERENCES steps (id) ON DELETE SET NULL,
  workday_id      INTEGER NOT NULL REFERENCES workdays (id),
  started_at      TEXT NOT NULL,
  planned_seconds INTEGER NOT NULL,
  ended_at        TEXT,
  outcome         TEXT CHECK (outcome IN ('done', 'stuck', 'keep_going', 'abandoned'))
);

CREATE INDEX focus_blocks_by_start ON focus_blocks (started_at);

// All SQL lives here. Functions take the db and `now`, and return API-shaped objects.
import type {
  Block,
  BlockOutcome,
  DoneItem,
  Status,
  Step,
  Task,
  TaskStatus,
  Workday,
} from '../../shared/api.ts';
import { logicalDate, mostRecentCutoff } from '../../shared/time.ts';
import { autoCloseAt, blockEndsAt, focusSeconds, type DayConfig } from '../domain/day.ts';
import { conflict, notFound } from '../errors.ts';
import type { Db } from './db.ts';

// ---- Row mapping ----

interface TaskRow {
  id: number;
  title: string;
  notes: string;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

interface StepRow {
  id: number;
  task_id: number;
  text: string;
  position: number;
  status: Step['status'];
  parent_step_id: number | null;
  source: Step['source'];
  created_at: string;
  done_at: string | null;
}

interface WorkdayRow {
  id: number;
  local_date: string;
  started_at: string;
  ended_at: string | null;
  end_reason: Workday['endReason'];
}

interface BlockRow {
  id: number;
  step_id: number | null;
  workday_id: number;
  started_at: string;
  planned_seconds: number;
  ended_at: string | null;
  outcome: BlockOutcome | null;
  step_text: string | null;
}

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  status: r.status,
  createdAt: r.created_at,
  completedAt: r.completed_at,
});

const toStep = (r: StepRow): Step => ({
  id: r.id,
  taskId: r.task_id,
  text: r.text,
  position: r.position,
  status: r.status,
  parentStepId: r.parent_step_id,
  source: r.source,
  createdAt: r.created_at,
  doneAt: r.done_at,
});

const toWorkday = (r: WorkdayRow): Workday => ({
  id: r.id,
  localDate: r.local_date,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  endReason: r.end_reason,
});

const toBlock = (r: BlockRow): Block => ({
  id: r.id,
  stepId: r.step_id,
  stepText: r.step_text,
  startedAt: r.started_at,
  endsAt: blockEndsAt({ startedAt: r.started_at, plannedSeconds: r.planned_seconds }).toISOString(),
  plannedSeconds: r.planned_seconds,
});

const iso = (d: Date) => d.toISOString();

// ---- Tasks ----

export function listTasks(db: Db, statuses: TaskStatus[]): Task[] {
  const placeholders = statuses.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT * FROM tasks WHERE status IN (${placeholders})
       ORDER BY status = 'current' DESC, created_at DESC, id DESC`,
    )
    .all(...statuses) as TaskRow[];
  return rows.map(toTask);
}

function taskRow(db: Db, id: number): TaskRow {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!row) throw notFound('Task');
  return row;
}

export function getTask(db: Db, id: number): Task {
  return toTask(taskRow(db, id));
}

export function createTask(db: Db, title: string, now: Date): Task {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO tasks (title, created_at) VALUES (?, ?)')
    .run(title, iso(now));
  return getTask(db, Number(lastInsertRowid));
}

export function updateTask(
  db: Db,
  id: number,
  patch: { title?: string; notes?: string; status?: 'inbox' | 'done' | 'dropped' },
  now: Date,
): Task {
  const current = taskRow(db, id);
  const status = patch.status ?? current.status;
  const completedAt =
    patch.status === undefined ? current.completed_at : patch.status === 'inbox' ? null : iso(now);
  db.prepare(
    'UPDATE tasks SET title = ?, notes = ?, status = ?, completed_at = ? WHERE id = ?',
  ).run(patch.title ?? current.title, patch.notes ?? current.notes, status, completedAt, id);
  return getTask(db, id);
}

export function deleteTask(db: Db, id: number): void {
  taskRow(db, id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function makeCurrent(db: Db, id: number): Task {
  return db.transaction(() => {
    taskRow(db, id);
    if (openBlockRow(db)) {
      throw conflict('block_running', 'Finish the running block before switching tasks');
    }
    db.prepare("UPDATE tasks SET status = 'inbox' WHERE status = 'current'").run();
    db.prepare("UPDATE tasks SET status = 'current', completed_at = NULL WHERE id = ?").run(id);
    return getTask(db, id);
  })();
}

// ---- Steps ----

export function listSteps(db: Db, taskId: number): Step[] {
  taskRow(db, taskId);
  const rows = db
    .prepare('SELECT * FROM steps WHERE task_id = ? ORDER BY position, id')
    .all(taskId) as StepRow[];
  return rows.map(toStep);
}

function stepRow(db: Db, id: number): StepRow {
  const row = db.prepare('SELECT * FROM steps WHERE id = ?').get(id) as StepRow | undefined;
  if (!row) throw notFound('Step');
  return row;
}

/** Appends steps, or inserts them before `beforeStepId` (a smaller first move when stuck). */
export function addSteps(
  db: Db,
  taskId: number,
  texts: string[],
  now: Date,
  beforeStepId?: number,
): Step[] {
  return db.transaction(() => {
    taskRow(db, taskId);
    let position: number;
    let parent: number | null = null;
    if (beforeStepId !== undefined) {
      const before = stepRow(db, beforeStepId);
      if (before.task_id !== taskId) throw notFound('Step');
      position = before.position;
      parent = before.id;
      db.prepare(
        'UPDATE steps SET position = position + ? WHERE task_id = ? AND position >= ?',
      ).run(texts.length, taskId, position);
    } else {
      const max = db
        .prepare('SELECT MAX(position) FROM steps WHERE task_id = ?')
        .pluck()
        .get(taskId) as number | null;
      position = max === null ? 0 : max + 1;
    }
    const insert = db.prepare(
      `INSERT INTO steps (task_id, text, position, parent_step_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const ids = texts.map((text, i) =>
      Number(insert.run(taskId, text, position + i, parent, iso(now)).lastInsertRowid),
    );
    return ids.map((id) => toStep(stepRow(db, id)));
  })();
}

export function updateStep(
  db: Db,
  id: number,
  patch: { text?: string; status?: 'todo' | 'done'; position?: number },
  now: Date,
): Step {
  return db.transaction(() => {
    const row = stepRow(db, id);
    if (patch.text !== undefined) {
      db.prepare('UPDATE steps SET text = ? WHERE id = ?').run(patch.text, id);
    }
    if (patch.status !== undefined && patch.status !== row.status) {
      db.prepare('UPDATE steps SET status = ?, done_at = ? WHERE id = ?').run(
        patch.status,
        patch.status === 'done' ? iso(now) : null,
        id,
      );
    }
    if (patch.position !== undefined) {
      const order = db
        .prepare('SELECT id FROM steps WHERE task_id = ? AND id != ? ORDER BY position, id')
        .pluck()
        .all(row.task_id, id) as number[];
      order.splice(Math.min(patch.position, order.length), 0, id);
      const setPos = db.prepare('UPDATE steps SET position = ? WHERE id = ?');
      order.forEach((stepId, i) => setPos.run(i, stepId));
    }
    return toStep(stepRow(db, id));
  })();
}

export function deleteStep(db: Db, id: number): void {
  stepRow(db, id);
  db.prepare('DELETE FROM steps WHERE id = ?').run(id);
}

export function currentTaskAndStep(db: Db): {
  task: { id: number; title: string } | null;
  step: { id: number; text: string } | null;
} {
  const task = db.prepare("SELECT id, title FROM tasks WHERE status = 'current'").get() as
    { id: number; title: string } | undefined;
  if (!task) return { task: null, step: null };
  const step = db
    .prepare(
      `SELECT id, text FROM steps WHERE task_id = ? AND status = 'todo'
       ORDER BY position, id LIMIT 1`,
    )
    .get(task.id) as { id: number; text: string } | undefined;
  return { task, step: step ?? null };
}

// ---- Workdays ----

function openWorkdayRow(db: Db): WorkdayRow | undefined {
  return db
    .prepare('SELECT * FROM workdays WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get() as WorkdayRow | undefined;
}

export function openWorkday(db: Db): Workday | null {
  const row = openWorkdayRow(db);
  return row ? toWorkday(row) : null;
}

export function latestWorkdayFor(db: Db, localDate: string): Workday | null {
  const row = db
    .prepare('SELECT * FROM workdays WHERE local_date = ? ORDER BY id DESC LIMIT 1')
    .get(localDate) as WorkdayRow | undefined;
  return row ? toWorkday(row) : null;
}

/** Opens today's workday. Idempotent: returns the open one if there is one. */
export function startWorkday(db: Db, now: Date, day: DayConfig): Workday {
  return db.transaction(() => {
    const open = openWorkdayRow(db);
    if (open) return toWorkday(open);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO workdays (local_date, started_at) VALUES (?, ?)')
      .run(logicalDate(now, day.tz, day.cutoff), iso(now));
    return toWorkday(
      db.prepare('SELECT * FROM workdays WHERE id = ?').get(lastInsertRowid) as WorkdayRow,
    );
  })();
}

/** Closes the open workday at `at`, abandoning any running block. No-op if none is open. */
export function endWorkday(db: Db, at: Date, reason: 'manual' | 'auto'): void {
  db.transaction(() => {
    const open = openWorkdayRow(db);
    if (!open) return;
    const block = openBlockRow(db);
    if (block) {
      const plannedEnd = blockEndsAt({
        startedAt: block.started_at,
        plannedSeconds: block.planned_seconds,
      });
      const endedAt = plannedEnd < at ? plannedEnd : at;
      db.prepare("UPDATE focus_blocks SET ended_at = ?, outcome = 'abandoned' WHERE id = ?").run(
        iso(endedAt),
        block.id,
      );
    }
    db.prepare('UPDATE workdays SET ended_at = ?, end_reason = ? WHERE id = ?').run(
      iso(at),
      reason,
      open.id,
    );
  })();
}

/** Quietly closes a workday left open past the cutoff. Called before every API request. */
export function autoClose(db: Db, now: Date, day: DayConfig): void {
  const open = openWorkday(db);
  if (!open) return;
  const at = autoCloseAt(open, now, day);
  if (at) endWorkday(db, at, 'auto');
}

// ---- Focus blocks ----

const BLOCK_SELECT = `SELECT fb.*, s.text AS step_text
  FROM focus_blocks fb LEFT JOIN steps s ON s.id = fb.step_id`;

function openBlockRow(db: Db): BlockRow | undefined {
  return db
    .prepare(`${BLOCK_SELECT} WHERE fb.ended_at IS NULL ORDER BY fb.id DESC LIMIT 1`)
    .get() as BlockRow | undefined;
}

export function openBlock(db: Db): Block | null {
  const row = openBlockRow(db);
  return row ? toBlock(row) : null;
}

function insertBlock(
  db: Db,
  stepId: number,
  workdayId: number,
  now: Date,
  plannedSeconds: number,
): Block {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO focus_blocks (step_id, workday_id, started_at, planned_seconds)
       VALUES (?, ?, ?, ?)`,
    )
    .run(stepId, workdayId, iso(now), plannedSeconds);
  return toBlock(db.prepare(`${BLOCK_SELECT} WHERE fb.id = ?`).get(lastInsertRowid) as BlockRow);
}

/** Starts a block on the current step. */
export function startBlock(db: Db, now: Date, plannedSeconds: number): Block {
  return db.transaction(() => {
    const workday = openWorkdayRow(db);
    if (!workday) throw conflict('workday_not_started', 'Start the workday first');
    if (openBlockRow(db)) throw conflict('block_running', 'A block is already running');
    const { step } = currentTaskAndStep(db);
    if (!step) throw conflict('no_current_step', 'There is no current step to work on');
    return insertBlock(db, step.id, workday.id, now, plannedSeconds);
  })();
}

/**
 * Finishes the running block. 'done' completes its step; 'keep_going' starts a fresh
 * block on the same step and returns it.
 */
export function finishBlock(
  db: Db,
  id: number,
  outcome: BlockOutcome,
  now: Date,
  plannedSeconds: number,
): { next: Block | null } {
  return db.transaction(() => {
    const block = openBlockRow(db);
    if (!block || block.id !== id) {
      throw conflict('block_not_open', 'That block is not running');
    }
    db.prepare('UPDATE focus_blocks SET ended_at = ?, outcome = ? WHERE id = ?').run(
      iso(now),
      outcome,
      id,
    );
    if (outcome === 'done' && block.step_id !== null) {
      db.prepare(
        "UPDATE steps SET status = 'done', done_at = ? WHERE id = ? AND status = 'todo'",
      ).run(iso(now), block.step_id);
    }
    if (outcome === 'keep_going' && block.step_id !== null) {
      return { next: insertBlock(db, block.step_id, block.workday_id, now, plannedSeconds) };
    }
    return { next: null };
  })();
}

// ---- Today & status ----

export function doneSince(db: Db, since: Date): DoneItem[] {
  return db
    .prepare(
      `SELECT s.id AS stepId, s.text, t.title AS taskTitle, s.done_at AS doneAt
       FROM steps s JOIN tasks t ON t.id = s.task_id
       WHERE s.status = 'done' AND s.done_at >= ?
       ORDER BY s.done_at, s.id`,
    )
    .all(iso(since)) as DoneItem[];
}

export function status(db: Db, now: Date, day: DayConfig): Status {
  const since = mostRecentCutoff(now, day.tz, day.cutoff);
  const localDate = logicalDate(now, day.tz, day.cutoff);
  const workday = latestWorkdayFor(db, localDate);
  const blocks = db
    .prepare(`${BLOCK_SELECT} WHERE fb.started_at >= ?`)
    .all(iso(since)) as BlockRow[];
  const seconds = blocks.reduce(
    (sum, b) =>
      sum +
      focusSeconds(
        { startedAt: b.started_at, plannedSeconds: b.planned_seconds, endedAt: b.ended_at },
        now,
      ),
    0,
  );
  const active = openBlock(db);
  const stepsCompleted = db
    .prepare("SELECT COUNT(*) FROM steps WHERE status = 'done' AND done_at >= ?")
    .pluck()
    .get(iso(since)) as number;
  return {
    localDate,
    workdayStarted: workday !== null,
    workdayEnded: workday !== null && workday.endedAt !== null && openWorkday(db) === null,
    stepsCompleted,
    focusMinutes: Math.floor(seconds / 60),
    activeBlock: active ? { startedAt: active.startedAt, endsAt: active.endsAt } : null,
  };
}

// ---- Export ----

export function exportAll(db: Db, now: Date): Record<string, unknown> {
  const all = (table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  return {
    app: 'anker',
    exportedAt: iso(now),
    migrations: db.prepare('SELECT name FROM schema_migrations ORDER BY name').pluck().all(),
    tasks: all('tasks'),
    steps: all('steps'),
    workdays: all('workdays'),
    focusBlocks: all('focus_blocks'),
  };
}

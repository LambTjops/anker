// All SQL lives here. Functions take the db and `now`, and return API-shaped objects.
import type {
  Block,
  BlockOutcome,
  Break,
  DoneItem,
  FinishResult,
  Settings,
  Status,
  Step,
  Task,
  TaskStatus,
  Workday,
} from '../../shared/api.ts';
import { logicalDate, mostRecentCutoff } from '../../shared/time.ts';
import {
  autoCloseAt,
  blockEndsAt,
  breakKind,
  earnsBreak,
  EXTEND_SECONDS,
  focusSeconds,
  isCountingDown,
  type DayConfig,
} from '../domain/day.ts';
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

interface BreakRow {
  id: number;
  workday_id: number;
  after_block_id: number | null;
  kind: Break['kind'];
  started_at: string;
  planned_seconds: number;
  ended_at: string | null;
}

interface SettingsRow {
  focus_minutes: number;
  break_minutes: number;
  long_break_minutes: number;
  long_break_every: number;
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

const toBreak = (r: BreakRow): Break => ({
  id: r.id,
  kind: r.kind,
  startedAt: r.started_at,
  endsAt: blockEndsAt({ startedAt: r.started_at, plannedSeconds: r.planned_seconds }).toISOString(),
  plannedSeconds: r.planned_seconds,
});

const iso = (d: Date) => d.toISOString();

const timer = (row: { started_at: string; planned_seconds: number; ended_at: string | null }) => ({
  startedAt: row.started_at,
  plannedSeconds: row.planned_seconds,
  endedAt: row.ended_at,
});

/** Ends a block or break at `at`, or at its planned end if that came first. */
const cappedEnd = (row: { started_at: string; planned_seconds: number }, at: Date): Date => {
  const plannedEnd = blockEndsAt({
    startedAt: row.started_at,
    plannedSeconds: row.planned_seconds,
  });
  return plannedEnd < at ? plannedEnd : at;
};

// ---- Settings ----

export function getSettings(db: Db, defaults: Settings): Settings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;
  if (!row) return defaults;
  return {
    focusMinutes: row.focus_minutes,
    breakMinutes: row.break_minutes,
    longBreakMinutes: row.long_break_minutes,
    longBreakEvery: row.long_break_every,
  };
}

export function updateSettings(db: Db, defaults: Settings, patch: Partial<Settings>): Settings {
  const next = { ...getSettings(db, defaults), ...patch };
  db.prepare(
    `INSERT OR REPLACE INTO settings
       (id, focus_minutes, break_minutes, long_break_minutes, long_break_every)
     VALUES (1, ?, ?, ?, ?)`,
  ).run(next.focusMinutes, next.breakMinutes, next.longBreakMinutes, next.longBreakEvery);
  return next;
}

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

/** Closes the open workday at `at`, abandoning any running block or break. No-op if none is open. */
export function endWorkday(db: Db, at: Date, reason: 'manual' | 'auto'): void {
  db.transaction(() => {
    const open = openWorkdayRow(db);
    if (!open) return;
    const block = openBlockRow(db);
    if (block) {
      db.prepare("UPDATE focus_blocks SET ended_at = ?, outcome = 'abandoned' WHERE id = ?").run(
        iso(cappedEnd(block, at)),
        block.id,
      );
    }
    const brk = openBreakRow(db);
    if (brk) {
      db.prepare('UPDATE breaks SET ended_at = ? WHERE id = ?').run(
        iso(cappedEnd(brk, at)),
        brk.id,
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
    // Starting to work ends the break.
    db.prepare('UPDATE breaks SET ended_at = ? WHERE ended_at IS NULL').run(iso(now));
    return insertBlock(db, step.id, workday.id, now, plannedSeconds);
  })();
}

/**
 * Finishes the running block. 'done' completes its step; 'keep_going' starts a fresh
 * block on the same step and returns it. Done or Stuck at time's up starts a break.
 */
export function finishBlock(
  db: Db,
  id: number,
  outcome: BlockOutcome,
  now: Date,
  settings: Settings,
): FinishResult {
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
      const next = insertBlock(
        db,
        block.step_id,
        block.workday_id,
        now,
        settings.focusMinutes * 60,
      );
      return { next, break: null };
    }
    if (earnsBreak(outcome, timer(block), now)) {
      return { next: null, break: startBreak(db, block, now, settings) };
    }
    return { next: null, break: null };
  })();
}

/** "+5 min" on a running block. */
export function extendBlock(db: Db, id: number, now: Date): Block {
  const block = openBlockRow(db);
  if (!block || block.id !== id || !isCountingDown(timer(block), now)) {
    throw conflict('block_not_running', 'That block is not counting down');
  }
  db.prepare('UPDATE focus_blocks SET planned_seconds = planned_seconds + ? WHERE id = ?').run(
    EXTEND_SECONDS,
    id,
  );
  return toBlock(db.prepare(`${BLOCK_SELECT} WHERE fb.id = ?`).get(id) as BlockRow);
}

// ---- Breaks ----

function openBreakRow(db: Db): BreakRow | undefined {
  return db
    .prepare('SELECT * FROM breaks WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get() as BreakRow | undefined;
}

export function openBreak(db: Db): Break | null {
  const row = openBreakRow(db);
  return row ? toBreak(row) : null;
}

function startBreak(db: Db, after: BlockRow, now: Date, settings: Settings): Break {
  const lastLong = db
    .prepare("SELECT MAX(started_at) FROM breaks WHERE workday_id = ? AND kind = 'long'")
    .pluck()
    .get(after.workday_id) as string | null;
  const blocksSince = db
    .prepare(
      `SELECT COUNT(*) FROM focus_blocks
       WHERE workday_id = ? AND outcome IN ('done', 'stuck', 'keep_going') AND started_at > ?`,
    )
    .pluck()
    .get(after.workday_id, lastLong ?? '') as number;
  const kind = breakKind(blocksSince, settings.longBreakEvery);
  const minutes = kind === 'long' ? settings.longBreakMinutes : settings.breakMinutes;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO breaks (workday_id, after_block_id, kind, started_at, planned_seconds)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(after.workday_id, after.id, kind, iso(now), minutes * 60);
  return toBreak(db.prepare('SELECT * FROM breaks WHERE id = ?').get(lastInsertRowid) as BreakRow);
}

/** "+5 min" on a running break. */
export function extendBreak(db: Db, id: number, now: Date): Break {
  const row = openBreakRow(db);
  if (!row || row.id !== id || !isCountingDown(timer(row), now)) {
    throw conflict('break_not_running', 'That break is not counting down');
  }
  db.prepare('UPDATE breaks SET planned_seconds = planned_seconds + ? WHERE id = ?').run(
    EXTEND_SECONDS,
    id,
  );
  return toBreak(db.prepare('SELECT * FROM breaks WHERE id = ?').get(id) as BreakRow);
}

/** Ends the break now ("Skip break"). */
export function endBreak(db: Db, id: number, now: Date): void {
  const row = openBreakRow(db);
  if (!row || row.id !== id) throw conflict('break_not_open', 'That break is not running');
  db.prepare('UPDATE breaks SET ended_at = ? WHERE id = ?').run(iso(cappedEnd(row, now)), id);
}

/** Closes a break whose time has run out. Called before every API request. */
export function settleBreak(db: Db, now: Date): void {
  const row = openBreakRow(db);
  if (row && blockEndsAt(timer(row)) <= now) {
    db.prepare('UPDATE breaks SET ended_at = ? WHERE id = ?').run(iso(cappedEnd(row, now)), row.id);
  }
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
  const activeBreak = openBreak(db);
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
    activeBreak: activeBreak
      ? { kind: activeBreak.kind, startedAt: activeBreak.startedAt, endsAt: activeBreak.endsAt }
      : null,
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
    breaks: all('breaks'),
    settings: all('settings'),
  };
}

// Request schemas and response types for the JSON API. Used by the server (to validate)
// and the web client (to type its calls). See BRIEF §6.
import { z } from 'zod';

const text = z.string().trim().min(1).max(500);

export const TaskStatus = z.enum(['inbox', 'current', 'done', 'dropped']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const BlockOutcome = z.enum(['done', 'stuck', 'keep_going', 'abandoned']);
export type BlockOutcome = z.infer<typeof BlockOutcome>;

export const IdParams = z.object({ id: z.coerce.number().int().positive() });

export const ListTasksQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : ['inbox', 'current']))
    .pipe(z.array(TaskStatus)),
});

export const CreateTaskBody = z.object({ title: text });

export const UpdateTaskBody = z
  .object({
    title: text.optional(),
    notes: z.string().max(5000).optional(),
    // 'current' is set through POST /api/tasks/:id/current, not here.
    status: z.enum(['inbox', 'done', 'dropped']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const CreateStepsBody = z.union([
  z.object({ text, beforeStepId: z.number().int().positive().optional() }),
  z.object({ texts: z.array(text).min(1).max(50) }),
]);

export const UpdateStepBody = z
  .object({
    text: text.optional(),
    status: z.enum(['todo', 'done']).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

export const FinishBlockBody = z.object({ outcome: BlockOutcome });

export const UpdateSettingsBody = z
  .object({
    focusMinutes: z.number().int().min(1).max(180).optional(),
    breakMinutes: z.number().int().min(1).max(60).optional(),
    longBreakMinutes: z.number().int().min(1).max(120).optional(),
    /** A long break after this many focus blocks; 0 turns long breaks off. */
    longBreakEvery: z.number().int().min(0).max(12).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update');

// ---- Response types ----

export interface Task {
  id: number;
  title: string;
  notes: string;
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface Step {
  id: number;
  taskId: number;
  text: string;
  position: number;
  status: 'todo' | 'done' | 'replaced';
  parentStepId: number | null;
  source: 'manual' | 'coach';
  createdAt: string;
  doneAt: string | null;
}

export interface Workday {
  id: number;
  localDate: string;
  startedAt: string;
  endedAt: string | null;
  endReason: 'manual' | 'auto' | null;
}

export interface Block {
  id: number;
  stepId: number | null;
  stepText: string | null;
  startedAt: string;
  endsAt: string;
  plannedSeconds: number;
}

export interface Break {
  id: number;
  kind: 'short' | 'long';
  startedAt: string;
  endsAt: string;
  plannedSeconds: number;
}

export interface Settings {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
}

/** POST /api/blocks/:id/finish */
export interface FinishResult {
  /** The fresh block after 'keep_going'. */
  next: Block | null;
  /** The break that started because the block ran its full time. */
  break: Break | null;
}

export interface DoneItem {
  stepId: number;
  text: string;
  taskTitle: string;
  doneAt: string;
}

/** GET /api/state: everything the Now, Focus and Off screens need, and nothing more. */
export interface AppState {
  serverNow: string;
  localDate: string;
  /** 'on' while a workday is open. */
  mode: 'on' | 'off';
  /** When off: 'ended' if today's workday was ended by hand, otherwise 'not_started'. */
  offReason: 'ended' | 'not_started' | null;
  /** `hasSteps` is false for a task that was never broken down: it can be started as is. */
  currentTask: { id: number; title: string; hasSteps: boolean } | null;
  /** Only ever the one current step. */
  currentStep: { id: number; text: string } | null;
  block: Block | null;
  break: Break | null;
}

/** GET /api/today */
export interface Today {
  localDate: string;
  done: DoneItem[];
}

/** GET /api/status: read-only summary for external clients. */
export interface Status {
  localDate: string;
  workdayStarted: boolean;
  workdayEnded: boolean;
  stepsCompleted: number;
  focusMinutes: number;
  activeBlock: { startedAt: string; endsAt: string } | null;
  activeBreak: { kind: 'short' | 'long'; startedAt: string; endsAt: string } | null;
}

export interface ApiError {
  error: { code: string; message: string };
}

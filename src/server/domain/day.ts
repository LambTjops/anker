// Pure rules for workdays, focus blocks and breaks. Every function takes `now`; none do I/O.
import type { BlockOutcome } from '../../shared/api.ts';
import { mostRecentCutoff } from '../../shared/time.ts';

export interface DayConfig {
  tz: string;
  cutoff: string; // HH:MM local
}

/**
 * When an open workday should be closed automatically, or null if it can stay open.
 * A workday that started before the most recent cutoff belongs to a finished day.
 */
export function autoCloseAt(
  workday: { startedAt: string; endedAt: string | null },
  now: Date,
  day: DayConfig,
): Date | null {
  if (workday.endedAt !== null) return null;
  const cutoff = mostRecentCutoff(now, day.tz, day.cutoff);
  return new Date(workday.startedAt) < cutoff ? cutoff : null;
}

/** When a focus block or break runs out. */
export function blockEndsAt(block: { startedAt: string; plannedSeconds: number }): Date {
  return new Date(new Date(block.startedAt).getTime() + block.plannedSeconds * 1000);
}

/** What "+5 min" adds to a running block or break. */
export const EXTEND_SECONDS = 5 * 60;

/** The longest a block can be stretched to by moving its end time. */
export const MAX_BLOCK_SECONDS = 4 * 60 * 60;

/** A new end has to leave at least this long on the clock. */
const MIN_REMAINING_MS = 60_000;

/**
 * The block length that makes it end at `endsAt`, or null when that end has passed, is
 * less than a minute away, or would stretch the block past MAX_BLOCK_SECONDS.
 */
export function plannedSecondsEndingAt(startedAt: string, endsAt: Date, now: Date): number | null {
  if (endsAt.getTime() - now.getTime() < MIN_REMAINING_MS) return null;
  // Round up, so the block never ends a fraction early and shows the minute before.
  const seconds = Math.ceil((endsAt.getTime() - new Date(startedAt).getTime()) / 1000);
  return seconds > MAX_BLOCK_SECONDS ? null : seconds;
}

/** Slack for a client whose clock says "time's up" a moment before the server's does. */
const TIME_UP_GRACE_MS = 5_000;

/** Whether a block or break is still counting down (and so can be extended or paused). */
export function isCountingDown(
  timer: {
    startedAt: string;
    plannedSeconds: number;
    endedAt: string | null;
    pausedAt?: string | null;
  },
  now: Date,
): boolean {
  return timer.endedAt === null && !timer.pausedAt && now < blockEndsAt(timer);
}

/**
 * Resuming adds the pause to the block's length, so the countdown carries on from where it
 * stopped. Returns the new planned seconds and the pause's length.
 */
export function resumeSeconds(
  block: { plannedSeconds: number; pausedAt: string },
  now: Date,
): { plannedSeconds: number; pausedFor: number } {
  const pausedFor = Math.max(
    0,
    Math.round((now.getTime() - new Date(block.pausedAt).getTime()) / 1000),
  );
  return { plannedSeconds: block.plannedSeconds + pausedFor, pausedFor };
}

/**
 * Whether finishing a block starts a break: only Done or Stuck once its time is up.
 * Keep going stays in flow, and stopping early goes straight back to Now, unless an early
 * Done asks for a break.
 */
export function earnsBreak(
  outcome: BlockOutcome,
  block: { startedAt: string; plannedSeconds: number; pausedAt?: string | null },
  now: Date,
  takeBreak = false,
): boolean {
  if (outcome !== 'done' && outcome !== 'stuck') return false;
  if (takeBreak && outcome === 'done') return true;
  // A paused block's time isn't up, however long the pause.
  if (block.pausedAt) return false;
  return now.getTime() >= blockEndsAt(block).getTime() - TIME_UP_GRACE_MS;
}

/** A long break once `every` focus blocks have run since the last one (0 = never). */
export function breakKind(blocksSinceLongBreak: number, every: number): 'short' | 'long' {
  return every > 0 && blocksSinceLongBreak >= every ? 'long' : 'short';
}

/** Seconds of a block that count as focus: time actually spent, capped at the plan. */
export function focusSeconds(
  block: {
    startedAt: string;
    plannedSeconds: number;
    endedAt: string | null;
    pausedAt?: string | null;
    pausedSeconds?: number;
  },
  now: Date,
): number {
  const end = block.endedAt ? new Date(block.endedAt) : now;
  const elapsed = Math.max(0, (end.getTime() - new Date(block.startedAt).getTime()) / 1000);
  // Paused time isn't focus: earlier pauses, plus the current one if it's still paused.
  const pausedNow = block.pausedAt
    ? Math.max(0, (end.getTime() - new Date(block.pausedAt).getTime()) / 1000)
    : 0;
  const pausedBefore = block.pausedSeconds ?? 0;
  // plannedSeconds already includes earlier pauses (resume adds them), not the current one.
  const active = elapsed - pausedBefore - pausedNow;
  return Math.max(0, Math.min(active, block.plannedSeconds - pausedBefore));
}

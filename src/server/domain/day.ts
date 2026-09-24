// Pure rules for workdays and focus blocks. Every function takes `now`; none do I/O.
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

export function blockEndsAt(block: { startedAt: string; plannedSeconds: number }): Date {
  return new Date(new Date(block.startedAt).getTime() + block.plannedSeconds * 1000);
}

/** Seconds of a block that count as focus: time actually spent, capped at the plan. */
export function focusSeconds(
  block: { startedAt: string; plannedSeconds: number; endedAt: string | null },
  now: Date,
): number {
  const end = block.endedAt ? new Date(block.endedAt) : now;
  const elapsed = Math.max(0, (end.getTime() - new Date(block.startedAt).getTime()) / 1000);
  return Math.min(elapsed, block.plannedSeconds);
}

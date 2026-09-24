import type { Task } from '../shared/api.ts';
import { serverNow } from './api.ts';

/** Tasks untouched this long fold away under "Older tasks", so the list stays short. */
const LATER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** Splits tasks into recent ones and older ones. Current and planned tasks always stay. */
export function splitByAge(tasks: Task[], planned: Set<number>): { recent: Task[]; older: Task[] } {
  const cutoff = serverNow() - LATER_AFTER_MS;
  const recent: Task[] = [];
  const older: Task[] = [];
  for (const t of tasks) {
    const keep = t.status === 'current' || planned.has(t.id);
    (keep || new Date(t.createdAt).getTime() >= cutoff ? recent : older).push(t);
  }
  return { recent, older };
}

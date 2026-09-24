// The one place that does local-date and cutoff maths. Built on Intl, no date library.
// A "logical day" runs from one cutoff (e.g. 04:00 local) to the next, so work done
// at 1am still belongs to the previous day.

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, tz: string): WallClock {
  const out: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at `instant`, in milliseconds (NZDT → +13h). */
export function tzOffsetMs(instant: Date, tz: string): number {
  const w = wallClock(instant, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Calendar date (YYYY-MM-DD) of `instant` in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const w = wallClock(instant, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Adds whole calendar days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The UTC instant of wall-clock `hhmm` on `date` in `tz`. */
export function zonedTimeToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset even when the guess lands across a DST change.
  let result = guess - tzOffsetMs(new Date(guess), tz);
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

/** The most recent cutoff at or before `now`. */
export function mostRecentCutoff(now: Date, tz: string, cutoff: string): Date {
  const today = zonedTimeToUtc(localDate(now, tz), cutoff, tz);
  if (today.getTime() <= now.getTime()) return today;
  return zonedTimeToUtc(addDays(localDate(now, tz), -1), cutoff, tz);
}

/** The logical day `now` belongs to: the local date of the most recent cutoff. */
export function logicalDate(now: Date, tz: string, cutoff: string): string {
  return localDate(mostRecentCutoff(now, tz, cutoff), tz);
}

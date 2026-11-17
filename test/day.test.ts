import { describe, expect, it } from 'vitest';
import { breakKind, earnsBreak, isCountingDown, isEndOfDay } from '../src/server/domain/day.ts';

const block = { startedAt: '2026-09-24T21:00:00.000Z', plannedSeconds: 25 * 60 };
const at = (iso: string) => new Date(iso);

describe('breaks', () => {
  it('only Done or Stuck at time up earn a break', () => {
    const up = at('2026-09-24T21:25:00.000Z');
    expect(earnsBreak('done', block, up)).toBe(true);
    expect(earnsBreak('stuck', block, up)).toBe(true);
    expect(earnsBreak('keep_going', block, up)).toBe(false);
    expect(earnsBreak('abandoned', block, up)).toBe(false);
    expect(earnsBreak('done', block, at('2026-09-24T21:20:00.000Z'))).toBe(false);
  });

  it('an early Done earns a break only when asked for', () => {
    const early = at('2026-09-24T21:10:00.000Z');
    expect(earnsBreak('done', block, early, true)).toBe(true);
    expect(earnsBreak('abandoned', block, early, true)).toBe(false);
    expect(earnsBreak('keep_going', block, early, true)).toBe(false);
  });

  it('allows for a client clock a few seconds ahead of the server', () => {
    expect(earnsBreak('done', block, at('2026-09-24T21:24:57.000Z'))).toBe(true);
    expect(earnsBreak('done', block, at('2026-09-24T21:24:50.000Z'))).toBe(false);
  });

  it('makes every nth break long, or none when set to 0', () => {
    expect(breakKind(3, 4)).toBe('short');
    expect(breakKind(4, 4)).toBe('long');
    expect(breakKind(9, 0)).toBe('short');
  });

  it('counts down until the planned end', () => {
    const open = { ...block, endedAt: null };
    expect(isCountingDown(open, at('2026-09-24T21:24:59.000Z'))).toBe(true);
    expect(isCountingDown(open, at('2026-09-24T21:25:00.000Z'))).toBe(false);
    expect(
      isCountingDown(
        { ...block, endedAt: '2026-09-24T21:10:00.000Z' },
        at('2026-09-24T21:11:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('isEndOfDay', () => {
  const day = { tz: 'Pacific/Auckland', cutoff: '04:00' };
  // 2026-11-17 is NZDT (UTC+13).
  const nz = (hhmm: string, date = '2026-11-17') => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    return new Date(
      Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8)),
        h - 13,
        m,
      ),
    );
  };

  it('is late from the chosen time until the cutoff after midnight', () => {
    expect(isEndOfDay(nz('14:59'), day, '15:00')).toBe(false);
    expect(isEndOfDay(nz('15:00'), day, '15:00')).toBe(true);
    expect(isEndOfDay(nz('23:30'), day, '15:00')).toBe(true);
    expect(isEndOfDay(nz('02:00'), day, '15:00')).toBe(true);
    expect(isEndOfDay(nz('04:00'), day, '15:00')).toBe(false);
    expect(isEndOfDay(nz('09:00'), day, '15:00')).toBe(false);
  });

  it('handles a chosen time after midnight, before the cutoff', () => {
    expect(isEndOfDay(nz('01:00'), day, '01:30')).toBe(false);
    expect(isEndOfDay(nz('02:00'), day, '01:30')).toBe(true);
    expect(isEndOfDay(nz('23:00'), day, '01:30')).toBe(false);
  });
});

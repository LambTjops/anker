import { describe, expect, it } from 'vitest';
import {
  addDays,
  localDate,
  logicalDate,
  mostRecentCutoff,
  zonedTimeToUtc,
} from '../src/shared/time.ts';

const NZ = 'Pacific/Auckland';

describe('zonedTimeToUtc', () => {
  it('handles NZST (+12)', () => {
    expect(zonedTimeToUtc('2026-07-01', '04:00', NZ).toISOString()).toBe(
      '2026-06-30T16:00:00.000Z',
    );
  });

  it('handles NZDT (+13)', () => {
    expect(zonedTimeToUtc('2026-12-01', '04:00', NZ).toISOString()).toBe(
      '2026-11-30T15:00:00.000Z',
    );
  });

  // DST starts Sun 27 Sep 2026: 02:00 NZST jumps to 03:00 NZDT.
  it('uses the new offset on the morning DST starts', () => {
    expect(zonedTimeToUtc('2026-09-26', '04:00', NZ).toISOString()).toBe(
      '2026-09-25T16:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-09-27', '04:00', NZ).toISOString()).toBe(
      '2026-09-26T15:00:00.000Z',
    );
  });

  // DST ends Sun 5 Apr 2026: 03:00 NZDT falls back to 02:00 NZST.
  it('uses the new offset on the morning DST ends', () => {
    expect(zonedTimeToUtc('2026-04-04', '04:00', NZ).toISOString()).toBe(
      '2026-04-03T15:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-04-05', '04:00', NZ).toISOString()).toBe(
      '2026-04-04T16:00:00.000Z',
    );
  });
});

describe('logical day', () => {
  it('counts 1am as the previous day', () => {
    const oneAm = zonedTimeToUtc('2026-09-24', '01:00', NZ);
    expect(localDate(oneAm, NZ)).toBe('2026-09-24');
    expect(logicalDate(oneAm, NZ, '04:00')).toBe('2026-09-23');
  });

  it('starts a new day exactly at the cutoff', () => {
    const cutoff = zonedTimeToUtc('2026-09-24', '04:00', NZ);
    expect(mostRecentCutoff(cutoff, NZ, '04:00')).toEqual(cutoff);
    expect(logicalDate(cutoff, NZ, '04:00')).toBe('2026-09-24');
  });

  it('spans the DST-start night correctly', () => {
    // 03:30 NZDT on 27 Sep is still the 26th's logical day, whose cutoff was 04:00 NZST.
    const t = zonedTimeToUtc('2026-09-27', '03:30', NZ);
    expect(mostRecentCutoff(t, NZ, '04:00').toISOString()).toBe('2026-09-25T16:00:00.000Z');
    expect(logicalDate(t, NZ, '04:00')).toBe('2026-09-26');
  });

  it('spans the DST-end night correctly', () => {
    // 02:30 on 5 Apr happens twice; either way it is still the 4th's logical day.
    const t = new Date('2026-04-04T14:30:00.000Z'); // 02:30 NZST (second pass)
    expect(logicalDate(t, NZ, '04:00')).toBe('2026-04-04');
    expect(mostRecentCutoff(t, NZ, '04:00').toISOString()).toBe('2026-04-03T15:00:00.000Z');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

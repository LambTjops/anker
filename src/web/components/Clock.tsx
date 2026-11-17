import { useEffect, useState } from 'preact/hooks';
import type { Settings } from '../../shared/api.ts';
import { serverNow } from '../api.ts';

const format = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The time of day and when the timer ends, small and muted, so a running timer has a
 * real-world anchor. Each half can be turned off in Settings.
 *
 * With `onSetEnd`, the end time is a button: tap it, pick a time, and the timer ends then.
 */
export function Clock({
  endsAt,
  features,
  onSetEnd,
}: {
  endsAt: string;
  features: Pick<Settings, 'showClock' | 'showEndTime'>;
  /** Resolves true once the new end is saved. */
  onSetEnd?: (endsAt: string) => Promise<boolean>;
}) {
  const [now, setNow] = useState(serverNow);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (!features.showClock) return;
    const tick = setInterval(() => setNow(serverNow()), 10_000);
    return () => clearInterval(tick);
  }, [features.showClock]);

  const end = format.format(new Date(endsAt));

  if (editing && onSetEnd) {
    const save = async (e: Event) => {
      e.preventDefault();
      const at = nextOccurrence(value);
      if (at && (await onSetEnd(at))) setEditing(false);
    };
    return (
      <form class="clock clock-form" onSubmit={save}>
        <label>
          <span>Ends at</span>
          {/* Not type="time": that follows the device's 12/24-hour setting. */}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="14:55"
            pattern="([01]?[0-9]|2[0-3]):?[0-5][0-9]"
            maxLength={5}
            value={value}
            onInput={(e) => setValue(e.currentTarget.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            autoFocus
            required
          />
        </label>
        <div class="row">
          <button class="primary" type="submit">
            Set
          </button>
          <button class="quiet" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const clock = features.showClock && format.format(now);
  const ends = features.showEndTime && (
    <>
      {clock && ' · '}
      {onSetEnd ? (
        <button
          class="clock-edit"
          title="Change when this block ends"
          onClick={() => {
            setValue(end);
            setEditing(true);
          }}
        >
          ends {end}
        </button>
      ) : (
        `ends ${end}`
      )}
    </>
  );
  if (!clock && !ends) return null;
  return (
    <p class="clock">
      {clock}
      {ends}
    </p>
  );
}

/**
 * The next time the clock reads `hhmm` (24-hour "14:55" or "1455", in this device's time
 * zone, which is also how the end time is shown), as an ISO instant.
 */
function nextOccurrence(hhmm: string): string | null {
  const m = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  const now = new Date(serverNow());
  const at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  return at.toISOString();
}

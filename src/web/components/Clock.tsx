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
 */
export function Clock({
  endsAt,
  features,
}: {
  endsAt: string;
  features: Pick<Settings, 'showClock' | 'showEndTime'>;
}) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!features.showClock) return;
    const tick = setInterval(() => setNow(serverNow()), 10_000);
    return () => clearInterval(tick);
  }, [features.showClock]);

  const parts = [
    features.showClock && format.format(now),
    features.showEndTime && `ends ${format.format(new Date(endsAt))}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p class="clock">{parts.join(' · ')}</p>;
}

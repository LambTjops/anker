import { useEffect, useState } from 'preact/hooks';
import { serverNow } from '../api.ts';

const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** The time of day, small and muted, so a running timer has a real-world anchor. */
export function Clock() {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 10_000);
    return () => clearInterval(tick);
  }, []);
  return <p class="clock">{format.format(now)}</p>;
}

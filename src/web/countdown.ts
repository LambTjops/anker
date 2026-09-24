import { useEffect, useRef, useState } from 'preact/hooks';
import { serverNow } from './api.ts';

export function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Counts down to `endsAt` on server time, calls `onEnd` once when it gets there, and
 * mirrors the time in the tab title.
 */
export function useCountdown(
  endsAt: string,
  onEnd: () => void,
  title: (clock: string | null) => string,
): { remaining: number; over: boolean } {
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState(serverNow);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const titleRef = useRef(title);
  titleRef.current = title;

  // Display tick. Background tabs may throttle this; the one-shot below fires on time.
  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const ms = end - serverNow();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      setNow(serverNow());
      onEndRef.current();
    }, ms);
    return () => clearTimeout(t);
  }, [end]);

  const remaining = Math.max(0, end - now);
  const over = remaining === 0;
  const clock = over ? null : mmss(Math.ceil(remaining / 1000) * 1000);
  useEffect(() => {
    document.title = titleRef.current(clock);
  }, [clock]);
  useEffect(
    () => () => {
      document.title = 'Anker';
    },
    [],
  );

  return { remaining, over };
}

import { useEffect, useRef, useState } from 'preact/hooks';
import { serverNow } from './api.ts';

export function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** How long before the end the heads-up comes. */
const HEADS_UP_MS = 2 * 60_000;

/**
 * Counts down to `endsAt` on server time, calls `onEnd` once when it gets there, and
 * mirrors the time in the tab title. `onHeadsUp`, if given, fires two minutes before.
 * With `pausedAt`, the time left is frozen at what it was then and nothing fires.
 */
export function useCountdown(
  endsAt: string,
  onEnd: () => void,
  title: (clock: string | null) => string,
  onHeadsUp?: () => void,
  pausedAt: string | null = null,
): { remaining: number; over: boolean } {
  const end = new Date(endsAt).getTime();
  const pausedTime = pausedAt ? new Date(pausedAt).getTime() : null;
  const [now, setNow] = useState(serverNow);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const titleRef = useRef(title);
  titleRef.current = title;
  const headsUpRef = useRef(onHeadsUp);
  headsUpRef.current = onHeadsUp;
  const wantsHeadsUp = onHeadsUp !== undefined;

  // Display tick. Background tabs may throttle this; the one-shot below fires on time.
  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (pausedTime !== null) return;
    const ms = end - serverNow();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      setNow(serverNow());
      onEndRef.current();
    }, ms);
    return () => clearTimeout(t);
  }, [end, pausedTime]);

  useEffect(() => {
    if (!wantsHeadsUp || pausedTime !== null) return;
    const ms = end - HEADS_UP_MS - serverNow();
    if (ms <= 0) return;
    const t = setTimeout(() => headsUpRef.current?.(), ms);
    return () => clearTimeout(t);
  }, [end, wantsHeadsUp, pausedTime]);

  const remaining = Math.max(0, end - (pausedTime ?? now));
  const over = remaining === 0;
  const clock = over ? null : mmss(Math.ceil(remaining / 1000) * 1000);
  useEffect(() => {
    document.title = titleRef.current(clock);
  }, [clock, pausedTime]);
  useEffect(
    () => () => {
      document.title = 'Anker';
    },
    [],
  );

  return { remaining, over };
}

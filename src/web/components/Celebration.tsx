import { useEffect, useState } from 'preact/hooks';
import { doneSound } from '../signal.ts';

const EVENT = 'anker:celebrate';

/** A brief "done" moment: a check, a word, a soft sound. No points, no streaks. */
export function celebrate(text: string): void {
  doneSound();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: text }));
}

export function Celebration() {
  const [shown, setShown] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    const on = (e: Event) => setShown({ text: (e as CustomEvent<string>).detail, key: Date.now() });
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 1400);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div class="celebration" key={shown.key} role="status" aria-live="polite">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27l7 7 15-16" />
      </svg>
      <p>{shown.text}</p>
    </div>
  );
}

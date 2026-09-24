import type { Break as BreakT } from '../../shared/api.ts';
import { api } from '../api.ts';
import { mmss, useCountdown } from '../countdown.ts';
import { useAction } from '../hooks.ts';
import { signalTimerEnd, softCue } from '../signal.ts';

/** A break between focus blocks. When it runs out, Now comes back; nothing starts itself. */
export function Break({
  brk,
  headsUp,
  refresh,
  onOver,
}: {
  brk: BreakT;
  headsUp: boolean;
  refresh: () => Promise<void>;
  onOver: () => void;
}) {
  const { busy, error, run } = useAction();

  const leave = () =>
    run(async () => {
      // The server may already have closed it on its own clock; that's fine.
      await api.endBreak(brk.id).catch(() => {});
      await refresh();
    });

  const { remaining } = useCountdown(
    brk.endsAt,
    () => {
      signalTimerEnd("Break's over", 'Ready when you are.');
      onOver();
      void leave();
    },
    (clock) => (clock ? `${clock} · Break · Anker` : 'Anker'),
    headsUp && brk.plannedSeconds >= 5 * 60 ? softCue : undefined,
  );

  const extend = () =>
    run(async () => {
      await api.extendBreak(brk.id);
      await refresh();
    });

  const progress = Math.min(1, 1 - remaining / (brk.plannedSeconds * 1000));

  return (
    <main class="screen centred">
      <div class="stack">
        <h1 class="headline">
          {brk.kind === 'long' ? 'Time for a longer break.' : 'Take a break.'}
        </h1>
        <p class="lead">Step away from the screen. Stretch, get some water.</p>
      </div>

      <div class="stack" style={{ gap: '1rem' }}>
        <p class="timer" role="timer" aria-live="off">
          {mmss(remaining)}
        </p>
        <div class="progress" aria-hidden="true">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div class="stack">
        <button class="quiet" disabled={busy} onClick={extend}>
          +5 min
        </button>
        <button class="quiet" disabled={busy} onClick={leave}>
          Skip break
        </button>
      </div>

      {error && <p class="note">{error}</p>}
    </main>
  );
}

import type { Break as BreakT, FeatureKey, Settings } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Clock } from '../components/Clock.tsx';
import { CornerLinks } from '../components/CornerLinks.tsx';
import { SkipIcon } from '../components/icons.tsx';
import { mmss, useCountdown } from '../countdown.ts';
import { useAction } from '../hooks.ts';
import { signalTimerEnd, softCue } from '../signal.ts';
import { useTapToShow } from '../tapToShow.ts';

/** A break between focus blocks. When it runs out, Now comes back; nothing starts itself. */
export function Break({
  brk,
  features,
  refresh,
  onOver,
}: {
  brk: BreakT;
  features: Pick<Settings, FeatureKey>;
  refresh: () => Promise<void>;
  onOver: () => void;
}) {
  const { busy, error, run } = useAction();
  const shown = useTapToShow();

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
    features.headsUp && brk.plannedSeconds >= 5 * 60 ? softCue : undefined,
  );

  const extend = () =>
    run(async () => {
      await api.extendBreak(brk.id);
      await refresh();
    });

  const setEnd = async (endsAt: string) => {
    let saved = false;
    await run(async () => {
      await api.setBreakEnd(brk.id, endsAt);
      await refresh();
      saved = true;
    });
    return saved;
  };

  const progress = Math.min(1, 1 - remaining / (brk.plannedSeconds * 1000));

  return (
    <main
      class="screen centred"
      onPointerDownCapture={shown.onPointerDown}
      onPointerUpCapture={shown.onPointerUp}
      onClickCapture={shown.onClick}
    >
      <CornerLinks shown={shown.on} inbox />
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
        <Clock
          endsAt={brk.endsAt}
          features={features}
          onSetEnd={features.editEndTime ? setEnd : undefined}
        />
      </div>

      <div class="row">
        <button
          class="icon quiet plus-five"
          disabled={busy}
          onClick={extend}
          aria-label="Add 5 minutes"
          title="Add 5 minutes"
        >
          +5
        </button>
        <button
          class="icon quiet"
          disabled={busy}
          onClick={leave}
          aria-label="Skip break"
          title="Skip break"
        >
          <SkipIcon />
        </button>
      </div>

      {error && <p class="note">{error}</p>}
    </main>
  );
}

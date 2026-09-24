import { useState } from 'preact/hooks';
import type { Block, BlockOutcome } from '../../shared/api.ts';
import { api } from '../api.ts';
import { mmss, useCountdown } from '../countdown.ts';
import { celebrate } from '../components/Celebration.tsx';
import { ParkThought } from '../components/ParkThought.tsx';
import { useAction } from '../hooks.ts';
import { signalTimerEnd, softCue } from '../signal.ts';

type Phase = 'running' | 'stopping' | 'stuck';

/** A running (or finished) focus block on one step. */
export function Focus({
  block,
  taskId,
  taskTitle,
  headsUp,
  refresh,
}: {
  block: Block;
  taskId: number | null;
  taskTitle: string | null;
  headsUp: boolean;
  refresh: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('running');
  const [smaller, setSmaller] = useState('');
  const { busy, error, run } = useAction();
  const stepText = block.stepText ?? 'This step';

  const { remaining, over } = useCountdown(
    block.endsAt,
    () => signalTimerEnd('Block finished', stepText),
    (clock) => (clock ? `${clock} · Anker` : "Time's up · Anker"),
    headsUp && block.plannedSeconds >= 5 * 60 ? softCue : undefined,
  );

  const finish = (outcome: BlockOutcome) =>
    run(async () => {
      await api.finishBlock(block.id, outcome);
      if (outcome === 'done') celebrate('Done.');
      await refresh();
    });

  const extend = () =>
    run(async () => {
      await api.extendBlock(block.id);
      await refresh();
    });

  const submitSmaller = (e: Event) => {
    e.preventDefault();
    const text = smaller.trim();
    if (!text) return;
    void run(async () => {
      await api.finishBlock(block.id, 'stuck');
      if (block.stepId !== null && taskId !== null) {
        await api.addStepBefore(taskId, text, block.stepId);
      }
      await refresh();
    });
  };

  if (phase === 'stuck') {
    return (
      <main class="screen centred">
        <p class="lead">{stepText}</p>
        <h1 class="headline">What's a smaller first move?</h1>
        <form class="stack" onSubmit={submitSmaller}>
          <input
            type="text"
            value={smaller}
            onInput={(e) => setSmaller(e.currentTarget.value)}
            placeholder="Something you could do in two minutes"
            autoFocus
            enterKeyHint="done"
            maxLength={500}
          />
          <div class="row">
            <button class="primary" type="submit" disabled={busy || !smaller.trim()}>
              Use this
            </button>
            <button class="quiet" type="button" disabled={busy} onClick={() => finish('stuck')}>
              Skip for now
            </button>
          </div>
        </form>
        {error && <p class="note">{error}</p>}
      </main>
    );
  }

  const progress = Math.min(1, 1 - remaining / (block.plannedSeconds * 1000));

  return (
    <main class="screen centred">
      <div class="stack" style={{ gap: '0.5rem' }}>
        {taskTitle && taskTitle !== stepText && <p class="task-label">{taskTitle}</p>}
        <h1 class="step-text">{stepText}</h1>
      </div>

      {over ? (
        <p class="headline fade-in">Time's up. How did it go?</p>
      ) : (
        <div class="stack" style={{ gap: '1rem' }}>
          <p class="timer focus-timer" role="timer" aria-live="off">
            {mmss(remaining)}
          </p>
          <div class="progress" aria-hidden="true">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {over || phase === 'stopping' ? (
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={() => finish('done')}>
            Done
          </button>
          <button class="big" disabled={busy} onClick={() => setPhase('stuck')}>
            Stuck
          </button>
          {over ? (
            <button class="big" disabled={busy} onClick={() => finish('keep_going')}>
              Keep going
            </button>
          ) : (
            <>
              <button class="quiet" disabled={busy} onClick={() => finish('abandoned')}>
                Stop for now
              </button>
              <button class="quiet" onClick={() => setPhase('running')}>
                Back to the timer
              </button>
            </>
          )}
        </div>
      ) : (
        <div class="stack">
          <ParkThought />
          <div class="row">
            <button class="quiet" disabled={busy} onClick={extend}>
              +5 min
            </button>
            <button class="quiet" onClick={() => setPhase('stopping')}>
              Stop early
            </button>
          </div>
        </div>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

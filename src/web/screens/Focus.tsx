import { useEffect, useState } from 'preact/hooks';
import type { Block, BlockOutcome } from '../../shared/api.ts';
import { api, serverNow } from '../api.ts';
import { useAction } from '../hooks.ts';
import { signalBlockEnd } from '../signal.ts';

type Phase = 'running' | 'stopping' | 'stuck';

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A running (or finished) focus block on one step. */
export function Focus({
  block,
  taskId,
  refresh,
  onDone,
}: {
  block: Block;
  taskId: number | null;
  refresh: () => Promise<void>;
  onDone: () => void;
}) {
  const endsAt = new Date(block.endsAt).getTime();
  const [now, setNow] = useState(serverNow);
  const [phase, setPhase] = useState<Phase>('running');
  const [smaller, setSmaller] = useState('');
  const { busy, error, run } = useAction();

  const remaining = Math.max(0, endsAt - now);
  const over = remaining === 0;
  const stepText = block.stepText ?? 'This step';

  // Display tick. Background tabs may throttle this; the one-shot below fires on time.
  useEffect(() => {
    const tick = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const ms = endsAt - serverNow();
    if (ms <= 0) return;
    const t = setTimeout(() => {
      setNow(serverNow());
      signalBlockEnd(stepText);
    }, ms);
    return () => clearTimeout(t);
  }, [block.id, endsAt, stepText]);

  const seconds = Math.ceil(remaining / 1000);
  useEffect(() => {
    document.title = over ? "Time's up · Anker" : `${mmss(seconds * 1000)} · Anker`;
  }, [over, seconds]);
  useEffect(
    () => () => {
      document.title = 'Anker';
    },
    [],
  );

  const finish = (outcome: BlockOutcome) =>
    run(async () => {
      await api.finishBlock(block.id, outcome);
      if (outcome === 'done') onDone();
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
      <p class="lead">{stepText}</p>

      {over ? (
        <h1 class="headline fade-in">Time's up. How did it go?</h1>
      ) : (
        <div class="stack" style={{ gap: '1rem' }}>
          <p class="timer" role="timer" aria-live="off">
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
          <button class="quiet" onClick={() => setPhase('stopping')}>
            Stop early
          </button>
        </div>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

import { useEffect, useRef, useState } from 'preact/hooks';
import type { Block, BlockOutcome, FeatureKey, Settings } from '../../shared/api.ts';
import { api } from '../api.ts';
import { mmss, useCountdown } from '../countdown.ts';
import { celebrate } from '../components/Celebration.tsx';
import { Clock } from '../components/Clock.tsx';
import { MusicIcon, PeopleIcon, StopIcon, ThoughtIcon } from '../components/icons.tsx';
import { ParkThought } from '../components/ParkThought.tsx';
import { useAction } from '../hooks.ts';
import { signalTimerEnd, softCue } from '../signal.ts';

/** Endel's focus soundscape, opened in a new tab. */
const FOCUS_MUSIC_URL = 'https://app.endel.io/player/focus';

type Phase = 'running' | 'stopping' | 'stuck' | 'breakdown';

/** A running (or finished) focus block on one step. */
export function Focus({
  block,
  taskId,
  taskTitle,
  features,
  refresh,
}: {
  block: Block;
  taskId: number | null;
  taskTitle: string | null;
  features: Pick<Settings, FeatureKey | 'focusRoomUrl'>;
  refresh: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('running');
  const [smaller, setSmaller] = useState('');
  const shown = useTapToShow();
  const [parking, setParking] = useState(false);
  const reveal = `${features.calmFocus ? ' reveal' : ''}${shown.on ? ' shown' : ''}`;
  const { busy, error, run } = useAction();
  const stepText = block.stepText ?? 'This step';
  // Started as is: the task's title stands in as its one step, so offer a real first step.
  const notBrokenDown = taskTitle !== null && taskTitle === block.stepText;

  const { remaining, over } = useCountdown(
    block.endsAt,
    () => signalTimerEnd('Block finished', stepText),
    (clock) => (clock ? `${clock} · Anker` : "Time's up · Anker"),
    features.headsUp && block.plannedSeconds >= 5 * 60 ? softCue : undefined,
  );

  const finish = (outcome: BlockOutcome, takeBreak?: boolean) =>
    run(async () => {
      await api.finishBlock(block.id, outcome, takeBreak);
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

  const submitFirstStep = (e: Event) => {
    e.preventDefault();
    const text = smaller.trim();
    if (!text) return;
    void run(async () => {
      await api.finishBlock(block.id, 'abandoned');
      if (block.stepId !== null && taskId !== null) {
        await api.addStepBefore(taskId, text, block.stepId);
        await api.updateStep(block.stepId, { status: 'replaced' });
      }
      await refresh();
    });
  };

  if (phase === 'breakdown') {
    return (
      <main class="screen centred">
        <p class="task-label">{taskTitle}</p>
        <h1 class="headline">What's the first step?</h1>
        <form class="stack" onSubmit={submitFirstStep}>
          <input
            type="text"
            value={smaller}
            onInput={(e) => setSmaller(e.currentTarget.value)}
            placeholder="Something small you can start on"
            autoFocus
            enterKeyHint="done"
            maxLength={500}
          />
          <div class="row">
            <button class="primary" type="submit" disabled={busy || !smaller.trim()}>
              Use this
            </button>
            <button class="quiet" type="button" onClick={() => setPhase('stopping')}>
              Back
            </button>
          </div>
        </form>
        {error && <p class="note">{error}</p>}
      </main>
    );
  }

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
    <main class="screen centred" onPointerDown={shown.onPointerDown}>
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
          <Clock endsAt={block.endsAt} features={features} />
        </div>
      )}

      {over || phase === 'stopping' ? (
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={() => finish('done')}>
            Done
          </button>
          {!over && features.earlyBreak && (
            <button class="quiet" disabled={busy} onClick={() => finish('done', true)}>
              Done, take a break
            </button>
          )}
          <button class="big" disabled={busy} onClick={() => setPhase('stuck')}>
            Stuck
          </button>
          {notBrokenDown && (
            <button class="quiet" disabled={busy} onClick={() => setPhase('breakdown')}>
              Break it down
            </button>
          )}
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
        <div class={`stack${reveal}`}>
          <div class="row">
            <button
              class="icon quiet"
              aria-label="Park a thought"
              title="Park a thought"
              aria-expanded={parking}
              onClick={() => setParking(!parking)}
            >
              <ThoughtIcon />
            </button>
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
              onClick={() => setPhase('stopping')}
              aria-label="Stop early"
              title="Stop early"
            >
              <StopIcon />
            </button>
          </div>
          <ParkThought open={parking} onClose={() => setParking(false)} />
        </div>
      )}

      {!over &&
        phase === 'running' &&
        ((features.focusRoom && features.focusRoomUrl) || features.focusMusic) && (
          <div class={`row corner${reveal}`}>
            {features.focusMusic && (
              <a
                class="button icon quiet"
                href={FOCUS_MUSIC_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Focus music (Endel)"
                title="Focus music (Endel)"
              >
                <MusicIcon />
              </a>
            )}
            {features.focusRoom && features.focusRoomUrl && (
              <a
                class="button icon quiet"
                href={features.focusRoomUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join the room"
                title="Join the room"
              >
                <PeopleIcon />
              </a>
            )}
          </div>
        )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

/** How long the buttons stay after a tap on a touch screen. */
const SHOW_MS = 5000;

/**
 * On a touch screen, a tap shows the hidden Focus buttons for a few seconds. With a mouse,
 * CSS shows them while the pointer is over them (`.reveal:hover`).
 */
function useTapToShow() {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), SHOW_MS);
  };
  return { on, onPointerDown };
}

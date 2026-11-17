import { useRef, useState } from 'preact/hooks';
import type { Block, BlockOutcome, FeatureKey, Settings } from '../../shared/api.ts';
import { api } from '../api.ts';
import { appLink } from '../appLink.ts';
import { mmss, useCountdown } from '../countdown.ts';
import { celebrate } from '../components/Celebration.tsx';
import { Clock } from '../components/Clock.tsx';
import { CornerLinks } from '../components/CornerLinks.tsx';
import { EndDay } from '../components/EndDay.tsx';
import { MusicIcon, PeopleIcon, StopIcon, ThoughtIcon } from '../components/icons.tsx';
import { ParkThought } from '../components/ParkThought.tsx';
import { useAction } from '../hooks.ts';
import { useTapToShow } from '../tapToShow.ts';
import { signalTimerEnd, softCue } from '../signal.ts';

type Phase = 'running' | 'stopping' | 'stuck' | 'breakdown' | 'doneEarly';

/** A running (or finished) focus block on one step. */
export function Focus({
  block,
  taskId,
  taskTitle,
  features,
  endDayOffer,
  refresh,
}: {
  block: Block;
  taskId: number | null;
  taskTitle: string | null;
  features: Pick<Settings, FeatureKey | 'focusRoomUrl' | 'focusMusicUrl'>;
  /** Offer "End the day" after an early Done, later in the day. */
  endDayOffer: boolean;
  refresh: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>('running');
  const [smaller, setSmaller] = useState('');
  const shown = useTapToShow();
  const music =
    features.focusMusic && features.focusMusicUrl ? appLink(features.focusMusicUrl) : null;
  const [parking, setParking] = useState(false);
  const reveal = `${features.calmFocus ? ' reveal' : ''}${shown.on ? ' shown' : ''}`;
  const { busy, error, run } = useAction();
  const stepText = block.stepText ?? 'This step';
  // Started as is: the task's title stands in as its one step, so offer a real first step.
  const notBrokenDown = taskTitle !== null && taskTitle === block.stepText;

  const paused = block.pausedAt !== null;
  // Set once the block is finished but this screen is still up (the early-Done choice).
  const finished = useRef(false);

  const { remaining, over } = useCountdown(
    block.endsAt,
    () => {
      if (!finished.current) signalTimerEnd('Block finished', stepText);
    },
    (clock) =>
      finished.current
        ? 'Anker'
        : paused
          ? 'Paused · Anker'
          : clock
            ? `${clock} · Anker`
            : "Time's up · Anker",
    features.headsUp && block.plannedSeconds >= 5 * 60 ? softCue : undefined,
    block.pausedAt,
  );

  const finish = (outcome: BlockOutcome) =>
    run(async () => {
      const result = await api.finishBlock(block.id, outcome);
      if (outcome === 'done') {
        celebrate('Done.');
        // Done before time's up: offer a break before moving on. (Time's up starts one.)
        if (!result.break && features.earlyBreak) {
          finished.current = true;
          setPhase('doneEarly');
          return;
        }
      }
      await refresh();
    });

  const pause = () =>
    run(async () => {
      await api.pauseBlock(block.id);
      setPhase('running');
      await refresh();
    });

  const resume = () =>
    run(async () => {
      await api.resumeBlock(block.id);
      await refresh();
    });

  const takeBreak = () =>
    run(async () => {
      await api.startBreak();
      await refresh();
    });

  // A task started as is gets a real first step; otherwise, a smaller first move.
  const stuck = () => setPhase(notBrokenDown ? 'breakdown' : 'stuck');

  const extend = () =>
    run(async () => {
      await api.extendBlock(block.id);
      await refresh();
    });

  const setEnd = async (endsAt: string) => {
    let saved = false;
    await run(async () => {
      await api.setBlockEnd(block.id, endsAt);
      await refresh();
      saved = true;
    });
    return saved;
  };

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
      await api.finishBlock(block.id, 'stuck');
      if (block.stepId !== null && taskId !== null) {
        await api.addStepBefore(taskId, text, block.stepId);
        await api.updateStep(block.stepId, { status: 'replaced' });
      }
      await refresh();
    });
  };

  if (phase === 'doneEarly') {
    return (
      <main class="screen centred">
        <h1 class="headline">Nice. What now?</h1>
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={takeBreak}>
            Take a break
          </button>
          <button class="big" disabled={busy} onClick={() => void refresh()}>
            Carry on
          </button>
          {endDayOffer && <EndDay refresh={refresh} />}
        </div>
        {error && <p class="note">{error}</p>}
      </main>
    );
  }

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
    <main
      class="screen centred"
      onPointerDownCapture={shown.onPointerDown}
      onPointerUpCapture={shown.onPointerUp}
      onClickCapture={shown.onClick}
    >
      {/* The inbox only while paused, so it doesn't pull you away mid-block. */}
      <CornerLinks shown={shown.on} inbox={paused} />
      <div class="stack" style={{ gap: '0.5rem' }}>
        {taskTitle && taskTitle !== stepText && <p class="task-label">{taskTitle}</p>}
        <h1 class="step-text">{stepText}</h1>
      </div>

      {paused ? (
        <div class="stack" style={{ gap: '1rem' }}>
          <p class="timer focus-timer paused" role="timer" aria-live="off">
            {mmss(remaining)}
          </p>
          <p class="clock">Paused</p>
        </div>
      ) : over ? (
        <p class="headline fade-in">Time's up. How did it go?</p>
      ) : (
        <div class="stack" style={{ gap: '1rem' }}>
          <p class="timer focus-timer" role="timer" aria-live="off">
            {mmss(remaining)}
          </p>
          <div class="progress" aria-hidden="true">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <Clock
            endsAt={block.endsAt}
            features={features}
            onSetEnd={features.editEndTime ? setEnd : undefined}
          />
        </div>
      )}

      {paused ? (
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={resume}>
            Resume
          </button>
          <div class="row">
            <button class="quiet" disabled={busy} onClick={() => finish('done')}>
              Done
            </button>
            <button class="quiet" disabled={busy} onClick={stuck}>
              Stuck
            </button>
            <button class="quiet" disabled={busy} onClick={() => finish('abandoned')}>
              Stop
            </button>
          </div>
        </div>
      ) : over || phase === 'stopping' ? (
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={() => finish('done')}>
            Done
          </button>
          <button class="big" disabled={busy} onClick={stuck}>
            Stuck
          </button>
          {over ? (
            <button class="big" disabled={busy} onClick={() => finish('keep_going')}>
              Keep going
            </button>
          ) : (
            <>
              <button class="big" disabled={busy} onClick={pause}>
                Pause
              </button>
              <button class="quiet" onClick={() => setPhase('running')}>
                ← Back
              </button>
            </>
          )}
        </div>
      ) : (
        <div class={`stack${reveal}`}>
          {((features.focusRoom && features.focusRoomUrl) || music) && (
            <div class="row">
              {music && (
                <a
                  class="button icon quiet"
                  href={music.href}
                  target={music.external ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  aria-label="Focus music"
                  title="Focus music"
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

      {error && <p class="note">{error}</p>}
    </main>
  );
}

import { useState } from 'preact/hooks';
import type { AppState } from '../../shared/api.ts';
import { api } from '../api.ts';
import { celebrate } from '../components/Celebration.tsx';
import { Menu } from '../components/Menu.tsx';
import { go, useAction } from '../hooks.ts';
import { prepareSignal } from '../signal.ts';

/** A shorter and a longer option beside Start. Ten minutes is easy to say yes to. */
function otherLengths(standard: number): number[] {
  const shorter = standard > 10 ? 10 : standard > 5 ? 5 : null;
  const longer = standard < 45 ? 45 : standard + 15 <= 180 ? standard + 15 : null;
  return [shorter, longer].filter((m): m is number => m !== null);
}

function StartControls({
  minutes,
  busy,
  onStart,
}: {
  minutes: number;
  busy: boolean;
  onStart: (minutes?: number) => void;
}) {
  return (
    <div class="stack">
      <button class="primary big" disabled={busy} onClick={() => onStart()}>
        Start · {minutes} min
      </button>
      <div class="row lengths">
        <span class="note">or</span>
        {otherLengths(minutes).map((m) => (
          <button key={m} class="quiet" disabled={busy} onClick={() => onStart(m)}>
            {m} min
          </button>
        ))}
      </div>
    </div>
  );
}

/** The current step and a Start button. Nothing else. */
export function Now({
  state,
  flash,
  refresh,
}: {
  state: AppState;
  flash: string | null;
  refresh: () => Promise<void>;
}) {
  const { busy, error, run } = useAction();
  const { currentTask: task, currentStep: step, nextTask: next, timers } = state;
  const [breakingDown, setBreakingDown] = useState(false);
  const [firstStep, setFirstStep] = useState('');

  const start = (minutes?: number) =>
    run(async () => {
      prepareSignal();
      await api.startBlock(minutes);
      await refresh();
    });

  // Next up: make it current and start in one tap, so there is no gap to fall into.
  const startNext = (minutes?: number) =>
    run(async () => {
      prepareSignal();
      await api.makeCurrent(next!.id);
      await api.startBlock(minutes);
      await refresh();
    });

  const addFirstStep = (e: Event) => {
    e.preventDefault();
    const text = firstStep.trim();
    if (!text || !task) return;
    void run(async () => {
      await api.addSteps(task.id, [text]);
      setFirstStep('');
      setBreakingDown(false);
      await refresh();
    });
  };

  const finishTask = () =>
    run(async () => {
      await api.updateTask(task!.id, { status: 'done' });
      celebrate('Task done.');
      await refresh();
    });

  let body;
  if (!task && next) {
    body = (
      <>
        {flash && <p class="note fade-in">{flash}</p>}
        <div class="stack" style={{ gap: '0.5rem' }}>
          <p class="task-label">Next up</p>
          <h1 class="step-text fade-in" key={`next-${next.id}`}>
            {next.title}
          </h1>
        </div>
        <StartControls minutes={timers.focusMinutes} busy={busy} onStart={startNext} />
        <button class="quiet" onClick={() => go('#plan')}>
          Change today's plan
        </button>
      </>
    );
  } else if (!task) {
    body = (
      <>
        {flash && <p class="note fade-in">{flash}</p>}
        <h1 class="headline">Nothing picked yet.</h1>
        <p class="lead">Pick up to three things for today.</p>
        <div class="stack">
          <button class="primary big" onClick={() => go('#plan')}>
            Plan today
          </button>
          <button class="quiet" onClick={() => go('#inbox')}>
            Open inbox
          </button>
        </div>
      </>
    );
  } else if (!step && !task.hasSteps && breakingDown) {
    body = (
      <>
        <p class="task-label">{task.title}</p>
        <h1 class="headline">What's the first step?</h1>
        <form class="stack" onSubmit={addFirstStep}>
          <input
            type="text"
            value={firstStep}
            onInput={(e) => setFirstStep(e.currentTarget.value)}
            placeholder="Something small you can start on"
            autoFocus
            enterKeyHint="done"
            maxLength={500}
          />
          <div class="row">
            <button class="primary" type="submit" disabled={busy || !firstStep.trim()}>
              Add step
            </button>
            <button class="quiet" type="button" onClick={() => setBreakingDown(false)}>
              Back
            </button>
          </div>
        </form>
      </>
    );
  } else if (!step && !task.hasSteps) {
    body = (
      <>
        {flash && <p class="note fade-in">{flash}</p>}
        <h1 class="step-text fade-in" key={`task-${task.id}`}>
          {task.title}
        </h1>
        <StartControls minutes={timers.focusMinutes} busy={busy} onStart={start} />
        <button class="quiet" onClick={() => setBreakingDown(true)}>
          Break it down first
        </button>
      </>
    );
  } else if (!step) {
    body = (
      <>
        <h1 class="headline">That task is clear.</h1>
        <p class="lead">{task.title}</p>
        <div class="stack">
          <button class="primary big" disabled={busy} onClick={finishTask}>
            Mark task done
          </button>
          <button class="quiet" onClick={() => go(`#task/${task.id}`)}>
            Add a step
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {flash && <p class="note fade-in">{flash}</p>}
        <div class="stack" style={{ gap: '0.5rem' }}>
          {task.title !== step.text && <p class="task-label">{task.title}</p>}
          <h1 class="step-text fade-in" key={step.id}>
            {step.text}
          </h1>
        </div>
        <StartControls minutes={timers.focusMinutes} busy={busy} onStart={start} />
      </>
    );
  }

  return (
    <main class="screen centred">
      <Menu taskId={task?.id ?? null} onEnded={refresh} />
      {body}
      {error && <p class="note">{error}</p>}
    </main>
  );
}

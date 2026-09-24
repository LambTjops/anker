import { useState } from 'preact/hooks';
import type { AppState } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Menu } from '../components/Menu.tsx';
import { go, useAction } from '../hooks.ts';
import { prepareSignal } from '../signal.ts';

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
  const { currentTask: task, currentStep: step } = state;
  const [breakingDown, setBreakingDown] = useState(false);
  const [firstStep, setFirstStep] = useState('');

  const start = () =>
    run(async () => {
      prepareSignal();
      await api.startBlock();
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
      await refresh();
    });

  return (
    <main class="screen centred">
      <Menu taskId={task?.id ?? null} onEnded={refresh} />

      {!task ? (
        <>
          <h1 class="headline">Nothing picked yet.</h1>
          <p class="lead">Choose one task from the inbox to work on.</p>
          <div class="stack">
            <button class="primary big" onClick={() => go('#inbox')}>
              Open inbox
            </button>
          </div>
        </>
      ) : !step && !task.hasSteps ? (
        breakingDown ? (
          <>
            <p class="lead">{task.title}</p>
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
        ) : (
          <>
            <h1 class="step-text fade-in" key={`task-${task.id}`}>
              {task.title}
            </h1>
            <div class="stack">
              <button class="primary big" disabled={busy} onClick={start}>
                Start
              </button>
              <button class="quiet" onClick={() => setBreakingDown(true)}>
                Break it down first
              </button>
            </div>
          </>
        )
      ) : !step ? (
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
      ) : (
        <>
          {flash && <p class="note fade-in">{flash}</p>}
          <div class="stack" style={{ gap: '0.5rem' }}>
            {task.title !== step.text && <p class="task-label">{task.title}</p>}
            <h1 class="step-text fade-in" key={step.id}>
              {step.text}
            </h1>
          </div>
          <div class="stack">
            <button class="primary big" disabled={busy} onClick={start}>
              Start
            </button>
          </div>
        </>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

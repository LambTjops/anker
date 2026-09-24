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

  const start = () =>
    run(async () => {
      prepareSignal();
      await api.startBlock();
      await refresh();
    });

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
          <h1 class="step-text fade-in" key={step.id}>
            {step.text}
          </h1>
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

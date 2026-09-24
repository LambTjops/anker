import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Step, Task as TaskT } from '../../shared/api.ts';
import { api } from '../api.ts';
import { celebrate } from '../components/Celebration.tsx';
import { go, useAction } from '../hooks.ts';

/** Planning a task: the only screen where a list of steps is visible. */
export function Task({ id }: { id: number }) {
  const [task, setTask] = useState<TaskT | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [missing, setMissing] = useState(false);
  const { busy, error, run } = useAction();

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([api.task(id), api.steps(id)]);
      setTask(t);
      setTitle(t.title);
      setSteps(s);
    } catch {
      setMissing(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (missing) {
    return (
      <main class="screen centred">
        <p class="lead">That task isn't here any more.</p>
        <div class="stack">
          <button onClick={() => go('#inbox')}>Back to inbox</button>
        </div>
      </main>
    );
  }
  if (!task) return <main class="screen" />;

  const todo = steps.filter((s) => s.status === 'todo');
  const done = steps.filter((s) => s.status === 'done');

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === task.title) return setTitle(task.title);
    void run(async () => setTask(await api.updateTask(id, { title: t })));
  };

  // Several lines (typed or pasted) become one step per line; list markers are dropped.
  const addTexts = (raw: string) => {
    const texts = raw
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    void run(async () => {
      await api.addSteps(id, texts);
      setDraft('');
      await load();
    });
  };

  // Swap with the neighbouring open step. Positions are indexes into the full list.
  const move = (step: Step, delta: -1 | 1) => {
    const neighbour = todo[todo.indexOf(step) + delta];
    if (!neighbour) return;
    void run(async () => {
      await api.updateStep(step.id, { position: steps.indexOf(neighbour) });
      await load();
    });
  };

  const act = (fn: () => Promise<unknown>, after: () => void | Promise<void> = load) =>
    run(async () => {
      await fn();
      await after();
    });

  return (
    <main class="screen">
      <div class="topbar">
        <button class="quiet" onClick={() => go('#inbox')}>
          ← Inbox
        </button>
        {task.status === 'current' && <span class="tag">current task</span>}
      </div>

      <input
        class="title-input"
        type="text"
        value={title}
        aria-label="Task title"
        onInput={(e) => setTitle(e.currentTarget.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        maxLength={500}
      />

      <section class="section">
        <h2>Steps</h2>
        {todo.length === 0 && (
          <p class="note" style={{ marginBottom: '0.75rem' }}>
            Small, concrete steps work best: start each with a verb.
          </p>
        )}
        <ol class="list">
          {todo.map((s, i) => (
            <StepRow
              key={s.id}
              step={s}
              first={i === 0}
              last={i === todo.length - 1}
              onSave={(text) => act(() => api.updateStep(s.id, { text }))}
              onMove={(d) => move(s, d)}
              onDelete={() => act(() => api.deleteStep(s.id))}
            />
          ))}
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTexts(draft);
          }}
          style={{ marginTop: '0.75rem' }}
        >
          <input
            type="text"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onPaste={(e) => {
              const text = e.clipboardData?.getData('text') ?? '';
              if (text.includes('\n')) {
                e.preventDefault();
                addTexts(text);
              }
            }}
            placeholder="Add a step, e.g. “Open the doc and write the first heading”"
            enterKeyHint="done"
            maxLength={5000}
          />
        </form>
      </section>

      {done.length > 0 && (
        <section class="section">
          <h2>Done</h2>
          <ul class="done-list">
            {done.map((s) => (
              <li key={s.id}>{s.text}</li>
            ))}
          </ul>
        </section>
      )}

      <section class="section stack" style={{ marginTop: 'auto', paddingTop: '2rem' }}>
        {task.status === 'current' ? (
          <button class="primary" onClick={() => go('')}>
            Go to Now
          </button>
        ) : (
          <button
            class="primary"
            disabled={busy}
            onClick={() =>
              act(
                () => api.makeCurrent(id),
                () => go(''),
              )
            }
          >
            Make this my current task
          </button>
        )}
        {task.status !== 'done' && (
          <button
            disabled={busy}
            onClick={() =>
              act(
                () => api.updateTask(id, { status: 'done' }),
                () => {
                  celebrate('Task done.');
                  go('#inbox');
                },
              )
            }
          >
            Mark task done
          </button>
        )}
        {confirmDelete ? (
          <div class="row">
            <button
              disabled={busy}
              onClick={() =>
                act(
                  () => api.deleteTask(id),
                  () => go('#inbox'),
                )
              }
            >
              Yes, delete it
            </button>
            <button class="quiet" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button class="quiet" onClick={() => setConfirmDelete(true)}>
            Delete task
          </button>
        )}
        {error && <p class="note">{error}</p>}
      </section>
    </main>
  );
}

function StepRow({
  step,
  first,
  last,
  onSave,
  onMove,
  onDelete,
}: {
  step: Step;
  first: boolean;
  last: boolean;
  onSave: (text: string) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(step.text);

  const commit = () => {
    setEditing(false);
    const t = text.trim();
    if (t && t !== step.text) onSave(t);
    else setText(step.text);
  };

  return (
    <li class="step-row">
      {editing ? (
        <input
          type="text"
          value={text}
          autoFocus
          aria-label="Step"
          onInput={(e) => setText(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(step.text);
              setEditing(false);
            }
          }}
          maxLength={500}
        />
      ) : (
        <span
          class="text"
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          onKeyDown={(e) => e.key === 'Enter' && setEditing(true)}
        >
          {step.text}
        </span>
      )}
      <button aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
        ↑
      </button>
      <button aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
        ↓
      </button>
      <button aria-label="Delete step" onClick={onDelete}>
        ×
      </button>
    </li>
  );
}

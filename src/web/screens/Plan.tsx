import { useEffect, useState } from 'preact/hooks';
import { PLAN_LIMIT, type Task } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Capture } from '../components/Capture.tsx';
import { go, useAction } from '../hooks.ts';
import { splitByAge } from '../later.ts';

/**
 * Today's shortlist: up to three tasks, in the order you'll do them. Deciding once in
 * the morning means no decision after each task, only "Next up".
 */
export function Plan() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [showOlder, setShowOlder] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    void run(async () => {
      const [all, plan] = await Promise.all([api.tasks(), api.plan()]);
      setTasks(all);
      setPicked(plan.map((t) => t.id));
    });
  }, [run]);

  const save = (ids: number[]) => {
    setPicked(ids);
    void run(async () => {
      await api.setPlan(ids);
    });
  };

  const toggle = (id: number) => {
    if (picked.includes(id)) save(picked.filter((p) => p !== id));
    else if (picked.length < PLAN_LIMIT) save([...picked, id]);
  };

  const current = tasks?.find((t) => t.status === 'current') ?? null;
  const first = tasks?.find((t) => t.id === picked[0]) ?? null;
  const full = picked.length >= PLAN_LIMIT;

  const begin = () =>
    run(async () => {
      if (!current && first) await api.makeCurrent(first.id);
      go('');
    });

  const { recent, older } = splitByAge(tasks ?? [], new Set(picked));

  const item = (t: Task) => {
    const at = picked.indexOf(t.id);
    return (
      <li key={t.id}>
        <button
          class={`list-item pick${at >= 0 ? ' picked' : ''}`}
          aria-pressed={at >= 0}
          disabled={busy || (at < 0 && full)}
          onClick={() => toggle(t.id)}
        >
          <span class="pick-mark" aria-hidden="true">
            {at >= 0 ? at + 1 : ''}
          </span>
          <span>{t.title}</span>
          {t.status === 'current' && <span class="tag">current</span>}
        </button>
      </li>
    );
  };

  return (
    <main class="screen">
      <div class="topbar">
        <button class="quiet" onClick={() => go('')}>
          ← Back
        </button>
        <h1>Today</h1>
        <span style={{ width: '5rem' }} />
      </div>

      <section class="section stack" style={{ alignItems: 'stretch' }}>
        <p class="lead">Pick up to three, in the order you'll do them. Anything else can wait.</p>
        <Capture
          placeholder="Add something for today"
          onSaved={(task) => {
            setTasks((ts) => [task, ...(ts ?? [])]);
            if (picked.length < PLAN_LIMIT) save([...picked, task.id]);
          }}
        />
      </section>

      <section class="section">
        {tasks && tasks.length === 0 && <p class="note">Nothing in the inbox yet.</p>}
        {recent.length > 0 && <ul class="list">{recent.map(item)}</ul>}
        {older.length > 0 &&
          (showOlder ? (
            <ul class="list">{older.map(item)}</ul>
          ) : (
            <button class="quiet" onClick={() => setShowOlder(true)}>
              Show older tasks
            </button>
          ))}
      </section>

      <section class="section stack" style={{ marginTop: 'auto', paddingTop: '2rem' }}>
        {!current && first ? (
          <button class="primary big" disabled={busy} onClick={begin}>
            Start with “{first.title}”
          </button>
        ) : (
          <button class="primary" onClick={() => go('')}>
            {picked.length > 0 ? 'Done' : 'Skip for now'}
          </button>
        )}
        {error && <p class="note">{error}</p>}
      </section>
    </main>
  );
}

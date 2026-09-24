import { useEffect, useState } from 'preact/hooks';
import type { Task } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Capture } from '../components/Capture.tsx';
import { go } from '../hooks.ts';
import { splitByAge } from '../later.ts';

export function Inbox() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [planned, setPlanned] = useState<Set<number>>(new Set());
  const [showOlder, setShowOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.tasks(), api.plan()])
      .then(([all, plan]) => {
        setTasks(all);
        setPlanned(new Set(plan.map((t) => t.id)));
      })
      .catch(() => setError("Can't reach Anker right now."));
  }, []);

  const { recent, older } = splitByAge(tasks ?? [], planned);
  const item = (t: Task) => (
    <li key={t.id}>
      <button class="list-item" onClick={() => go(`#task/${t.id}`)}>
        <span>{t.title}</span>
        {t.status === 'current' ? (
          <span class="tag">current</span>
        ) : (
          planned.has(t.id) && <span class="tag">today</span>
        )}
      </button>
    </li>
  );

  return (
    <main class="screen">
      <div class="topbar">
        <button class="quiet" onClick={() => go('')}>
          ← Back
        </button>
        <h1>Inbox</h1>
        <span style={{ width: '5rem' }} />
      </div>

      <Capture
        placeholder="What's on your mind?"
        autoFocus
        onSaved={(task) => setTasks((t) => [task, ...(t ?? [])])}
      />

      <section class="section">
        {error && <p class="note">{error}</p>}
        {tasks && tasks.length === 0 && <p class="note">Nothing here yet.</p>}
        {recent.length > 0 && <ul class="list">{recent.map(item)}</ul>}
        {older.length > 0 &&
          (showOlder ? (
            <ul class="list">{older.map(item)}</ul>
          ) : (
            <button class="quiet" onClick={() => setShowOlder(true)}>
              Show older tasks
            </button>
          ))}
        {tasks && tasks.length > 0 && (
          <div class="stack" style={{ paddingTop: '1rem' }}>
            <button class="quiet" onClick={() => go('#plan')}>
              Plan today
            </button>
          </div>
        )}
      </section>

      <footer
        class="section"
        style={{ marginTop: 'auto', paddingTop: '2rem', textAlign: 'center' }}
      >
        <a class="button quiet" href="/api/export" download>
          Export backup (JSON)
        </a>
      </footer>
    </main>
  );
}

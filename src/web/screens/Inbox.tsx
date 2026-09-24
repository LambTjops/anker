import { useEffect, useState } from 'preact/hooks';
import type { Task } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Capture } from '../components/Capture.tsx';
import { go } from '../hooks.ts';

export function Inbox() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .tasks()
      .then(setTasks)
      .catch(() => setError("Can't reach Anker right now."));
  }, []);

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
        {tasks && tasks.length > 0 && (
          <ul class="list">
            {tasks.map((t) => (
              <li key={t.id}>
                <button class="list-item" onClick={() => go(`#task/${t.id}`)}>
                  <span>{t.title}</span>
                  {t.status === 'current' && <span class="tag">current</span>}
                </button>
              </li>
            ))}
          </ul>
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

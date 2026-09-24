import { useEffect, useState } from 'preact/hooks';
import type { AppState, Today } from '../../shared/api.ts';
import { api } from '../api.ts';
import { Capture } from '../components/Capture.tsx';
import { useAction } from '../hooks.ts';

/** Off-mode: the workday is over (or hasn't started). The Now screen stays hidden. */
export function Off({ state, refresh }: { state: AppState; refresh: () => Promise<void> }) {
  const [today, setToday] = useState<Today | null>(null);
  const { busy, error, run } = useAction();
  const ended = state.offReason === 'ended';

  useEffect(() => {
    if (!ended) return;
    api
      .today()
      .then(setToday)
      .catch(() => setToday(null));
  }, [ended, state.localDate]);

  const start = () =>
    run(async () => {
      await api.startWorkday();
      await refresh();
    });

  return (
    <main class="screen centred">
      {ended ? (
        <>
          <div class="stack">
            <h1 class="headline">That's the workday done.</h1>
            <p class="lead">It's okay to stop now. The rest of today is yours.</p>
          </div>

          {today && today.done.length > 0 && (
            <section class="stack" style={{ alignItems: 'stretch' }}>
              <h2 class="note">What got done today</h2>
              <ul class="done-list">
                {today.done.map((d) => (
                  <li key={d.stepId}>
                    {d.text}
                    <span class="from">{d.taskTitle}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <h1 class="headline">Ready when you are.</h1>
          <div class="stack">
            <button class="primary big" disabled={busy} onClick={start}>
              Start today
            </button>
          </div>
        </>
      )}

      <section class="stack" style={{ alignItems: 'stretch' }}>
        <Capture placeholder="Jot something down for later" />
      </section>

      {ended && (
        <div class="stack">
          <button class="quiet" disabled={busy} onClick={start}>
            Start a new day
          </button>
        </div>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

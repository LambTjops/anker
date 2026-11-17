import { api } from '../api.ts';
import { useAction } from '../hooks.ts';

/**
 * A quiet "End the day", offered when a task wraps up later in the day (the server decides
 * when: Settings → endDayAfter). It lands on the Off screen with today's done-list.
 */
export function EndDay({ refresh }: { refresh: () => Promise<void> }) {
  const { busy, error, run } = useAction();
  const end = () =>
    run(async () => {
      await api.endWorkday();
      await refresh();
    });
  return (
    <>
      <button class="quiet" disabled={busy} onClick={end}>
        End the day
      </button>
      {error && <p class="note">{error}</p>}
    </>
  );
}

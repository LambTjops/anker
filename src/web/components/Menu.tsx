import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { go, useAction } from '../hooks.ts';

/** The quiet ⋯ menu on the Now screen: everything that isn't the current step. */
export function Menu({ taskId, onEnded }: { taskId: number | null; onEnded: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  const endDay = () =>
    run(async () => {
      await api.endWorkday();
      close();
      onEnded();
    });

  return (
    <>
      <button class="icon quiet corner" aria-label="Menu" onClick={() => setOpen(true)}>
        ⋯
      </button>
      {open && (
        <div class="sheet-backdrop" onClick={close}>
          <div
            class="sheet fade-in"
            role="dialog"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            {confirming ? (
              <>
                <p class="lead" style={{ textAlign: 'center', margin: '0.5rem 0 1rem' }}>
                  End the workday?
                </p>
                <button class="primary" disabled={busy} onClick={endDay}>
                  Yes, I'm done for today
                </button>
                <button class="quiet" onClick={() => setConfirming(false)}>
                  Not yet
                </button>
                {error && <p class="note">{error}</p>}
              </>
            ) : (
              <>
                <button onClick={() => go('#inbox')}>Inbox</button>
                {taskId !== null && (
                  <button onClick={() => go(`#task/${taskId}`)}>Edit this task's steps</button>
                )}
                <button onClick={() => setConfirming(true)}>End workday</button>
                <button class="quiet" onClick={close}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

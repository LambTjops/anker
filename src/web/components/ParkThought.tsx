import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';

/**
 * Catch a stray thought mid-block without leaving the timer: it goes to the inbox and
 * you're straight back to the step.
 */
export function ParkThought({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(t);
  }, [note]);

  const save = async (e: Event) => {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setBusy(true);
    try {
      await api.createTask(title);
      setText('');
      onClose();
      setNote('Parked in your inbox. Back to it.');
    } catch {
      // Keep what was typed; nothing is lost.
      setNote("Can't reach Anker right now. Your note is still here.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return note ? <p class="note fade-in">{note}</p> : null;

  return (
    <form class="stack park" onSubmit={save}>
      <input
        type="text"
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        placeholder="What popped into your head?"
        autoFocus
        enterKeyHint="done"
        maxLength={500}
      />
      <div class="row">
        <button class="primary" type="submit" disabled={busy || !text.trim()}>
          Park it
        </button>
        <button class="quiet" type="button" onClick={() => onClose()}>
          Back to the step
        </button>
      </div>
      {note && <p class="note">{note}</p>}
    </form>
  );
}

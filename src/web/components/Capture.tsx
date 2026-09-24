import { useState } from 'preact/hooks';
import type { Task } from '../../shared/api.ts';
import { api } from '../api.ts';
import { useAction } from '../hooks.ts';

/** One text field; Enter saves to the inbox and clears. Typed text survives a failed save. */
export function Capture({
  placeholder,
  autoFocus = false,
  onSaved,
}: {
  placeholder: string;
  autoFocus?: boolean;
  onSaved?: (task: Task) => void;
}) {
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState(false);
  const { error, run } = useAction();

  const submit = (e: Event) => {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    // Clear straight away so the next thought can be typed while this one saves.
    setTitle('');
    void run(async () => {
      try {
        const task = await api.createTask(text);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        onSaved?.(task);
      } catch (err) {
        setTitle((current) => (current ? `${text} ${current}` : text));
        throw err;
      }
    });
  };

  return (
    <form onSubmit={submit} class="stack">
      <input
        type="text"
        value={title}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        aria-label={placeholder}
        maxLength={500}
      />
      {error ? <p class="note">{error}</p> : saved ? <p class="note fade-in">Saved.</p> : null}
    </form>
  );
}

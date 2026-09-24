import { useEffect, useState } from 'preact/hooks';
import type { Settings as SettingsT } from '../../shared/api.ts';
import { api } from '../api.ts';
import { go, useAction } from '../hooks.ts';

type NumberKey = Exclude<keyof SettingsT, 'headsUp'>;

const FIELDS: { key: NumberKey; label: string; min: number; max: number }[] = [
  { key: 'focusMinutes', label: 'Focus block (minutes)', min: 1, max: 180 },
  { key: 'breakMinutes', label: 'Break (minutes)', min: 1, max: 60 },
  { key: 'longBreakMinutes', label: 'Longer break (minutes)', min: 1, max: 120 },
  {
    key: 'longBreakEvery',
    label: 'Longer break after this many blocks (0 for never)',
    min: 0,
    max: 12,
  },
];

/** Timer lengths. Changes apply from the next block or break. */
export function Settings() {
  const [form, setForm] = useState<Record<NumberKey, string> | null>(null);
  const [headsUp, setHeadsUp] = useState(true);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();

  useEffect(() => {
    void run(async () => {
      const s = await api.settings();
      setForm({
        focusMinutes: String(s.focusMinutes),
        breakMinutes: String(s.breakMinutes),
        longBreakMinutes: String(s.longBreakMinutes),
        longBreakEvery: String(s.longBreakEvery),
      });
      setHeadsUp(s.headsUp);
    });
  }, [run]);

  const save = (e: Event) => {
    e.preventDefault();
    if (!form) return;
    setSaved(false);
    void run(async () => {
      await api.updateSettings({
        focusMinutes: Number(form.focusMinutes),
        breakMinutes: Number(form.breakMinutes),
        longBreakMinutes: Number(form.longBreakMinutes),
        longBreakEvery: Number(form.longBreakEvery),
        headsUp,
      });
      setSaved(true);
    });
  };

  return (
    <main class="screen">
      <div class="topbar">
        <button class="quiet" onClick={() => go('')}>
          ← Back
        </button>
        <h1>Timers</h1>
        <span style={{ width: '5rem' }} />
      </div>

      {form && (
        <form class="section stack" style={{ alignItems: 'stretch' }} onSubmit={save}>
          {FIELDS.map((f) => (
            <label class="field" key={f.key}>
              <span>{f.label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={1}
                required
                value={form[f.key]}
                onInput={(e) => {
                  setSaved(false);
                  setForm({ ...form, [f.key]: e.currentTarget.value });
                }}
              />
            </label>
          ))}
          <label class="check">
            <input
              type="checkbox"
              checked={headsUp}
              onChange={(e) => {
                setSaved(false);
                setHeadsUp(e.currentTarget.checked);
              }}
            />
            <span>Soft chime 2 minutes before a block or break ends</span>
          </label>
          <button class="primary" type="submit" disabled={busy}>
            Save
          </button>
          {saved && <p class="note fade-in">Saved. This applies from the next block or break.</p>}
        </form>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

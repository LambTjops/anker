import { useEffect, useState } from 'preact/hooks';
import type { FeatureKey, Settings as SettingsT } from '../../shared/api.ts';
import { api } from '../api.ts';
import { go, useAction } from '../hooks.ts';

type NumberKey = Exclude<keyof SettingsT, FeatureKey | 'focusRoomUrl' | 'focusMusicUrl'>;

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

/** Every optional feature gets a line here, so it can be turned off. */
const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'calmFocus', label: 'Hide the Focus buttons until you hover or tap' },
  { key: 'showClock', label: 'Clock under the timer' },
  { key: 'showEndTime', label: 'When the timer ends, under the timer' },
  { key: 'editEndTime', label: 'Tap the end time on Focus to change it' },
  { key: 'earlyBreak', label: 'Offer a break after an early Done' },
  { key: 'headsUp', label: 'Soft chime 2 minutes before a block or break ends' },
  { key: 'focusRoom', label: '"Join the room" on Focus, for body doubling' },
  { key: 'focusMusic', label: 'Focus music link on Focus' },
];

/** Timer lengths and on/off features. Changes apply from the next block or break. */
export function Settings() {
  const [form, setForm] = useState<Record<NumberKey, string> | null>(null);
  const [features, setFeatures] = useState<Record<FeatureKey, boolean> | null>(null);
  const [roomUrl, setRoomUrl] = useState('');
  const [musicUrl, setMusicUrl] = useState('');
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
      setFeatures({
        headsUp: s.headsUp,
        showClock: s.showClock,
        showEndTime: s.showEndTime,
        earlyBreak: s.earlyBreak,
        focusRoom: s.focusRoom,
        calmFocus: s.calmFocus,
        focusMusic: s.focusMusic,
        editEndTime: s.editEndTime,
      });
      setRoomUrl(s.focusRoomUrl);
      setMusicUrl(s.focusMusicUrl);
    });
  }, [run]);

  const save = (e: Event) => {
    e.preventDefault();
    if (!form || !features) return;
    setSaved(false);
    void run(async () => {
      await api.updateSettings({
        focusMinutes: Number(form.focusMinutes),
        breakMinutes: Number(form.breakMinutes),
        longBreakMinutes: Number(form.longBreakMinutes),
        longBreakEvery: Number(form.longBreakEvery),
        ...features,
        focusRoomUrl: roomUrl.trim(),
        focusMusicUrl: musicUrl.trim(),
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
        <h1>Settings</h1>
        <span style={{ width: '5rem' }} />
      </div>

      {form && features && (
        <form class="section stack" style={{ alignItems: 'stretch' }} onSubmit={save}>
          <h2>Timers</h2>
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
          <h2>Features</h2>
          {FEATURES.map((f) => (
            <label class="check" key={f.key}>
              <input
                type="checkbox"
                checked={features[f.key]}
                onChange={(e) => {
                  setSaved(false);
                  setFeatures({ ...features, [f.key]: e.currentTarget.checked });
                }}
              />
              <span>{f.label}</span>
            </label>
          ))}
          {features.focusRoom && (
            <label class="field">
              <span>Room link (e.g. a Discord voice channel)</span>
              <input
                type="url"
                inputMode="url"
                placeholder="https://discord.com/channels/…"
                pattern="https://.*"
                maxLength={500}
                value={roomUrl}
                onInput={(e) => {
                  setSaved(false);
                  setRoomUrl(e.currentTarget.value);
                }}
              />
            </label>
          )}
          {features.focusMusic && (
            <label class="field">
              <span>Music link (Endel, Brain.fm, a playlist…)</span>
              <input
                type="url"
                inputMode="url"
                placeholder="https://app.endel.io/player/focus"
                pattern="https://.*"
                maxLength={500}
                value={musicUrl}
                onInput={(e) => {
                  setSaved(false);
                  setMusicUrl(e.currentTarget.value);
                }}
              />
            </label>
          )}
          <button class="primary" type="submit" disabled={busy}>
            Save
          </button>
          {saved && <p class="note fade-in">Saved.</p>}
        </form>
      )}

      {error && <p class="note">{error}</p>}
    </main>
  );
}

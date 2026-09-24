// The end-of-timer signal (a block or a break): a soft chime, a short vibration, and a local notification
// when the tab isn't visible. No push server. Audio must be unlocked from a tap first.

let audio: AudioContext | null = null;

function prepareAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio: the notification and on-screen state still work.
  }
}

/** Call from a user gesture (the Start button) so the chime can play later. */
export function prepareSignal(): void {
  prepareAudio();
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

/** Sine notes as [frequency, delay in seconds]. */
function play(notes: [number, number][], volume: number, decay: number): void {
  if (!audio) return;
  const start = audio.currentTime + 0.05;
  for (const [freq, delay] of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = start + delay;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + decay + 0.1);
  }
}

// Two gentle notes, a fifth apart, with slow decays.
const chime = () =>
  play(
    [
      [659.25, 0],
      [987.77, 0.35],
    ],
    0.18,
    2.2,
  );

/** A single quiet note: "a couple of minutes left". Easier to land than a hard stop. */
export function softCue(): void {
  play([[587.33, 0]], 0.08, 1.6);
}

/** A short rising figure for Done. Called from the tap, so audio can start here too. */
export function doneSound(): void {
  prepareAudio();
  play(
    [
      [523.25, 0],
      [659.25, 0.09],
      [783.99, 0.18],
    ],
    0.12,
    0.9,
  );
}

async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag: 'anker-block', icon: '/icons/icon-192.png' };
  try {
    // Android Chrome only allows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // Best effort only.
  }
}

export function signalTimerEnd(title: string, body: string): void {
  chime();
  navigator.vibrate?.([120, 80, 120]);
  if (document.visibilityState !== 'visible') void notify(title, body);
}

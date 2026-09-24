// The end-of-block signal: a soft chime, a short vibration, and a local notification
// when the tab isn't visible. No push server. Audio must be unlocked from a tap first.

let audio: AudioContext | null = null;

/** Call from a user gesture (the Start button) so the chime can play later. */
export function prepareSignal(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio: the notification and on-screen state still work.
  }
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

function chime(): void {
  if (!audio) return;
  const start = audio.currentTime + 0.05;
  // Two gentle sine notes, a fifth apart, with slow decays.
  [
    [659.25, 0],
    [987.77, 0.35],
  ].forEach(([freq, delay]) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq!;
    const t = start + delay!;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 2.3);
  });
}

async function notify(body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, tag: 'anker-block', icon: '/icons/icon-192.png' };
  try {
    // Android Chrome only allows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Block finished', options);
    else new Notification('Block finished', options);
  } catch {
    // Best effort only.
  }
}

export function signalBlockEnd(stepText: string): void {
  chime();
  navigator.vibrate?.([120, 80, 120]);
  if (document.visibilityState !== 'visible') void notify(stepText);
}

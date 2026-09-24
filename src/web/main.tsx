import { render } from 'preact';
import { App } from './app.tsx';

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app works without it; it just won't install as a PWA.
    });
  });
}

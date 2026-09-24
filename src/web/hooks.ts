import { useCallback, useEffect, useState } from 'preact/hooks';
import { ApiFailure } from './api.ts';

export type Route =
  { name: 'main' } | { name: 'inbox' } | { name: 'settings' } | { name: 'task'; id: number };

function parseHash(hash: string): Route {
  if (hash === '#inbox') return { name: 'inbox' };
  if (hash === '#settings') return { name: 'settings' };
  const task = /^#task\/(\d+)$/.exec(hash);
  if (task) return { name: 'task', id: Number(task[1]) };
  return { name: 'main' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function go(hash: '' | '#inbox' | '#settings' | `#task/${number}`): void {
  if (hash === '') {
    // Drop the hash entirely so "/" stays clean.
    history.pushState(null, '', location.pathname);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

/** Runs an async action with a busy flag and a friendly error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Something went wrong. Try again?');
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

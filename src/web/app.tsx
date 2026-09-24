import { useCallback, useEffect, useState } from 'preact/hooks';
import type { AppState } from '../shared/api.ts';
import { api } from './api.ts';
import { Celebration } from './components/Celebration.tsx';
import { useRoute } from './hooks.ts';
import { Break } from './screens/Break.tsx';
import { Focus } from './screens/Focus.tsx';
import { Inbox } from './screens/Inbox.tsx';
import { Now } from './screens/Now.tsx';
import { Off } from './screens/Off.tsx';
import { Plan } from './screens/Plan.tsx';
import { Settings } from './screens/Settings.tsx';
import { Task } from './screens/Task.tsx';

export function App() {
  const route = useRoute();
  const [state, setState] = useState<AppState | null>(null);
  const [offline, setOffline] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // Re-sync whenever the app comes back into view: the server owns the truth.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (route.name === 'main') void refresh();
  }, [route.name, refresh]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const banner = offline && (
    <div class="banner" role="status">
      Can't reach Anker right now. Your data is safe on the server.
    </div>
  );

  let screen;
  if (route.name === 'inbox') screen = <Inbox />;
  else if (route.name === 'task') screen = <Task key={route.id} id={route.id} />;
  else if (route.name === 'settings') screen = <Settings />;
  else if (route.name === 'plan') screen = <Plan />;
  else if (!state) screen = <main class="screen" />;
  else if (state.mode === 'off') screen = <Off state={state} refresh={refresh} />;
  else if (state.block)
    screen = (
      <Focus
        key={state.block.id}
        block={state.block}
        taskId={state.currentTask?.id ?? null}
        taskTitle={state.currentTask?.title ?? null}
        headsUp={state.timers.headsUp}
        refresh={refresh}
      />
    );
  else if (state.break)
    screen = (
      <Break
        key={state.break.id}
        brk={state.break}
        headsUp={state.timers.headsUp}
        refresh={refresh}
        onOver={() => setFlash("Break's over.")}
      />
    );
  else screen = <Now state={state} flash={flash} refresh={refresh} />;

  return (
    <>
      {banner}
      {screen}
      <Celebration />
    </>
  );
}

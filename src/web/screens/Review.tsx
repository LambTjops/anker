import { useEffect, useState } from 'preact/hooks';
import type { Task as TaskT } from '../../shared/api.ts';
import { api } from '../api.ts';
import { go } from '../hooks.ts';
import { Task } from './Task.tsx';

/**
 * After Plan today: each planned task on the Task screen in turn, so a task with no steps
 * gets a concrete first one before the day starts. The last one starts the day.
 */
export function Review({ n }: { n: number }) {
  const [plan, setPlan] = useState<TaskT[] | null>(null);

  useEffect(() => {
    void api.plan().then(setPlan, () => go('#plan'));
  }, []);

  const task = plan?.[n - 1];
  useEffect(() => {
    if (plan && !task) go('#plan');
  }, [plan, task]);

  if (!plan || !task) return <main class="screen" />;

  const last = n >= plan.length;
  // Start with the current task if it's on the plan, otherwise with the first one.
  const start = plan.find((t) => t.status === 'current') ?? plan[0]!;
  const onNext = async () => {
    if (!last) return go(`#review/${n + 1}`);
    if (start.status !== 'current') await api.makeCurrent(start.id);
    go('');
  };

  return (
    <Task
      key={task.id}
      id={task.id}
      review={{
        n,
        total: plan.length,
        nextLabel: last ? `Start with “${start.title}”` : 'Next',
        onNext,
      }}
    />
  );
}

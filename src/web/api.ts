// Typed client for the JSON API. The UI talks to the server only through this.
import type {
  ApiError,
  AppState,
  Block,
  BlockOutcome,
  Break,
  FinishResult,
  Settings,
  Step,
  Task,
  TaskStatus,
  Today,
  Workday,
} from '../shared/api.ts';

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Server clock minus local clock, in ms. Timers render against server time. */
let clockOffset = 0;

export function serverNow(): number {
  return Date.now() + clockOffset;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, 'offline', "Can't reach Anker right now");
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiFailure(res.status, err?.code ?? 'unknown', err?.message ?? res.statusText);
  }
  return data as T;
}

export const api = {
  async state(): Promise<AppState> {
    const sentAt = Date.now();
    const state = await request<AppState>('GET', '/api/state');
    // Assume the server stamped its time halfway through the round trip.
    clockOffset = new Date(state.serverNow).getTime() - (sentAt + Date.now()) / 2;
    return state;
  },
  today: () => request<Today>('GET', '/api/today'),
  startWorkday: () => request<Workday>('POST', '/api/workday/start'),
  endWorkday: () => request<Today>('POST', '/api/workday/end'),

  tasks: (statuses: TaskStatus[] = ['inbox', 'current']) =>
    request<Task[]>('GET', `/api/tasks?status=${statuses.join(',')}`),
  task: (id: number) => request<Task>('GET', `/api/tasks/${id}`),
  createTask: (title: string) => request<Task>('POST', '/api/tasks', { title }),
  updateTask: (
    id: number,
    patch: { title?: string; notes?: string; status?: 'inbox' | 'done' | 'dropped' },
  ) => request<Task>('PATCH', `/api/tasks/${id}`, patch),
  deleteTask: (id: number) => request<void>('DELETE', `/api/tasks/${id}`),
  makeCurrent: (id: number) => request<Task>('POST', `/api/tasks/${id}/current`),

  steps: (taskId: number) => request<Step[]>('GET', `/api/tasks/${taskId}/steps`),
  addSteps: (taskId: number, texts: string[]) =>
    request<Step[]>('POST', `/api/tasks/${taskId}/steps`, { texts }),
  addStepBefore: (taskId: number, text: string, beforeStepId: number) =>
    request<Step[]>('POST', `/api/tasks/${taskId}/steps`, { text, beforeStepId }),
  updateStep: (id: number, patch: { text?: string; status?: 'todo' | 'done'; position?: number }) =>
    request<Step>('PATCH', `/api/steps/${id}`, patch),
  deleteStep: (id: number) => request<void>('DELETE', `/api/steps/${id}`),

  startBlock: () => request<Block>('POST', '/api/blocks'),
  finishBlock: (id: number, outcome: BlockOutcome) =>
    request<FinishResult>('POST', `/api/blocks/${id}/finish`, { outcome }),
  extendBlock: (id: number) => request<Block>('POST', `/api/blocks/${id}/extend`),

  extendBreak: (id: number) => request<Break>('POST', `/api/breaks/${id}/extend`),
  endBreak: (id: number) => request<void>('POST', `/api/breaks/${id}/end`),

  settings: () => request<Settings>('GET', '/api/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('PATCH', '/api/settings', patch),
};

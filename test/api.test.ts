import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AppState,
  Block,
  Break,
  FinishResult,
  Settings,
  Status,
  Step,
  Task,
  Today,
} from '../src/shared/api.ts';
import { buildApp } from '../src/server/app.ts';
import type { Config } from '../src/server/config.ts';
import { openDb, type Db } from '../src/server/db/db.ts';

const config: Config = {
  port: 0,
  host: '127.0.0.1',
  dataDir: '',
  tz: 'Pacific/Auckland',
  cutoff: '04:00',
  focusSeconds: 25 * 60,
};

let db: Db;
let app: FastifyInstance;
let clock: Date;

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: object) {
  const res = await app.inject({ method, url, payload: body });
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
}

beforeEach(async () => {
  clock = new Date('2026-09-24T21:00:00.000Z'); // 09:00 NZST, Fri 25 Sep
  db = openDb(':memory:');
  app = await buildApp({ db, config, now: () => clock });
});

afterEach(async () => {
  await app.close();
  db.close();
});

async function setUpCurrentTask(steps: string[]): Promise<Task> {
  const { body: task } = await call<Task>('POST', '/api/tasks', { title: 'Write report' });
  await call('POST', `/api/tasks/${task.id}/steps`, { texts: steps });
  await call('POST', `/api/tasks/${task.id}/current`);
  return task;
}

describe('the core loop', () => {
  it('shows only the first open step and advances on done', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['Open the doc', 'Write the first heading', 'Write one sentence']);

    let { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.mode).toBe('on');
    expect(state.currentStep?.text).toBe('Open the doc');
    expect(JSON.stringify(state)).not.toContain('Write the first heading');

    const { body: block } = await call<Block>('POST', '/api/blocks');
    expect(block.endsAt).toBe('2026-09-24T21:25:00.000Z');
    advance(25);
    await call('POST', `/api/blocks/${block.id}/finish`, { outcome: 'done' });

    ({ body: state } = await call<AppState>('GET', '/api/state'));
    expect(state.currentStep?.text).toBe('Write the first heading');
    expect(state.block).toBeNull();
  });

  it('keep going opens a fresh block on the same step', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['Open the doc']);
    const { body: first } = await call<Block>('POST', '/api/blocks');
    advance(26);
    const { body } = await call<{ next: Block }>('POST', `/api/blocks/${first.id}/finish`, {
      outcome: 'keep_going',
    });
    expect(body.next.stepId).toBe(first.stepId);
    expect(body.next.startedAt).toBe(clock.toISOString());
  });

  it('stuck: a smaller first move goes in front of the current step', async () => {
    await call('POST', '/api/workday/start');
    const task = await setUpCurrentTask(['Write the intro', 'Write the summary']);
    const { body: state } = await call<AppState>('GET', '/api/state');
    const stuckId = state.currentStep!.id;
    await call('POST', `/api/tasks/${task.id}/steps`, {
      text: 'Open the doc and type one sentence',
      beforeStepId: stuckId,
    });
    const { body: after } = await call<AppState>('GET', '/api/state');
    expect(after.currentStep?.text).toBe('Open the doc and type one sentence');
    const { body: steps } = await call<Step[]>('GET', `/api/tasks/${task.id}/steps`);
    expect(steps.map((s) => s.text)).toEqual([
      'Open the doc and type one sentence',
      'Write the intro',
      'Write the summary',
    ]);
    expect(steps[0]!.parentStepId).toBe(stuckId);
  });

  it('refuses to start a block with no open workday', async () => {
    await setUpCurrentTask(['Open the doc']);
    const res = await call<{ error: { code: string } }>('POST', '/api/blocks');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('workday_not_started');
  });

  it('reorders steps', async () => {
    const task = await setUpCurrentTask(['A', 'B', 'C']);
    const { body: steps } = await call<Step[]>('GET', `/api/tasks/${task.id}/steps`);
    await call('PATCH', `/api/steps/${steps[2]!.id}`, { position: 0 });
    const { body: after } = await call<Step[]>('GET', `/api/tasks/${task.id}/steps`);
    expect(after.map((s) => s.text)).toEqual(['C', 'A', 'B']);
  });
});

describe('breaks and timers', () => {
  async function runBlock(outcome: 'done' | 'stuck' | 'keep_going', minutes = 25) {
    const { body: state } = await call<AppState>('GET', '/api/state');
    const block = state.block ?? (await call<Block>('POST', '/api/blocks')).body;
    advance(minutes);
    return (await call<FinishResult>('POST', `/api/blocks/${block.id}/finish`, { outcome })).body;
  }

  it('done at time up starts a short break, which ends by itself', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A', 'B']);
    const result = await runBlock('done');
    expect(result.break?.kind).toBe('short');
    expect(result.break?.endsAt).toBe(new Date(clock.getTime() + 5 * 60_000).toISOString());

    let { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.break?.id).toBe(result.break?.id);
    advance(5);
    ({ body: state } = await call<AppState>('GET', '/api/state'));
    expect(state.break).toBeNull();
    expect(state.currentStep?.text).toBe('B');
    expect(state.block).toBeNull();
  });

  it('stopping early or keeping going does not start a break', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A', 'B']);
    expect((await runBlock('keep_going')).break).toBeNull();
    expect((await runBlock('done', 10)).break).toBeNull();
  });

  it('every fourth block earns a longer break', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A', 'B', 'C', 'D', 'E', 'F']);
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { break: brk } = await runBlock('done');
      kinds.push(brk!.kind);
      await call('POST', `/api/breaks/${brk!.id}/end`);
    }
    expect(kinds).toEqual(['short', 'short', 'short', 'long', 'short']);
  });

  it('keep going blocks count towards the longer break', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A']);
    await runBlock('keep_going');
    await runBlock('keep_going');
    await runBlock('keep_going');
    expect((await runBlock('done')).break?.kind).toBe('long');
  });

  it('+5 min extends a running block and a running break, but not a finished one', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A', 'B']);
    const { body: block } = await call<Block>('POST', '/api/blocks');
    advance(20);
    const { body: longer } = await call<Block>('POST', `/api/blocks/${block.id}/extend`);
    expect(longer.plannedSeconds).toBe(30 * 60);
    advance(10);
    const late = await call<{ error: { code: string } }>('POST', `/api/blocks/${block.id}/extend`);
    expect(late.status).toBe(409);

    const { body: result } = await call<FinishResult>('POST', `/api/blocks/${block.id}/finish`, {
      outcome: 'done',
    });
    const { body: brk } = await call<Break>('POST', `/api/breaks/${result.break!.id}/extend`);
    expect(brk.plannedSeconds).toBe(10 * 60);
  });

  it('skipping a break or starting a block ends it', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A', 'B', 'C']);
    const first = await runBlock('done');
    expect((await call('POST', `/api/breaks/${first.break!.id}/end`)).status).toBe(204);
    expect((await call<AppState>('GET', '/api/state')).body.break).toBeNull();

    await runBlock('done');
    await call('POST', '/api/blocks');
    const { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.break).toBeNull();
    expect(state.block).not.toBeNull();
  });

  it('settings change the next block and break lengths', async () => {
    const { body: before } = await call<Settings>('GET', '/api/settings');
    expect(before).toEqual({
      focusMinutes: 25,
      breakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
    });
    await call('PATCH', '/api/settings', { focusMinutes: 50, breakMinutes: 10 });
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A']);
    const { body: block } = await call<Block>('POST', '/api/blocks');
    expect(block.plannedSeconds).toBe(50 * 60);
    advance(50);
    const { body } = await call<FinishResult>('POST', `/api/blocks/${block.id}/finish`, {
      outcome: 'stuck',
    });
    expect(body.break?.plannedSeconds).toBe(10 * 60);

    const bad = await call('PATCH', '/api/settings', { focusMinutes: 0 });
    expect(bad.status).toBe(400);
  });

  it('ending the workday closes a running break', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['A']);
    await runBlock('done');
    advance(2);
    await call('POST', '/api/workday/end');
    const { body } = await call<{ breaks: { ended_at: string }[] }>('GET', '/api/export');
    expect(body.breaks[0]!.ended_at).toBe(clock.toISOString());
  });
});

describe('ending the day', () => {
  it('manual end switches to off-mode and lists what got done', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['Open the doc', 'Write the heading']);
    const { body: block } = await call<Block>('POST', '/api/blocks');
    advance(10);
    await call('POST', `/api/blocks/${block.id}/finish`, { outcome: 'done' });

    const { body: today } = await call<Today>('POST', '/api/workday/end');
    expect(today.done.map((d) => d.text)).toEqual(['Open the doc']);

    const { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.mode).toBe('off');
    expect(state.offReason).toBe('ended');

    const { body: status } = await call<Status>('GET', '/api/status');
    expect(status).toMatchObject({
      workdayStarted: true,
      workdayEnded: true,
      stepsCompleted: 1,
      focusMinutes: 10,
      activeBlock: null,
    });
  });

  it('auto-closes a forgotten workday at the cutoff, quietly', async () => {
    await call('POST', '/api/workday/start');
    await setUpCurrentTask(['Open the doc']);
    await call('POST', '/api/blocks'); // left running
    clock = new Date('2026-09-25T17:00:00.000Z'); // 05:00 NZST next morning

    const { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.mode).toBe('off');
    expect(state.offReason).toBe('not_started');
    expect(state.block).toBeNull();

    const blocks = db.prepare('SELECT outcome, ended_at FROM focus_blocks').all();
    expect(blocks).toEqual([{ outcome: 'abandoned', ended_at: '2026-09-24T21:25:00.000Z' }]);
    const wd = db.prepare('SELECT ended_at, end_reason FROM workdays').get();
    expect(wd).toEqual({ ended_at: '2026-09-25T16:00:00.000Z', end_reason: 'auto' });
  });

  it('keeps a late-night workday open until the cutoff', async () => {
    clock = new Date('2026-09-25T11:00:00.000Z'); // 23:00 NZST
    await call('POST', '/api/workday/start');
    clock = new Date('2026-09-25T15:30:00.000Z'); // 03:30 — still the same logical day
    const { body: state } = await call<AppState>('GET', '/api/state');
    expect(state.mode).toBe('on');
  });
});

describe('api hygiene', () => {
  it('validates input', async () => {
    const res = await call<{ error: { code: string } }>('POST', '/api/tasks', { title: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('returns JSON 404s under /api', async () => {
    const res = await call<{ error: { code: string } }>('GET', '/api/tasks/999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('exports everything', async () => {
    await setUpCurrentTask(['A']);
    const { body } = await call<Record<string, unknown[]>>('GET', '/api/export');
    expect(body.tasks).toHaveLength(1);
    expect(body.steps).toHaveLength(1);
  });
});

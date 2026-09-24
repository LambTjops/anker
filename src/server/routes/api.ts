import type { FastifyInstance } from 'fastify';
import {
  CreateStepsBody,
  CreateTaskBody,
  FinishBlockBody,
  IdParams,
  ListTasksQuery,
  UpdateStepBody,
  UpdateTaskBody,
  type AppState,
  type Today,
} from '../../shared/api.ts';
import { logicalDate, mostRecentCutoff } from '../../shared/time.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as q from '../db/queries.ts';

export interface ApiDeps {
  db: Db;
  config: Config;
  now: () => Date;
}

export function registerApi(app: FastifyInstance, { db, config, now }: ApiDeps): void {
  const day = { tz: config.tz, cutoff: config.cutoff };

  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/')) q.autoClose(db, now(), day);
  });

  const today = (at: Date): Today => ({
    localDate: logicalDate(at, day.tz, day.cutoff),
    done: q.doneSince(db, mostRecentCutoff(at, day.tz, day.cutoff)),
  });

  app.get('/api/healthz', async () => ({ ok: true }));

  app.get('/api/state', async (): Promise<AppState> => {
    const at = now();
    const localDate = logicalDate(at, day.tz, day.cutoff);
    const open = q.openWorkday(db);
    const latest = q.latestWorkdayFor(db, localDate);
    const { task, step } = q.currentTaskAndStep(db);
    return {
      serverNow: at.toISOString(),
      localDate,
      mode: open ? 'on' : 'off',
      offReason: open ? null : latest?.endReason === 'manual' ? 'ended' : 'not_started',
      currentTask: task,
      currentStep: step,
      block: q.openBlock(db),
    };
  });

  app.get('/api/today', async () => today(now()));

  app.get('/api/status', async () => q.status(db, now(), day));

  app.post('/api/workday/start', async () => q.startWorkday(db, now(), day));

  app.post('/api/workday/end', async () => {
    const at = now();
    q.endWorkday(db, at, 'manual');
    return today(at);
  });

  // ---- Tasks ----

  app.get('/api/tasks', async (req) => {
    const { status } = ListTasksQuery.parse(req.query);
    return q.listTasks(db, status);
  });

  app.post('/api/tasks', async (req, reply) => {
    const { title } = CreateTaskBody.parse(req.body);
    return reply.code(201).send(q.createTask(db, title, now()));
  });

  app.get('/api/tasks/:id', async (req) => q.getTask(db, IdParams.parse(req.params).id));

  app.patch('/api/tasks/:id', async (req) =>
    q.updateTask(db, IdParams.parse(req.params).id, UpdateTaskBody.parse(req.body), now()),
  );

  app.delete('/api/tasks/:id', async (req, reply) => {
    q.deleteTask(db, IdParams.parse(req.params).id);
    return reply.code(204).send();
  });

  app.post('/api/tasks/:id/current', async (req) =>
    q.makeCurrent(db, IdParams.parse(req.params).id),
  );

  // ---- Steps ----

  app.get('/api/tasks/:id/steps', async (req) => q.listSteps(db, IdParams.parse(req.params).id));

  app.post('/api/tasks/:id/steps', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = CreateStepsBody.parse(req.body);
    const steps =
      'texts' in body
        ? q.addSteps(db, id, body.texts, now())
        : q.addSteps(db, id, [body.text], now(), body.beforeStepId);
    return reply.code(201).send(steps);
  });

  app.patch('/api/steps/:id', async (req) =>
    q.updateStep(db, IdParams.parse(req.params).id, UpdateStepBody.parse(req.body), now()),
  );

  app.delete('/api/steps/:id', async (req, reply) => {
    q.deleteStep(db, IdParams.parse(req.params).id);
    return reply.code(204).send();
  });

  // ---- Focus blocks ----

  app.post('/api/blocks', async (req, reply) =>
    reply.code(201).send(q.startBlock(db, now(), config.focusSeconds)),
  );

  app.post('/api/blocks/:id/finish', async (req) => {
    const { id } = IdParams.parse(req.params);
    const { outcome } = FinishBlockBody.parse(req.body);
    return q.finishBlock(db, id, outcome, now(), config.focusSeconds);
  });

  // ---- Backup ----

  app.get('/api/export', async (_req, reply) => {
    const at = now();
    const name = `anker-export-${logicalDate(at, day.tz, day.cutoff)}.json`;
    return reply
      .header('content-disposition', `attachment; filename="${name}"`)
      .send(q.exportAll(db, at));
  });
}

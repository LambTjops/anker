import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import type { ApiError } from '../shared/api.ts';
import { AppError } from './errors.ts';
import { registerApi, type ApiDeps } from './routes/api.ts';

export interface AppOptions extends ApiDeps {
  /** Built frontend to serve. Omitted in tests and when running the Vite dev server. */
  staticDir?: string;
  logger?: boolean;
}

const errorBody = (code: string, message: string): ApiError => ({ error: { code, message } });

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
      return reply.code(400).send(errorBody('invalid_request', message.join('; ')));
    }
    if (err instanceof AppError) {
      return reply.code(err.status).send(errorBody(err.code, err.message));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('bad_request', (err as Error).message));
    }
    req.log.error(err);
    return reply.code(500).send(errorBody('internal', 'Something went wrong'));
  });

  registerApi(app, opts);

  const { staticDir } = opts;
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, {
      root: staticDir,
      setHeaders(res, path) {
        // Vite's hashed assets never change; everything else must be revalidated.
        res.header(
          'cache-control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/api/') && req.method === 'GET' && staticDir) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send(errorBody('not_found', 'Not found'));
  });

  return app;
}

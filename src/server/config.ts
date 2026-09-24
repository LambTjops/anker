import { z } from 'zod';
import { isValidTimeZone } from '../shared/time.ts';

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().default('./data'),
  TZ_DISPLAY: z.string().refine(isValidTimeZone, 'Unknown time zone').default('Pacific/Auckland'),
  DAY_CUTOFF: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
    .default('04:00'),
  FOCUS_MINUTES: z.coerce.number().int().min(1).max(180).default(25),
});

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  tz: string;
  cutoff: string;
  focusSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  return {
    port: e.PORT,
    host: e.HOST,
    dataDir: e.DATA_DIR,
    tz: e.TZ_DISPLAY,
    cutoff: e.DAY_CUTOFF,
    focusSeconds: e.FOCUS_MINUTES * 60,
  };
}

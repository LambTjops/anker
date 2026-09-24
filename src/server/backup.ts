// Writes a consistent SQLite backup plus a JSON export to <DATA_DIR>/backups/,
// keeping the newest KEEP of each. Run with `pnpm backup`
// (in production: `docker compose exec anker pnpm backup`).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { openDb } from './db/db.ts';
import { exportAll } from './db/queries.ts';

const KEEP = 14;

const config = loadConfig();
const dir = join(config.dataDir, 'backups');
mkdirSync(dir, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const db = openDb(join(config.dataDir, 'anker.db'));

await db.backup(join(dir, `anker-${stamp}.db`));
writeFileSync(join(dir, `anker-${stamp}.json`), JSON.stringify(exportAll(db, now), null, 2));
db.close();

for (const ext of ['.db', '.json']) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('anker-') && f.endsWith(ext))
    .sort()
    .reverse();
  for (const old of files.slice(KEEP)) rmSync(join(dir, old));
}

console.log(`Backup written to ${dir}/anker-${stamp}.{db,json}`);

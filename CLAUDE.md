# CLAUDE.md — Working agreement for Anker

@BRIEF.md is the source of truth for product and architecture decisions. If a request conflicts with it, say so and ask. Don't silently diverge.

---

## Prime directives

1. **One step on the Now screen. Always.** No API response used by the Now or Focus screens may carry more than the current step. Step lists appear only on the Task screen.
2. **No guilt.** Don't use red, badges, streaks, "overdue", "missed", "you forgot", or counts of what didn't happen. When in doubt, show less.
3. **The API is the product.** The UI uses only the public JSON API in BRIEF §6. There are no UI-only shortcuts, because a future Android client must be able to do everything.
4. **The server owns time.** Timers and workday state are derived from server timestamps. The client only renders `endsAt - server_now`, adjusted for clock offset.
5. **Spend is capped, always.** No Claude call bypasses `checkSpend()` and `logUsage()`. The API key never reaches the client, the logs or `/api/export`.
6. **Work in phases.** Build the current phase only. Stop at the end of each phase for the owner to test. Don't build Phase 2 (or anything in BRIEF §10) early.
7. **Serve the purpose.** Anker exists to help its ADHD owner focus, beat procrastination and get things done. Every feature must remove a decision or a tap, or break the procrastination loop. No bloat. `docs/ROADMAP.md` holds the proposed next phases, the anti-bloat rules and the decisions waiting on the owner. Nothing in it is approved until it moves into BRIEF.md.

---

## Stack and conventions

|                 |                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Runtime         | Node 24.21.0 (`.nvmrc`, `engines`). The server runs `.ts` directly via Node's type stripping |
| Package manager | pnpm 12.5.1, single package                                                                  |
| Language        | TypeScript 6.0.3, `strict`, `erasableSyntaxOnly` (no enums/namespaces/parameter properties)  |
| Server          | Fastify 5.12.5, @fastify/static 10.1.4                                                       |
| DB              | better-sqlite3 13.0.3                                                                        |
| Validation      | Zod 4.6.5                                                                                    |
| Frontend        | Preact 10.29.8, Vite 8.3.0, @preact/preset-vite 2.10.6                                       |
| Tests           | Vitest 5.0.1                                                                                 |
| Lint/format     | ESLint 10.11.0, typescript-eslint 8.70.0, Prettier 3.9.8                                     |

Relative imports use explicit `.ts`/`.tsx` extensions (required for Node type stripping).

Pin exact versions (no `^`) when you first install a dependency, and record them here. **Every new runtime dependency needs a one-line justification in the PR or commit.** The default answer is "write the 20 lines instead".

### Layout

```
src/shared/     Zod schemas + inferred types used by server and web
src/server/     Fastify app, routes/, domain/, db/, coach/ (Phase 2)
src/web/        Preact app: screens/, components/, api.ts, styles.css
migrations/     001_init.sql, 002_… (append-only)
prompts/        coach.md (Phase 2 system prompt)
docs/           ROADMAP.md (proposals, not yet approved)
docker/         Dockerfile, anker.subdomain.conf
```

- No barrel files (`index.ts` re-export hubs).
- Domain logic (`src/server/domain/`) consists of pure functions that take `now` as an argument. Routes do I/O and call domain functions. This keeps the cutoff, timer and spend logic testable.
- Routes validate input with the shared Zod schemas. Response shapes are the shared TypeScript types in `src/shared/api.ts`; mapping from rows happens in `queries.ts`.

### Database

- Every schema change is a new numbered migration file. Never edit an applied migration.
- Migrations run automatically on startup, inside a transaction.
- Timestamps are UTC ISO-8601 strings. Local dates are `YYYY-MM-DD` in `TZ_DISPLAY`.
- SQL lives in `src/server/db/queries.ts`, not in route handlers.

### Time

- Use exactly one helper module, `src/shared/time.ts`, for local-date and cutoff maths (built on `Intl`, with no date library unless it earns its place).
- Never call `new Date()` on a bare, zone-less string.
- Tests must cover the NZ DST transitions (last Sunday of September, first Sunday of April) against the 04:00 cutoff.

### Frontend

- Mobile-first CSS that also stays calm and centred on a laptop (max width about 36rem).
- Dark is the default; light only when the system prefers it. Colours are CSS custom properties. Tap targets are at least 48px.
- Copy is short, warm and plain. Write "Start", not "Let's crush it!". Sentence case.
- The service worker caches the app shell only. It never caches `/api/*`.
- If the server can't be reached, show a quiet "Can't reach Anker right now" state and never lose typed input.

### Coach (Phase 2)

- The system prompt lives in `prompts/coach.md`. Don't inline prompt text in code.
- Model output must pass the Zod schema. On a parse failure, retry once and then fall back to the manual prompt.
- Keep the model ID and prices in config (`CLAUDE_MODEL`, `pricing.ts`), not scattered through the code.

---

## Commands

`pnpm dev` (API + Vite), `pnpm build`, `pnpm test`, `pnpm check` (lint + format + typecheck + test), `pnpm backup`. In the container: `node src/server/backup.ts`.

`pnpm check` must pass before any phase is declared done.

## Shipping changes to prod

After any change, ship it all the way to prod: run `pnpm check`, then commit, then push to `origin` (github.com/LambTjops/anker), then update prod:

```sh
cd /docker/anker && git pull
cd /docker && docker compose up -d --build anker
```

Prod is the `anker` service in the host's main `/docker/docker-compose.yml` (network `onsnet`), not this repo's `compose.yaml`. It's live at https://anker.onsnet.nz. The live SWAG conf (`/docker/swag/config/nginx/proxy-confs/anker.subdomain.conf`) has basic auth **temporarily turned off** for testing. Don't turn it back on unless the owner asks.

## Brand

The user-facing name is always **Anker**. In code, env and URLs it is lowercase `anker`.

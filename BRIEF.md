# Anker — Project Brief

> **Status:** Phase 1 and 1b (breaks) built, in owner testing. Source of truth for product and architecture decisions.
> **Owner:** Nico
> **Last updated:** 2026-09-25

---

## 1. What this is

A single-user web app that shows **one step at a time**, runs a 25-minute focus block on it, and gives a clear **"workday is over"** moment so evenings are guilt-free.

Phase 2 adds a **breakdown coach** (Claude API) that turns vague tasks into 5–15 minute, verb-first steps and shrinks a step further when you're stuck.

**Done means:** on my phone or laptop I can capture a task, get it broken down, run a 25-minute block on the first step, mark it done or stuck, and end my workday, without ever seeing more than one step on the Now screen.

**Non-goals (MVP):** multi-user, in-app auth, push notifications, calendar sync, analytics dashboards, gamification, recurring tasks, projects/tags, side-task time caps (parked; see §10).

---

## 2. Decisions locked

| Decision          | Choice                                                                                 | Notes                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary device    | Laptop browser first, phone PWA second                                                 | Layout is mobile-first but must feel calm on a wide screen too.                                                                                                               |
| Access protection | **HTTP basic auth in SWAG**                                                            | The container publishes no port. It sits on SWAG's Docker network, so SWAG is the only way in (§8). **Turned off in prod for testing (2026-09-25); revisit before real use.** |
| Phase 1 steps     | **Typed up front per task**                                                            | Planning happens on the Task screen, where the list is visible. The Now screen only ever shows the first open step.                                                           |
| Timer end signal  | Chime, plus a local browser notification if allowed, plus a countdown in the tab title | Not Web Push. If the tab is closed or the phone is locked, the Done/Stuck/Keep going choice is waiting on return.                                                             |
| Day boundary      | **Auto-close quietly at 04:00** (configurable)                                         | An open workday is closed at the cutoff with `end_reason='auto'`. No "you forgot" copy, ever.                                                                                 |
| Language          | English                                                                                | UI and coach.                                                                                                                                                                 |
| Time zone         | `Pacific/Auckland` (env `TZ_DISPLAY`)                                                  | DB stores UTC.                                                                                                                                                                |

---

## 3. Stack

Boring, small, same toolchain as Couchside. Versions are pinned at scaffold time and recorded in `CLAUDE.md`.

|                  |                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | Node 24 LTS, TypeScript (strict), pnpm, **single package** (no workspaces)                                                                    |
| Server           | Fastify + `@fastify/static` (serves the built frontend and `/api`)                                                                            |
| DB               | SQLite via `better-sqlite3` (synchronous, no ORM). Plain numbered `.sql` migrations                                                           |
| Validation       | Zod at every API boundary. Schemas are shared by server and client                                                                            |
| Frontend         | Preact + Vite, plain CSS with custom properties. No router library: the screen is derived from server state, plus `#inbox`/`#task/:id` hashes |
| PWA              | `manifest.webmanifest` plus a tiny hand-written service worker that caches the app shell only. The API is always network-only                 |
| Claude (Phase 2) | `@anthropic-ai/sdk`, structured outputs (`output_config.format`)                                                                              |
| Tests            | Vitest for domain logic (day cutoff, timer maths, DST, spend cap)                                                                             |

---

## 4. Data model

All timestamps are UTC ISO strings. `local_date` is the workday's date in `TZ_DISPLAY`.

```
tasks        id, title, notes, status ('inbox'|'current'|'done'|'dropped'),
             created_at, completed_at
steps        id, task_id, text, position, status ('todo'|'done'|'replaced'),
             parent_step_id (set when a step is shrunk in Phase 2),
             source ('manual'|'coach'), created_at, done_at
workdays     id, local_date, started_at, ended_at, end_reason ('manual'|'auto')
focus_blocks id, step_id, workday_id, started_at, planned_seconds (1500),
             ended_at, outcome ('done'|'stuck'|'keep_going'|'abandoned')
breaks       id, workday_id, after_block_id, kind ('short'|'long'), started_at,
             planned_seconds, ended_at                                  (Phase 1b)
settings     single row: focus_minutes, break_minutes, long_break_minutes,
             long_break_every (0 = never)                               (Phase 1b)
```

- At most one task has `status='current'`. The **current step** is its lowest-`position` step with status `todo`.
- At most one focus block is open (`ended_at IS NULL`). The remaining time is always computed from `started_at`, so it survives a refresh, a closed tab or a locked phone.
- **Keep going** closes the block as `keep_going` and immediately opens a new one on the same step.
- **Auto-close** runs lazily at the start of every request, so no cron is needed: if an open workday started before the most recent cutoff, close it at the cutoff and abandon any open block or break.
- **Breaks (Phase 1b):** picking **Done** or **Stuck** once a block's time is up starts a break on the server. Keep going and stopping early don't. Once `long_break_every` blocks (default 4) have run since the last long break, the break is long. A break that runs out is closed lazily on the next request. Starting a block ends any break. Nothing ever starts a block automatically.
- **+5 min** adds 300 seconds to `planned_seconds` of the running block or break. It only works while that timer is still counting down.
- **Settings** default to 25 / 5 / 15 minutes and every 4 blocks (`FOCUS_MINUTES` seeds the first). Changes apply from the next block or break.

**Phase 2 additions**

```
coach_sessions id, kind ('breakdown'|'shrink'), task_id, step_id,
               messages (JSON), questions_asked, status ('open'|'accepted'|'abandoned'),
               created_at
api_usage      id, at, coach_session_id, model, input_tokens, output_tokens,
               cache_read_tokens, cache_write_tokens, cost_usd_micros
```

---

## 5. Screens

The Now screen shows one thing. Everything else is one quiet tap away, behind a small `⋯` menu (Inbox, Timer settings, End workday).

1. **Now**: the current step in large type and a **Start** button. Nothing else.
   - No current task: "Nothing picked yet" and a link to the Inbox.
   - Task has no open steps: "That task is clear", with "Add a step" and "Mark task done".
2. **Focus**: the step text and a calm countdown. "Stop early" is small and low-contrast. When time is up: **Done** / **Stuck** / **Keep going**.
   - In Phase 1, **Stuck** asks "What's a smaller first move?" and inserts what you type _in front of_ the stuck step (`parent_step_id` points at it). The stuck step comes back once the small move is done. In Phase 2 the coach takes this over.
   - **Stop early** offers Done / Stuck / Stop for now / Back to the timer.
   - A quiet **+5 min** sits under the countdown while it runs.
   - **Break** (Phase 1b): after Done or Stuck at time's up, "Take a break." (or "Time for a longer break.") with a countdown, **+5 min** and **Skip break**. When it ends: a chime, "Break's over." and back to Now.
   - **Timer settings** (`#settings`): focus, break and longer-break minutes, and how many blocks come before a longer break.
3. **Inbox** (`#inbox`): one autofocused text field (Enter saves and clears it) above a plain list of tasks. Tapping a task opens it.
4. **Task** (`#task/:id`): the title, a step list (add, edit, reorder with up/down, delete) and **Make this my current task**. This is the only place a list of steps appears.
5. **Off**: shown when there is no open workday.
   - After you end the day: "That's the workday done. It's okay to stop now." with a short list of what got done today (steps, not counts or scores).
   - Morning, or after an auto-close: a calm **Start today** button.
6. **Coach** (Phase 2): one question at a time with a text field. When steps are proposed, it shows **only the first one**: "Start with this?" → **Yes** / **Smaller** / **Edit**. The rest are saved silently.

**Visual rules:** dark by default; follows the system when it asks for light, a calm palette, tap targets of at least 48px, a large type scale and generous spacing. No red, no badges, no streaks, no "missed" or "overdue" language, and no counters of what didn't happen.

---

## 6. API

Everything the UI does goes through this JSON API. The UI has no special endpoints, so a future Android app can do anything the web app can.

| Method & path                                   | Purpose                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET  /api/state`                               | Everything the Now, Focus and Off screens need: workday, current task, **current step only**, open block, `server_now` |
| `GET  /api/status`                              | **Read-only** summary for external clients (below)                                                                     |
| `GET  /api/today`                               | Today's done-list (Off screen)                                                                                         |
| `POST /api/workday/start`                       | Open today's workday                                                                                                   |
| `POST /api/workday/end`                         | Close it and return today's done-list                                                                                  |
| `GET  /api/tasks?status=`                       | List tasks                                                                                                             |
| `POST /api/tasks`                               | `{ title }` → quick capture                                                                                            |
| `PATCH /api/tasks/:id`                          | Title, notes, status                                                                                                   |
| `DELETE /api/tasks/:id`                         | Delete a task                                                                                                          |
| `POST /api/tasks/:id/current`                   | Make this the current task                                                                                             |
| `GET  /api/tasks/:id/steps`                     | Step list (Task screen only)                                                                                           |
| `POST /api/tasks/:id/steps`                     | `{ text }` or `{ texts: [] }`                                                                                          |
| `PATCH /api/steps/:id`                          | Text, status, `position`                                                                                               |
| `DELETE /api/steps/:id`                         | Delete a step                                                                                                          |
| `POST /api/blocks`                              | Start a block on the current step                                                                                      |
| `POST /api/blocks/:id/finish`                   | `{ outcome }` → `{ next, break }`                                                                                      |
| `POST /api/blocks/:id/extend`                   | +5 min on the running block                                                                                            |
| `POST /api/breaks/:id/extend`                   | +5 min on the running break                                                                                            |
| `POST /api/breaks/:id/end`                      | End the break now (skip)                                                                                               |
| `GET  /api/settings`                            | Timer lengths                                                                                                          |
| `PATCH /api/settings`                           | `{ focusMinutes, breakMinutes, longBreakMinutes, longBreakEvery }` (any subset)                                        |
| `GET  /api/export`                              | Full JSON dump (backup)                                                                                                |
| `GET  /api/healthz`                             | Liveness                                                                                                               |
| _Phase 2_ `POST /api/coach/sessions`            | `{ kind, taskId \| stepId }` → first question or steps                                                                 |
| _Phase 2_ `POST /api/coach/sessions/:id/reply`  | `{ text }` → next question or steps                                                                                    |
| _Phase 2_ `POST /api/coach/sessions/:id/accept` | Save the proposed steps                                                                                                |
| _Phase 2_ `GET  /api/usage/today`               | Tokens, cost and limit                                                                                                 |

```jsonc
// GET /api/status
{ "localDate": "2026-09-24", "workdayStarted": true, "workdayEnded": false,
  "stepsCompleted": 3, "focusMinutes": 75,
  "activeBlock": { "startedAt": "…", "endsAt": "…" } | null,
  "activeBreak": { "kind": "short", "startedAt": "…", "endsAt": "…" } | null }
```

Errors return `{ "error": { "code": "…", "message": "…" } }` with a sensible status code.

---

## 7. Breakdown coach (Phase 2)

- **System prompt** lives in `prompts/coach.md`, is loaded at startup and can be tuned without touching code.
- **Model** comes from `CLAUDE_MODEL`, default `claude-opus-5`, using adaptive thinking at `low` effort (these are short, conversational turns).
- **Structured output:** each turn returns `{ "type": "question", "question": "…" }` or `{ "type": "steps", "steps": ["…"] }`, enforced with `output_config.format` and validated with Zod.
- **At most 3 questions**, counted server-side. After the third answer, the server tells the model to propose steps now.
- **Step rules** (in the prompt and checked loosely in code): each step starts with a verb, is physically doable and takes 5–15 minutes. When shrinking a stuck step: one question, then smaller steps, down to 2-minute steps if needed.
- **Tone:** warm and brief, never moralising, one question per turn.
- **Spend cap:**
  - Every call logs its usage to `api_usage`, costed from a per-model price table in `src/server/coach/pricing.ts`.
  - Before each call the server checks today's total against `DAILY_SPEND_LIMIT_USD` (default `1.00`).
  - Over the limit, the coach returns the `limit_reached` error, and the UI falls back gently to the Phase 1 manual prompt ("What's the smallest next step?").
- **API key:** `ANTHROPIC_API_KEY` exists only in the server environment and is never sent to the client or logged.
- The system prompt is probably too short to benefit from prompt caching. Revisit only if `api_usage` shows it matters.

---

## 8. Deployment

- One image, built in multiple stages (build the frontend with Vite, compile the server, then a slim runtime on `node:24-slim`). A non-root user.
- `compose.yaml`:
  - The service `anker` has **no `ports:`** and joins SWAG's external Docker network (name from env, default `swag`).
  - Volume `./data:/data` holds `anker.db`.
  - `restart: unless-stopped` and a healthcheck on `/api/healthz`.
- `docker/anker.subdomain.conf` is a ready-to-copy SWAG proxy conf: it proxies to `anker:3000` with `auth_basic` and `auth_basic_user_file /config/nginx/.htpasswd-anker`. The manifest and icons are exempt from auth so "Add to Home screen" works.
- Env (`.env.example`): `TZ_DISPLAY`, `DAY_CUTOFF=04:00`, `FOCUS_MINUTES=25`, and in Phase 2 `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` and `DAILY_SPEND_LIMIT_USD`.
- **Backup:**
  - `GET /api/export` returns JSON.
  - `docker compose exec anker node src/server/backup.ts` (`pnpm backup` in dev) writes a consistent SQLite `.backup` plus the JSON export into `/data/backups/`, keeping the last 14.
  - Restoring means copying a `.db` back into the volume, as documented in the README.
- Assumption to confirm at deploy time: SWAG runs in Docker on the same host. If it doesn't, publish `127.0.0.1:3000` instead and point SWAG at the host.

---

## 9. Phases

Each phase is deployable and usable on its own. I stop at the end of each one for you to test.

**Phase 1: core loop (no AI)**

1. Scaffold: repo, Fastify, SQLite, migrations, Docker, SWAG conf, export, healthz.
2. Inbox capture, the Task screen with its step editor, and picking the current task.
3. The Now screen and focus blocks (server-side start time, chime, notification, tab title, Done/Stuck/Keep going).
4. Workday start and end, the Off screen, and auto-close at the cutoff.
5. `/api/status`, the PWA manifest and icons, and the service worker.

**Phase 1b: breaks and timer settings** (added 2026-09-25 at the owner's request)

1. A break after Done or Stuck at time's up, with a longer one every 4th block. Chime at the end, then back to Now.
2. +5 min on a running block or break.
3. Timer settings in the app: focus, break and longer-break minutes, and the long-break interval.

**Phase 2: breakdown coach**

1. Prompt file, Claude client, structured output, usage logging and the daily cap.
2. Breakdown flow from the Task screen ("Break this down") and from the Inbox.
3. Stuck → shrink flow at the end of a block.
4. The coach shows proposed steps one at a time.

---

## 10. Designed for later, not built now

- **Android companion** (Health Connect and app blocking): it would read `/api/status`, sending basic auth credentials through SWAG. No Android code, health integration or blocking logic yet.
- **Side-task time caps:** parked. Nothing in the data model prevents adding a `side_blocks` table later.

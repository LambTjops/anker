# Anker roadmap

> **Written:** 2026-09-25, after Phase 1c shipped. These are **proposals**. Once the owner
> approves one, it moves into BRIEF.md, which stays the source of truth.

## Start here tomorrow

1. **Decide D1–D6** (at the bottom). Each has a recommended option, so a quick "yes to all" works.
2. **Build Phase 1d** (below). It's small, has no open questions, and removes the last gaps in the daily flow.
3. Then start **Phase 3: Focus shield** (the site blocker), or Phase 2 (the coach) if you'd rather have that first (D1).

For Claude: read this file, BRIEF.md and CLAUDE.md first. Ship each change with the workflow in CLAUDE.md
(check → commit → push → pull in `/docker/anker` → rebuild).

---

## 1. The goal, and how each idea is judged

Anker exists to keep its owner out of the ADHD procrastination cycle:

```
task feels big or vague ──► avoidance ──► escape (browser, phone) ──► time slips away
        ▲                                                                   │
        └──────────── guilt makes the task feel even heavier ◄──────────────┘
```

A feature earns its place only if it breaks this loop at one of these points:

| Point in the loop     | What helps                                                | What Anker has now                                            |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| **Aversion**          | Make the next move small and concrete                     | One step on Now, Stuck → smaller move, Break it down          |
| **Decision friction** | Decide once, then just follow the flow                    | Plan today (max 3), Next up, one Start button                 |
| **Escape**            | Make the escape routes slower than the work               | _Nothing yet_: this is the biggest gap                        |
| **Time blindness**    | Keep time visible and give soft warnings before the end   | Countdown, tab title, heads-up chime, breaks                  |
| **Guilt**             | No debt carried forward, and wins shown instead of misses | No red, no streaks, quiet 04:00 close, done list, done moment |
| **Re-entry**          | Show exactly where you were, with no catch-up to do       | Server-owned state; Now always shows the one next thing       |

### Anti-bloat rules (they apply to every item below)

1. **One primary action per screen.** Now and Focus never show more than three things you can tap.
2. **A new feature must remove a decision or a tap**, not add one. If it adds a choice, the choice goes in
   Settings with a sensible default, and never on the main path.
3. **Defaults over options.** Build the one best behaviour; add a setting only after real use shows it's needed.
4. **Keep or cut after two weeks.** If a feature isn't used or doesn't help, remove it. Less is the feature.
5. **Never show what didn't happen**: no counts of skipped, missed or overdue items.

---

## 2. Where the project stands (2026-09-25)

**Live** at https://anker.onsnet.nz (commit `1980ed2`):

- Phase 1: capture, the step editor, current task, 25-minute blocks with Done/Stuck/Keep going, workday
  start and end, the 04:00 auto-close, `/api/status`, the PWA and the service worker.
- Phase 1b: breaks (long every 4th block), +5 min, timer settings.
- Phase 1c: Park a thought, Plan today (max 3) with Next up, a length choice at Start, the heads-up chime,
  the done moment, and older tasks folding away in the Inbox.
- Ops: public repo github.com/LambTjops/anker, prod via `/docker/docker-compose.yml`, and a nightly
  backup at 03:15.

**Known loose ends**

- **Basic auth is off in prod** (turned off for testing). The data is readable by anyone with the URL. Revisit
  before the Focus shield ships (see D5).
- **The owner's email is on the public commits.** Optional: switch to GitHub's noreply address and rewrite history.
- **Not yet tried on a real device:** the done-moment animation and sounds, and the heads-up chime while a tab is
  in the background (Edge throttles background timers; the one-shot timers should still fire).
- **Friction in the flow:** see Phase 1d.

---

## 3. Phase 1d: flow polish (small, no decisions needed)

Each item removes a tap or a decision in the daily loop.

### 1d.1 "First thing tomorrow" at End workday

**Why:** the hardest start of the day is the first one. Choosing it the evening before, while the context
is still fresh, turns the next morning into a single tap. This is Hemingway's "stop mid-sentence" trick.

**Flow:** ⋯ → End workday → "Yes, I'm done for today" → the Off screen shows the done list, then one field:
**"First thing tomorrow?"** It's pre-filled with the current step or the next planned task. Enter saves it, or
**Skip** leaves it empty.

**Data:** reuse the plan. Set `planned_for` = the next local date (the next logical day after the cutoff) and
`plan_position` = 0. If the answer is a new thought rather than a task, create the task first. Tomorrow's Plan
screen opens with it already picked as #1, so **Start today → Start with "…"** gets you working.

**API:** `PUT /api/plan` gains an optional `{ date: 'tomorrow' }`. Nothing new for the UI to call.

### 1d.2 A task started as-is finishes itself on Done

**Why:** a task with no steps becomes its own single step. Today that means Done → break → "That task is
clear" → **Mark task done**: an extra tap and an extra screen, just when momentum matters most.

**Rule:** when Done completes the **last open step** of a task that has **exactly one step whose text equals
the title**, the server marks the task done too. The done moment says "Task done." After the break, Now shows
**Next up**. Tasks with real steps keep "That task is clear" (you may want to add a step).

### 1d.3 Break screen: what's waiting after the break

**Why:** getting back to work after a break is where ADHD days fall apart. Seeing what's next during the
break primes the return.

**UI:** under the break countdown, a small label: `After the break` followed by the current step (or the Next
up task) in muted text. It's still one thing, and not a list.

### 1d.4 Share to Anker (Android)

**Why:** half of all "I should…" thoughts start on the phone. A PWA `share_target` in the manifest lets you
share text or a link from any app straight into the inbox.

**Build:** `share_target` in `manifest.webmanifest` → a `GET /share?title&text&url` page that creates the
task and shows "Saved to your inbox." Small, and it only matters once Anker is installed on the phone.

**Size:** 1d.1 is the biggest (one API tweak and the Off screen); 1d.2–1d.4 are about an hour each.

---

## 4. Phase 3: Focus shield (block distracting sites during focus)

The biggest gap in the loop is **escape**. When a step feels hard, the browser is one Ctrl+T away. The
shield makes that escape slower than the work, without turning Anker into something to fight.

### 4.1 Options considered

| Option                                                | Covers                         | Verdict                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browser extension (Manifest V3)** synced with Anker | Edge/Chrome on the laptop      | **Recommended.** It knows exactly when a block is running and shows the step on the blocked page. Easy to install (sideloaded).                   |
| DNS blocking (AdGuard Home/Pi-hole on the homelab)    | Every device on home Wi-Fi/VPN | Later, maybe. There's no DNS blocker on the homelab today; it's slow to switch (DNS caching), affects the whole household and misses mobile data. |
| Hosts-file or OS-level blocker                        | One machine                    | No. It needs admin rights, is invisible to Anker and easy to forget.                                                                              |
| Android companion (Digital Wellbeing / accessibility) | The phone                      | Already parked in BRIEF §10. Revisit after the extension proves the idea.                                                                         |

The logs show all your Anker use comes from **Edge on Windows**. Edge runs Chrome MV3 extensions, so one
extension covers the main device.

### 4.2 How it behaves (proposed defaults)

- **When:** blocked during focus blocks **and breaks** (see D2). The break screen already says "Step away from the
  screen", and break scrolling is the classic way a 5-minute break becomes an hour. Outside blocks and breaks,
  nothing is blocked; the shield is not a nanny.
- **What you see:** a blocked site redirects to a calm Anker page:

  ```
                 PLAN FUTURE OF APP
      Open the drive folder and find the latest letter
                        18:42 left

                   [ Back to it ]           ← closes the tab
                   Park a thought           ← same as on Focus

            Open anyway for 5 minutes       ← appears after a 10 s pause
  ```

  The pause matters. Most urges fade in seconds, and a **soft block with friction** is kept, while a hard lock
  gets uninstalled (see D3). There are no bypass counters or "you slipped" messages. The friction is enough.

- **Toolbar badge:** shows the minutes left during a block, a small cup during a break, and nothing otherwise. The
  time stays visible even when Anker's tab is buried. When no workday has started, the badge shows a small ▶ as a
  quiet morning cue.
- **Popup (toolbar click):** the current step, **Open Anker**, and a capture field. A keyboard shortcut
  (Alt+Shift+A) opens it, so "Park a thought" works from any tab.
- **Fails open:** if Anker can't be reached, blocking stops when the known block ends (each rule has an expiry).
  The extension never locks you out indefinitely.

### 4.3 Blocklist

- It's stored **on the server**, so it survives reinstalling the extension and a future Android client can use it.
- It's edited in **⋯ → Timer settings → Distracting sites**: one domain per line. Subdomains are included
  (`youtube.com` covers `m.youtube.com`).
- It starts with a suggested list the owner edits once: `youtube.com, reddit.com, x.com, facebook.com,
instagram.com, tiktok.com, news.google.com, stuff.co.nz, nzherald.co.nz` (see D4).
- **Always allowed**, even if listed: Anker itself.

### 4.4 Architecture

```
┌──────── Anker server ─────────┐          ┌──────────── Edge extension (MV3) ─────────────┐
│ GET /api/shield               │◄─────────│ background service worker                      │
│  { mode: 'focus'|'break'|'off',│  poll    │  • alarm every 30 s + wake on Anker page event │
│    until, stepText, taskTitle, │  30 s    │  • declarativeNetRequest dynamic rules:        │
│    sites: [...] }             │          │      redirect listed domains → blocked.html    │
│ PATCH /api/settings           │          │  • alarm at `until` removes rules on time      │
│   { blockedSites: [...] }     │          │  • badge text = minutes left                   │
└───────────────────────────────┘          │ blocked.html  (step, time, Back to it, Park)   │
          ▲                                │ popup.html    (step, Open Anker, capture)      │
          │ Start / Done in the web app    │ content script on anker.onsnet.nz: relays      │
          └───── window event ────────────►│   "state changed" so blocking starts at once   │
                                           └────────────────────────────────────────────────┘
```

- **Server:** migration 004 adds `settings.blocked_sites` (a JSON array) and `GET /api/shield`, one small read-only
  payload so the extension never has to put together `/api/state`. It holds one step at most, which keeps prime
  directive 1.
- **Extension:** it lives in `extension/` in this repo, as plain JS with no build step and no dependencies.
  Install it with Edge → Extensions → Developer mode → Load unpacked. It's not in the store.
- **Instant start:** the web app fires a `anker:state` DOM event after Start, Done and Stop. A content script
  on the Anker origin forwards it to the service worker, which refetches at once. Polling covers every other
  case, such as a phone starting the block.
- **Auth:** the extension's service worker calls Anker with host permissions, so CORS doesn't apply. When
  basic auth returns (D5), the options page stores the credentials and sends them in an `Authorization` header.
  No new server auth is needed.
- **Tests:** a Vitest unit test for the pure rule builder (domains → DNR rules, expiry) and for `/api/shield` (modes,
  until, allow-list).

### 4.5 Build order (each step can be shipped and tested on its own)

1. `/api/shield`, the blocklist in settings and the Settings UI.
2. The extension skeleton: polling, badge, the popup with the step and capture.
3. Blocking: DNR rules, `blocked.html`, the delayed "Open anyway", and fail-open expiry.
4. Instant sync through the content script, plus README install notes.

---

## 5. Phase 2: breakdown coach (already briefed, with two additions)

BRIEF §7 stands. Aversion to a vague task is the root of most procrastination, so this is the second big lever
after the shield. Two additions that fit the purpose:

- **Offer a shrink automatically.** When the same step has been **Stuck twice**, or has sat as the current
  step through two workdays, Now shows a quiet "Make this smaller?" link that goes straight to the shrink flow.
  It's never a nag, just one link.
- **Coach in the Plan screen.** A planned task with no steps gets "Break it down" beside it, so the
  morning plan can also make the first step concrete.

It needs an Anthropic API key and the owner's OK on the model and the daily cap (D6).

---

## 6. Later, maybe (only after real use shows the need)

| Idea                                   | Why it could help                                                                                      | Why it waits                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Brown-noise toggle during focus        | Many people with ADHD focus better with steady noise. It can be generated in Web Audio, with no files. | It adds a control. Try free apps first; add only if missed.           |
| Weekly inbox sweep, one card at a time | "Keep / Someday / Drop" per task keeps the inbox light, without a scary list                           | Only matters once the inbox grows. Folding older tasks may be enough. |
| "This week" done list                  | Counters the "I did nothing" feeling on bad days                                                       | The Off screen's daily list may be enough.                            |
| Blocks-per-task shown at Task done     | Calibrates time estimates ("that took 3 blocks")                                                       | Borderline stats; could slide into scorekeeping.                      |
| DNS-level shield on home Wi-Fi         | Covers the phone at home                                                                               | Needs AdGuard Home and whole-household rules; see §4.1.               |
| Accountability ("send my done list")   | External accountability is a strong ADHD motivator                                                     | Privacy, and a second person. The owner should ask for it.            |

## 7. Deliberately not doing

Streaks, points, levels, stats dashboards, due dates or priority matrices, projects and tags, calendar sync,
multiple parallel timers, required time estimates, and repeated nag notifications. Each of these either adds
decisions before starting or makes misses visible, the two things that feed the procrastination loop.

---

## 8. Decisions for the owner

| #      | Question                                                                     | Recommendation                                                                                                                                                                                                                      |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | After Phase 1d: build the Focus shield first, or the coach first?            | **Shield first.** Escape is the biggest open gap, it needs no API key, and you asked for it.                                                                                                                                        |
| **D2** | Block during breaks too?                                                     | **Yes.** Breaks are for stepping away from the screen; break scrolling is how breaks run long.                                                                                                                                      |
| **D3** | A soft block (10 s pause, then "Open anyway for 5 minutes") or a hard block? | **Soft.** Hard locks get uninstalled; a short pause is usually enough to break the urge.                                                                                                                                            |
| **D4** | The starting blocklist                                                       | The suggested list in §4.3. Edit it to match your own escape sites.                                                                                                                                                                 |
| **D5** | Access protection before the shield ships                                    | **Basic auth back on in SWAG**, with the extension sending credentials. It needs no code in Anker.                                                                                                                                  |
| **D6** | Coach: model, daily cap, API key                                             | BRIEF §7's cap ($1/day) and low effort. BRIEF names `claude-opus-5`; newer models exist (e.g. `claude-opus-5-5`, or `claude-sonnet-5` for cheaper), so confirm the current ID and prices when Phase 2 starts. Provide the key then. |

# Design note: the goal model and the scheduler

Box P4.1. Status: proposed. Implementation (P4.2 to P4.7) waits until this merges. Terms such as `Run`, `Scope` and `Step` are defined in the glossary in `docs/architecture.md`.

## Problem

A goal is an ongoing project with its own memory and its own clock: "learn Rust" keeps a curriculum and a place in it, a venue watcher keeps the shows it has already reported. Three things have to be settled before any of it is built: what a goal stores and how its state document is versioned; how schedules are stored and fire without double-firing across restarts; and what happens to occurrences that come due while the server is down or busy. A scheduler that fires twice sends two briefs, one that fires after a week offline can send seven, and one that fires nothing for a month is worse than none.

## Approach

### What is stored

- **`goals`**: id, title, status (`active` or `archived`), the id of its channel, timestamps. The channel is created with the goal and the brief is shown pinned at its top.
- **The brief** is a `GoalBrief`, one kind of the `ScopeCard` type in the context note (`docs/design/context.md`), stored in the shared `scope_cards` table with the same versions, restore and context-report version as a purpose card. It is the goal channel's card: no purpose card is drafted, it is sent where the card goes, and the drift check compares against it. What differs is who writes it: the user writes it, and the agent may draft or suggest a change, but only the user's confirmation saves one. The type makes that difference a compile-time rule, not a convention.
- **`goal_states`**: goal id, a version number, the content (Markdown), who wrote it (`agent` or `user`), the `Run` that wrote it, a one-line note of what changed, a timestamp. Versions are append-only and never edited. The current state is the highest version. For the Artifacts gallery (P4.4) the state document is a listing that points at the goal and always shows the latest version; there is no second copy to drift.
- **`schedules`**: id, goal id, a five-field cron expression, the task prompt, a destination, `enabled`, `next_fire_at`, a missed-run policy. The destination is `channel` (the `Run` posts in the goal's channel) in Phase 4; `feed` and `digest` arrive with Phases 5 and 8 as new values, not new columns. A schedule has no time zone of its own (below).
- **`schedule_fires`**: schedule id, `due_at`, a state (`waiting`, `started`, `coalesced`, `missed`, `failed_to_start`), the `Run` id once one starts, and timestamps. A unique index on (schedule id, `due_at`) is what makes double-firing impossible. This table is both the waiting list and the log the scheduler's box (P4.2) promises, and the Goals screen reads it.

Archiving a goal disables its schedules but remembers which were enabled, so restoring brings back exactly those.

**Deleting a goal** removes the goal, its channel and that channel's `Runs`, its brief versions, its state versions, its schedules and its fire log. Artifacts its `Runs` made are not deleted by default, since artifacts are meant to outlive what made them. The same dialog that channel deletion uses lists them and pre-selects for deletion only those nothing else refers to: no summary's artifact list, no reference document, and no `read_artifact` call in another `Scope` names them. The user can change the selection before confirming. The state document goes with the goal: it is a view of `goal_states`, not an artifact of its own.

### The user's time

Everything happens in the user's time. There is one setting, the user's time zone (an IANA name), taken from the browser the first time the app is opened and changeable in settings. Times are stored in UTC and converted with that setting in exactly two places: the scheduler, which reads every cron expression in the user's zone, and the UI, which shows every time in the user's zone (not the browser's, so a phone on a trip does not disagree with the schedules). The current date the agent is told uses the same setting. Changing it moves every schedule with it, which is the point: "6:30" means 6:30 where the user is.

### The state document

The agent reads the current state on every goal `Run`, as part of the context (`docs/design/context.md`: the brief gets up to 500 tokens, the state up to 3,000). Where in the context it goes is settled at implementation (P4.4) by the context note's most-static-first rule and its cache measurements, since the state changes on most goal `Runs`.

The agent changes the state only through `update_goal_state`, a `local` tool, and does so with **exact-string edits** rather than by rewriting the document:

- **Edits:** a list of `{old, new}` pairs, each `old` matching exactly once in the version the agent read, applied together or not at all, with a one-line note and that version number. A pair whose `old` matches nothing or more than once is an error naming the pair, which the model can correct.
- **Conflicts:** if the user (or another write) has changed the document since that version, the edits are tried against the current one. If every `old` still matches exactly once there, they apply, so the user's edits elsewhere in the document cost nothing. Otherwise the tool returns an error carrying the current content, and the agent reconciles and tries again. A user's edit is never silently overwritten.
- **Whole replacement** is a second form of the same tool, for the first write and for condensing. It still carries the version read and is refused if that is no longer current.
- **The cap:** a write that would take the document over its cap is refused with a request to condense, because a state document that outgrows its budget is cut off from the very `Run` that must maintain it.

Edits are the default because on a CPU-only host the model's output is the slow part: rewriting a 3,000-token document to change one line takes minutes of generation, enough to hit a `Run`'s time limit. The user's edits through the UI are versions like any other, with `user` as the author, and any version can be restored by writing it as a new one.

### The scheduler

It lives in the server process and polls: every 30 seconds it looks for enabled schedules whose `next_fire_at` has passed and for waiting fires that can start. Polling rather than one long timer survives a clock change or a host that slept. Cron parsing and next-occurrence arithmetic, including daylight saving, use `croner`, a small dependency with none of its own; writing a cron parser is a bug farm and the project's one-package rule is about processes, not libraries.

**Coming due.** In one database transaction the scheduler inserts the `schedule_fires` row for the occurrence as `waiting` and advances `next_fire_at` to the next occurrence after now. The unique index means an occurrence can only ever have one row.

**Starting.** When there is room (below), the scheduler takes the waiting fires oldest-due first. In one transaction it marks a fire `started`, creates its `Run` and records the `Run` id; only after the commit does the `Run` begin. A crash between that commit and the `Run` beginning leaves a `started` fire whose `Run` never ran, which the next startup records as `failed_to_start` and does not retry. The worst case is one missed `Run` that the log shows, never a double. Waiting fires survive a restart, since they are rows, and start once the server is back and has room.

**Nothing is skipped for being busy.** A fire waits for room however long that takes and starts as soon as there is some. The one limit is that a schedule has at most one waiting fire: if a newer occurrence comes due while an older one is still waiting, the older is marked `coalesced` and the newer waits in its place, so an hourly watcher stuck behind a three-hour `Run` runs once when it gets room, on the freshest occurrence, instead of three times in a row. The log shows every occurrence either way.

A scheduled `Run` is an ordinary `Run` whose `Scope` is the goal and whose `Trigger` is the schedule. It gets the task prompt as its user message, the goal's brief and state in context, and the same limits and tool rules as any `Run`. Nobody is watching, so an `external` tool in a scheduled `Run` parks it at an approval card like any other; such a `Run` uses a shorter approval timeout (12 hours, ending as "approval not given") so one unattended question does not hold the goal forever.

### Room to run

- **At most 2 scheduled `Runs` at once** across the server (a setting). A `Run` waiting on an approval uses no compute and does not count.
- **At most 1 `Run` per goal at once**, counting a `Run` waiting on an approval and a `Run` the user started in the goal's channel. Two `Runs` on one goal would race on its state document and interleave its channel. A scheduled fire for a busy goal waits for that `Run` to end.
- A user message in a goal's channel while a scheduled `Run` is active gets the existing "still working" answer.

How many `Runs` a host can really serve at once depends on its model servers, for example a small model for titles and summaries on one GPU and a large one on another. Once per-model settings exist (P2.11), the overall cap can become a per-model one; until then it is a single number.

### Occurrences missed while the server was down

At startup, and whenever a poll finds `next_fire_at` more than two polls in the past (the host slept), the scheduler applies the schedule's policy to the occurrences it missed:

- `catch_up_once` (the default): if the most recent missed occurrence is less than 6 hours old (the grace window, a setting), it gets a waiting fire like any other; the rest are recorded as `missed`. A daily brief due at 06:30 still runs if the server comes back at 09:00, but not at 20:00.
- `skip`: record everything as `missed` and wait for the next occurrence.

Never more than one catch-up per schedule, whatever the downtime. A week offline produces one `Run` at most, not seven, and the log says what was missed.

The grace window applies only to downtime. A fire that is waiting because the server was busy has no window: it runs when there is room.

## Rejected

- The host's cron or an external job runner. It ties the product to a host, and the Docker image is meant to run the same everywhere.
- A job queue with workers. The `schedule_fires` table already is the queue, and the server process is the only worker.
- Skipping an occurrence because the caps were full. The user treats the agent as an asynchronous resource and would rather wait than lose work; coalescing keeps the wait from piling up.
- Exactly-once with catch-up of every miss after downtime. It is the storm after downtime; one catch-up and an honest log is calmer, which is the project's principle.
- A grace window of half the schedule's interval. A cron expression such as "weekdays at 6:30" has no single interval, and a fixed window is simpler to reason about.
- A time zone per schedule, or the server's time zone as the default. In a Docker container the server's zone is usually UTC, and two sources of local time would disagree; one user setting cannot.
- Rewriting the whole state document on every change. On a CPU-only host the output alone takes minutes.
- `sed`-style patterns for state edits. Models get the escaping wrong often, and a bad pattern can quietly match the wrong line.
- The state document as a file on disk. Versions, the conflict check and atomic writes are easier in SQLite, and the gallery shows it either way.
- Letting the agent create or change schedules directly. Schedules are proposed and confirmed (P4.5); this note only defines how they are stored.
- Per-goal models and budgets in this phase. Per-channel model choice (P2.2a) already applies through the goal's channel.

## How evals will tell if it works

Unit tests with a fake clock, plus scripted scenarios for the agent-facing parts.

- **Double-firing**: advance the clock across an occurrence, restart the scheduler at every point in the fire sequence (before each commit, between commit and the `Run` beginning, after); the `Run` starts at most once and the log accounts for every occurrence.
- **Missed occurrences**: a daily 06:30 schedule whose server returns at 09:00, at 20:00, and at 09:00 two weeks later yields one catch-up, none, and one, with `missed` rows for the rest.
- **Waiting for room**: with the overall cap full, a due fire waits and starts as soon as a `Run` ends; with two goals' `Runs` parked on approvals, a third goal's fire still starts; a goal never has two `Runs` at once, counting a user's `Run` in its channel; an hourly schedule waiting through three occurrences runs once, on the newest, with two `coalesced` rows; a waiting fire survives a restart and starts after it.
- **The user's time**: a 06:30 schedule fires at 06:30 in the user's zone on both sides of a daylight saving change, and moves when the setting changes.
- **Brief** (scripted): an edit or a restore adds a version, the `Run` after it sends the new brief, and its context report names that version; an agent draft is not saved without the user's confirmation.
- **State document** (scripted): a lesson `Run` updates progress with edits and the version increments; an edit whose `old` matches twice is refused naming the pair; after a user edit elsewhere in the document, a stale edit still applies; after a user edit to the same line, it fails with the latest content and the retry succeeds; an over-cap write is refused with the condense message and a whole-replacement condense succeeds; a restore creates a new version.
- **Archive and restore** bring back exactly the schedules that were enabled.
- **Delete** removes the goal's channel, brief, states, schedules and log, keeps its artifacts, and pre-selects for deletion only the ones nothing else refers to.

## Open for the user

- Coalescing keeps the newest waiting occurrence of a schedule and marks the older one `coalesced` (proposed). Keeping the oldest instead would favor tasks that must see every occurrence, which none of the examples do.
- Whether the overall cap becomes per model once P2.11 lands.

Settled in review: the 6-hour grace window, `catch_up_once` as the default, the caps of 2 scheduled `Runs` and 1 per goal, the 12-hour unattended approval timeout, and `croner`.

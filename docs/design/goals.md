# Design note: the goal model and the scheduler

Box P4.1. Status: proposed. Implementation (P4.2 to P4.7) waits until this merges.

## Problem

A goal is an ongoing project with its own memory and its own clock: "learn Rust" keeps a curriculum and a place in it, a venue watcher keeps the shows it has already reported. Three things have to be settled before any of it is built: what a goal stores and how its state document is versioned; how schedules are stored and fire without double-firing across restarts; and what happens to runs that were due while the server was down. A scheduler that fires twice sends two briefs, one that fires after a week offline can send seven, and one that fires nothing for a month is worse than none.

## Approach

### What is stored

- **`goals`**: id, title, brief (user-written, agent-assisted), status (`active` or `archived`), the id of its channel, timestamps. The channel is created with the goal and the brief is shown pinned at its top. The brief is that channel's purpose card: no separate card is drafted, it is sent in the scope-card layer, and the drift check compares against it (`docs/design/context.md`).
- **`goal_states`**: goal id, a version number, the content (Markdown), who wrote it (`agent` or `user`), the run that wrote it, a one-line note of what changed, a timestamp. Versions are append-only and never edited. The current state is the highest version. For the Artifacts gallery (P4.4) the state document is a listing that points at the goal and always shows the latest version; there is no second copy to drift.
- **`schedules`**: id, goal id, a five-field cron expression, an IANA time zone, the task prompt, a destination, `enabled`, `next_fire_at`, a missed-run policy. The destination is `channel` (the run posts in the goal's channel) in Phase 4; `feed` and `digest` arrive with Phases 5 and 8 as new values, not new columns.
- **`schedule_fires`**: schedule id, `due_at`, fired timestamp, the run id if one started, and an outcome (`started`, `missed`, `skipped_busy`, `failed_to_start`). A unique index on (schedule id, `due_at`) is what makes double-firing impossible. This table is the log the scheduler's box (P4.2) promises, and the Goals screen reads it.

Archiving a goal disables its schedules but remembers which were enabled, so restoring brings back exactly those. Deleting a goal removes its states, schedules and fire log with it.

### The state document

The agent reads the current state at the start of every goal run, in the scope-card layer of context assembly (`docs/design/context.md`: the brief gets up to 500 tokens, the state up to 3,000). It changes the state only through `update_goal_state`, a `local` tool that takes the **full replacement content**, a note, and the version it read. The write succeeds only if that is still the current version. If the user edited in the meantime, the tool returns an error carrying the new content, and the agent reconciles and writes again; a user's edit is never silently overwritten. A write over the cap is refused with a request to condense, because a state document that outgrows its budget is cut off from the very run that must maintain it. The user's edits through the UI are versions like any other, with `user` as the author, and any version can be restored by writing it as a new one.

### The scheduler

It lives in the server process and polls: every 30 seconds it selects enabled schedules whose `next_fire_at` has passed. Polling rather than one long timer survives a clock change or a host that slept. Cron parsing and next-occurrence arithmetic, including daylight saving, use `croner`, a small dependency with none of its own; writing a cron parser is a bug farm and the project's one-package rule is about processes, not libraries.

Firing is **at most once per occurrence**. In one database transaction the scheduler inserts the `schedule_fires` row for the occurrence and advances `next_fire_at` to the next occurrence after now; only after the commit does it start the run, and on success it records the run id. A crash between commit and start leaves a fire with no run, which the next startup records as `failed_to_start` and does not retry, so the worst case is one missed run that the log shows, never a double.

A scheduled run is an ordinary run whose scope is the goal and whose trigger is the schedule. It gets the task prompt as its user message, the goal's brief and state in context, and the same limits and tool rules as any run. Nobody is watching, so an `external` tool in a scheduled run parks it at an approval card like any other; such a run uses a shorter approval timeout (12 hours, ending as "approval not given") so one unattended question does not hold the goal forever.

### Runs missed while the server was down

At startup, and whenever a poll finds a schedule more than two polls overdue, the scheduler applies the schedule's policy to the occurrences it missed:

- `catch_up_once` (the default): if the most recent missed occurrence is within a grace window, fire a single run for it; the others are recorded as `missed`. The window is the smaller of 6 hours and half the schedule's interval, so a daily brief due at 06:30 still runs if the server comes back at 09:00 but not at 20:00.
- `skip`: record everything as `missed` and wait for the next occurrence.

Never more than one catch-up per schedule, whatever the downtime. A week offline produces one run, not seven, and the log says what was skipped.

### Concurrency

Scheduled runs are capped at 2 at once across the server and 1 per goal, counting runs that are waiting on an approval. A schedule due while a cap is full is left due, not queued: the next poll tries again, and once its grace window has passed it is recorded as `skipped_busy`. Not queueing is deliberate, since a queue of stale tasks after a long run turns into a pile-up at the worst moment. A user message in a goal's channel while a scheduled run is active gets the existing "still working" answer.

## Rejected

- The host's cron or an external job runner. It ties the product to a host, and the Docker image is meant to run the same everywhere.
- A job queue with workers. Real infrastructure for what two lines of SQL and a poll do for one user.
- Exactly-once with catch-up of every miss. It is the storm after downtime; one catch-up and an honest log is calmer, which is the project's principle.
- The state document as a file on disk. Versions, the conflict check and atomic writes are easier in SQLite, and the gallery shows it either way.
- Letting the agent create or change schedules directly. Schedules are proposed and confirmed (P4.5); this note only defines how they are stored.
- Per-goal models and budgets in this phase. Per-channel model choice (P2.2a) already applies through the goal's channel.

## How evals will tell if it works

Unit tests with a fake clock, plus scripted scenarios for the agent-facing parts.

- **Double-firing**: advance the clock across an occurrence, restart the scheduler at every point in the fire sequence (before commit, between commit and start, after); the run starts at most once and the log accounts for every occurrence.
- **Missed runs**: a daily schedule offline for 9 hours, 2 days and 2 weeks yields one catch-up, none (past the window), and one, with `missed` rows for the rest.
- **Concurrency**: two goals at the cap defer a third; the same goal never has two scheduled runs; a due schedule is recorded as `skipped_busy` only after its window.
- **Time zones**: a 06:30 schedule fires at 06:30 local on both sides of a daylight saving change.
- **State document** (scripted): a lesson run updates progress and the version increments; a stale write after a user edit fails with the latest content and the retry succeeds; an over-cap write is refused with the condense message; a restore creates a new version.
- **Archive and restore** bring back exactly the schedules that were enabled.

## Open for the user

- The grace window (smaller of 6 hours and half the interval) and whether `skip` should be the default instead of `catch_up_once`.
- The caps of 2 scheduled runs overall and 1 per goal, and the 12-hour approval timeout for unattended runs.
- Taking `croner` as a dependency.
- The default time zone for a new schedule: the server's, with the user able to change it per schedule (proposed).

# Slots: running a few sessions at once, safely

Status: proposal, for the user to workshop. Not yet a settled design. It is filed with the plan changes that would build it so the idea and its work queue can be taken or left together.

## Problem

Today a session takes one box and stops. The user wants to spend a whole usage window, or a whole Wednesday, on several sessions in parallel: two working boxes, one looking for new work, and each handing off to a fresh session when it finishes. Three things go wrong if this is done naively. Two sessions can both decide nobody is running and both spawn. A chain of sessions that each spawn a successor has no natural brake. And "how many are running" read from the session list is a check-then-act: it is stale the moment it is read.

Box claims already solved the same problem for work: a pushed `box/<ID>` branch whose first commit is an empty commit only one session can make. Slots apply that mechanism to sessions.

## Approach

A **slot** is a lease on one running session, held as a branch, the same way a claim is held as a branch. There are exactly three, so there can never be more than three agents working, whatever else goes wrong.

- `slot/box-1` and `slot/box-2`: box workers. Each follows `CLAUDE.md` as it is today, one box at a time.
- `slot/plan`: the planner (below). Only one, so proposals never race each other.

Slot branches hold only empty commits. They are never merged and never get a PR. Each commit message is `beat <ISO time> <session id> <state>`, where state is `held`, `handoff` or `released`.

### Taking a slot

A slot is free if its branch does not exist, or its last state is `handoff` or `released`, or its last commit is older than 90 minutes. To take it, fetch, then push one new empty commit on top of the tip you saw (or create the branch). A push rejected as not a fast-forward means someone else got there first: exit, having changed nothing. This is a compare-and-swap, so two sessions that both think a slot is free cannot both win.

### Heartbeat and losing a lease

The holder pushes a `held` commit when it claims a box, at each push of its box branch, and at least every 30 minutes of work. If a heartbeat push is rejected, another session took the slot because this one looked dead: stop work at once, leave the draft PR as it is, and exit. The box's own claim and the 6-hour resume rule then do what they already do.

### Handoff and the brake

When a box is done and the PR is ready, the worker checks the run window (below) and whether any box is free by its needs. If both say go, it pushes a `handoff` commit and fires the slot's own scheduled task (see the next paragraph). If either says stop, it pushes `released` and fires nothing. The successor takes the slot like anyone else, so a watchdog fire and a handoff fire that collide cost one wasted startup, not two agents.

Each slot has a **poke-only scheduled task** (no cron expression), named `bridle slot box-1`, `bridle slot box-2` and `bridle slot plan`, created once by the user. Firing it is how a slot is started. A hand trial showed why this beats creating sessions directly: a session created through the session API in auto mode had its shell and its own session calls blocked by the permission classifier, while sessions started by a scheduled task did full box work unattended. The tag on a slot session is for the reaper and for humans looking at the session list. It is never the lock. The prompt of each slot task names the slot and tells the session to carry the tag.

### The watchdog

A scheduled task runs hourly inside the run window. It owns no work. For each free slot it checks whether there is a reason to run: a box slot needs at least one unchecked, unclaimed box that is free by its needs; the planner slot needs fewer than 3 open `[plan]` PRs. If so, it fires that slot's scheduled task. This is what restarts a chain after a crash or a usage cutoff, and what starts the day. The started session takes the lease itself, so a failed fire never holds a slot. The watchdog replaces the daily box task: that task is disabled once the watchdog has run cleanly for a week.

### The run window

Sessions started by a scheduled task can read the provider's real five-hour window: `get_session` with no ID returns `rate_limit_info` whose type is `five_hour` and whose `resetsAt` is the end of the window, so the window opened at `resetsAt` minus 5 hours. A hand trial confirmed this on a daily-box run, where the window ran from its 06:50 start to 5 hours later. Interactive and API-created sessions instead report a promotional limit that resets weeks away, so only scheduled sessions can use this.

- Every day except Wednesday: a session starts no new box and fires no successor once it is 4 hours into the window, that is, once the current time is past `resetsAt` minus 1 hour. The fifth hour is slack for work in flight.
- Wednesday: no close. The window check is skipped, and the reaper at 23:00 ends the day.
- If `rate_limit_info` is missing or not `five_hour`, fall back to the clock: 07:00 plus 4 hours in the user's time zone.

### The reaper

A second scheduled task, which is not itself tagged `bridle`, runs at 11:00 local time on every day except Wednesday and at 23:00 on Wednesday. It lists recent sessions, keeps those whose `tags` include `bridle` and whose status is running or idle, and archives them. The list call's tag filter is rejected from inside a session and its output is large, so the reaper passes a small limit and filters the returned rows itself. It then pushes `released` to each slot branch. In auto mode an archive call can be denied by the permission classifier, so the reaper task needs an explicit permission rule for it. The slots make a runaway impossible by construction; the reaper is the backstop for a session that ignores its instructions. Archiving a session mid-box leaves a draft PR and a claim branch, which the resume rule picks up the next time a box session runs.

### The planner

When no box is free, nobody is idle: the planner reads the code base and looks for features, bugs and improvements. Each finding becomes its own `[plan]` PR, per the existing proposal rules, so a bug becomes a proposed fix box, never a code change. A closed `[plan]` PR was declined and is not refiled without something new. The planner stops filing when 3 `[plan]` PRs are open, so an unattended day cannot bury the user in review work. Because the user reviews and merges between runs, the next run finds new work: that is the loop.

It does not read everything every run. The day of the week picks the focus, and no state is stored, because the focus is computed from the date:

- Every day, the planner's first session reads new comments on open PRs and on `[plan]` PRs, and turns the ones that call for a plan change into proposals or replies.
- Thursday is structure day: the planner proposes how to divide the code base into areas (by directory, by layer, or by feature; the heuristic is its to propose and the user's to accept) and records the list in `docs/design/areas.md`.
- Every other day, the planner alternates between two kinds of session: a feature session that proposes new work, and a review session of one area, taking the areas in order. The area for a given day is the count of days since the list was merged, modulo the number of areas.

## What was rejected

- Counting sessions with `list_sessions` and spawning when the count is low. It races, it needs the whole list (tens of kilobytes, mostly archived), and its tag filter is not available from inside a session.
- Creating each slot's session through the session API. Auto mode blocked those sessions' shell commands and their own session calls in a trial, so unattended chains of them would stall. Scheduled tasks are used instead.
- A fixed schedule of independent triggers, each taking one box. Simple, but nothing restarts a chain that dies, and nothing stops two triggers from overlapping an idle session.
- Letting sessions spawn without a cap. A bug becomes a fork bomb. The cap is the slot count, and it holds even if every other control fails.

## Proposed changes to CLAUDE.md

Not applied by this proposal, because `CLAUDE.md` is not something a proposal may change. Box P0.5 applies them once the decision is settled.

- Add a **Slots** section stating the protocol above, and that `slot/*` branches may be pushed under the same permission as `box/*`.
- In step 1, add `'+refs/heads/slot/*:refs/remotes/origin/slot/*'` to the fetch, and say that a session started with a slot name in its prompt takes that slot before anything else, heartbeats as it goes, and applies the handoff rule after step 4.
- Say that a session started without a slot name works as it does today.

## How we will know it works

Not an eval scenario, since nothing here is harness behavior. Instead `scripts/slot.sh` (box P0.4) gets tests against a local bare repository: two takers racing for a free slot, a stale slot being taken over, a lost lease being detected by the old holder's next heartbeat, and `handoff` and `released` slots being takeable at once. The first real Wednesday is the soak test: the question afterwards is whether any box was claimed twice, whether any slot was ever held by two sessions for more than one heartbeat, and how many tokens went to proposals nobody wanted.

## Open points

The questions that need the user are in `docs/decisions.md`. The main ones: whether firing a scheduled task from inside a scheduled session works (untried, since firing starts real work), the permission rule the reaper needs, and how the planner divides the code base.

## Hand trial, 2026-10-20

What was tried and what happened, so the design rests on observation.

- A race on a scratch `slot/` branch: create and fast-forward pushes succeeded, and a second push on the same parent was rejected as not a fast-forward. The lease mechanism works on the real remote.
- Deleting that branch failed both ways with the connection dropped. Sessions cannot delete remote branches, so slot branches are permanent, and that is fine because they are reused.
- The session list's tag filter returns an error. Rows carry their `tags`, so filtering client-side works. Sessions started by a scheduled task are retrievable by ID, and sessions created through the API get a `parent_session_id` automatically.
- Sessions created through the API without a repository get no checkout; a watchdog that used the API would need to pass the repository.
- Sessions created through the API in auto mode failed their own `create_session` and `send_message` calls with a classifier error, and a shell `git` command was blocked the same way. Scheduled sessions did not show this.
- An archive call was allowed once and denied once by the classifier for the same kind of session, so the reaper cannot rely on it without a permission rule.
- Firing a scheduled task was not tried, because it would start real box work.

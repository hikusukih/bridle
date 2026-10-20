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

When a box is done and the PR is ready, the worker checks the run window (below) and whether any box is free by its needs. If both say go, it pushes a `handoff` commit and spawns a successor session with the slot name in its prompt. If either says stop, it pushes `released` and spawns nothing. The successor takes the slot like anyone else, so a watchdog spawn and a handoff spawn that collide cost one wasted startup, not two agents.

Each session spawned for a slot is tagged `bridle` and `slot:<name>`. The tag is for the reaper and for humans looking at the session list. It is never the lock.

### The watchdog

A scheduled task runs hourly inside the run window. It owns no work. For each free slot it checks whether there is a reason to run: a box slot needs at least one unchecked, unclaimed box that is free by its needs; the planner slot needs fewer than 3 open `[plan]` PRs. If so, it spawns a session tagged for that slot. This is what restarts a chain after a crash or a usage cutoff, and what starts the day. The spawned session takes the lease itself, so a failed spawn never holds a slot.

### The run window

Windows are measured by the clock, because a session cannot be sure when the provider's usage window started.

- Every day except Wednesday: the window opens at 07:00 local time and closes 4 hours later. Past the close, no session starts a new box or spawns a successor, and the watchdog spawns nothing. The fifth hour is slack for work in flight.
- Wednesday: no close. The window runs until the reaper at 23:00.

### The reaper

A second scheduled task, which is not itself tagged `bridle`, runs at 11:00 local time on every day except Wednesday and at 23:00 on Wednesday. It lists recent sessions, keeps those tagged `bridle` that are running or idle, and archives them. It then pushes `released` to each slot branch. The slots make a runaway impossible by construction; the reaper is the backstop for a session that ignores its instructions. Archiving a session mid-box leaves a draft PR and a claim branch, which the resume rule picks up the next time a box session runs.

### The planner

When no box is free, nobody is idle: the planner reads the whole code base, `docs/` and the open and closed `[plan]` PRs, and looks for features, bugs and improvements. Each finding becomes its own `[plan]` PR, per the existing proposal rules, so a bug becomes a proposed fix box, never a code change. A closed `[plan]` PR was declined and is not refiled without something new. The planner stops filing when 3 `[plan]` PRs are open, so an unattended day cannot bury the user in review work. Because the user reviews and merges between runs, the next run finds new work: that is the loop.

## What was rejected

- Counting sessions with `list_sessions` and spawning when the count is low. It races, it needs the whole list (tens of kilobytes, mostly archived), and its tag filter is not available from inside a session.
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

The questions that need the user are in `docs/decisions.md`. The main ones: whether a session spawned by a scheduled task is allowed to spawn and archive sessions at all (it must be tried), the time zone, whether a clock window is close enough to the real usage window, and what happens to the existing morning and weekly schedules.

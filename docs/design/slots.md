# Scheduled workers: spending a day's usage with only the clock starting sessions

Status: proposal, for the user to workshop. The file keeps its first name so the PR history reads straight; it can be renamed when the note is accepted.

## Problem

Today one scheduled session takes one box each morning, and a weekly run takes boxes until the day's usage is spent. The user wants more of the usage window used: two box workers running through the working window, a planner that finds new work when the boxes run out, and a full day on Wednesday. The risks are a session that starts others without a brake, and the cost of building machinery to count sessions.

## Approach

Only the clock starts sessions. No session ever starts another, so nothing can multiply, and nothing has to count or kill sessions.

- **Box workers:** scheduled tasks on an hourly cron that run the `CLAUDE.md` procedure for one box and exit. Two workers, offset by half an hour. Their prompt does not look at other sessions: it fetches, takes the topmost free box with the atomic `box/<ID>` claim push, lands it, files its proposals, and exits. If nothing is free it changes nothing and says why.
- **The run window is the cron expression.** On every day except Wednesday the workers fire at the top and bottom of each hour from 07:00 to 10:30, so nothing starts after the window is 4 hours old, and the fifth hour is slack for work in flight. On Wednesday they fire from 00:01 to 22:31 and work in flight finishes by about 23:00. Cron expressions are written with the user's time zone in the task configuration, which this repo does not record.
- **The planner:** one scheduled task, daily, after the box window on weekdays. It exits at once if 3 or more `[plan]` PRs are open. Otherwise it reads new comments on open PRs and `[plan]` PRs first, turns the ones that call for a plan change into proposals or replies, and then does the day's focus (below).
- **Concurrency is not capped by a lock.** Claims are atomic, so two workers can never take the same box, however many are running. Two triggers start at most two sessions an hour. A box that overruns its hour lets a third session start in the worst case, and that session takes a different free box or exits.
- **Cut-off boxes** are picked up by the existing 6-hour resume rule. That rule is a weak liveness test (a branch's last commit time says when the session last pushed, not whether it is alive), which is why nothing here counts sessions with it.

## The planner's focus

The day of the week picks the focus, and no state is stored, because the focus is computed from the date:

- Every day, comments on open PRs come first.
- Thursday is structure day: the planner proposes how to divide the code base into areas (by directory, layer or feature; the heuristic is its to propose and the user's to accept) and records the list in `docs/design/areas.md`.
- Every other day alternates between a feature session that proposes new work and a review session of one area, taking the areas in order. The area for a given day is the count of days since the list was merged, modulo the number of areas.

Each finding becomes its own `[plan]` PR under the existing proposal rules, so a bug becomes a proposed fix box, never a code change. A closed `[plan]` PR was declined and is not refiled without something new.

## What was rejected

- **Slots:** leases held as `slot/*` branches, with a heartbeat, handoff to a successor session, a watchdog and a reaper. The lease race works on the real remote, but the design needs sessions to start sessions, and a hand trial found that hard. See below. The mechanism stays an option if hourly gaps between boxes turn out to cost too much; the boxes are short and merging is the real limit, so it is not worth building now.
- **A reaper that archives tagged sessions.** It exists to stop runaway chains, and with no chains there is nothing to stop. It would also kill work mid-box and needs a permission rule that auto mode can still deny.
- **Counting live sessions, from the session list or from claim branches.** The list is large and its tag filter does not work from inside a session. Claim branch age is a weak liveness signal, and claims make the count unnecessary.

## What was tried

A hand trial on 2026-10-20.

- A race on a scratch `slot/` branch: create and fast-forward pushes succeeded, and a second push on the same parent was rejected. Deleting a remote branch from a session fails (the connection is dropped), so branches created this way cannot be cleaned up by sessions.
- Sessions created through the session API in auto mode had their own session calls and shell commands blocked by the permission classifier. Sessions started by a scheduled task did full box work unattended.
- The session list's tag filter is rejected from inside a session; rows carry their `tags`, so filtering client-side works. An archive call was allowed once and denied once.
- Scheduled sessions report a five-hour rate-limit window with a reset time; API-created and interactive sessions report a promotional limit that resets weeks away. What the promotional limit is, and whether those sessions draw from the same allowance as scheduled ones, is not known.

## How we will know it works

No eval scenario, since nothing here is harness behavior. The first Wednesday is the test. Afterward, check: was any box claimed twice (it cannot be), how many workers ran at once, how many boxes landed against how many sessions started, how much went to proposals nobody wanted, and what the usage page says each kind of session cost.

## Open points

The questions that need the user are in `docs/decisions.md`.

# Working in this repo

Bridle is a self-hosted personal agent: a harness plus a phone-friendly web app. `docs/architecture.md` is the design, `PLAN.md` is the work queue, `docs/decisions.md` holds open questions and settled answers.

## A session's shape

Sessions are short and unscheduled; they often run on whatever usage is left at the end of a window, and can be cut off. So:

1. Read `PLAN.md` and take the topmost unchecked box that isn't blocked. One box per session.
2. Push a branch and open a **draft PR** as soon as there is a first commit, and keep the PR description current: what's done, what's left, anything surprising. If the session is cut off, the draft PR is the handoff.
3. Finish with tests and the build green, the box checked in `PLAN.md` within the same PR, and the PR marked ready.
4. Never merge your own PR. The user merges.
5. If a box needs a decision from the user, add the question with a recommendation to `docs/decisions.md`, open that as its own small PR, and take the next box that doesn't depend on it.

If a box turns out too big for one session, split it into smaller boxes in `PLAN.md`, land the first, and leave the rest.

## Supervision: three kinds of change

- **Harness behavior** (context assembly, compaction, the goal model, the scheduler, the tool permission model, the key manager) starts with a **design note** in `docs/design/`, about a page: the problem, the approach, what was rejected and why, and how evals will tell if it works. The note is its own PR. Implementation waits until the user merges it. The user reviews ideas here, not diffs.
- **Implementation** of a merged design note: an ordinary PR with tests and, where the note says so, eval scenarios.
- **UI-only work**: an ordinary PR.

Anything under the key manager's code gets the label `needs-careful-review` and a PR description that names what the change could leak if it were wrong.

## The scrub rule

This repo is public. Nothing in it identifies a real person's machines, network or accounts: no real host names, domains, IP addresses, email addresses, usernames or file paths from anyone's computer. Examples use reserved names (`example.com`, `192.0.2.10`) and obviously fake secrets made of repeating patterns (`sk-test-1234abcd1234abcd`), never realistic-looking random strings. gitleaks runs in CI; it is a backstop, not the rule.

## Writing conventions

- US English.
- Markdown prose is never hard-wrapped: one line per paragraph or bullet.
- No Markdown tables; use bullet lists. Docs here are read as plain text.
- Comments explain why, not what.

## Engineering conventions

- Every adapter passes the shared contract suite. Every harness behavior with a design note has eval scenarios.
- Secrets reach the server only through environment variables or the key manager, never through config files in the repo.
- Keep it one process and one package until there is a measured reason not to.

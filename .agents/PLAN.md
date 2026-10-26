# Plan

The work queue. Read `CLAUDE.md` first: it says how a session picks, claims and finishes a box. The design lives in `docs/architecture.md`; open questions and settled answers live in `docs/decisions.md` (product) and `.agents/decisions.md` (process).

Every box is sized for one short session and lands as one PR. A box marked **design note** produces a document under `docs/design/` and nothing else.

A box marked **review** closes each phase. Its PR follows the proposal rules in `CLAUDE.md` (plan and docs only, no code) and also checks its own box. It compares the plan with what the phase actually built, fixes later boxes whose needs, sizing or wording no longer fit, splits the next phase's boxes down to one-session size, and adds boxes for gaps the phase turned up. It adds boxes only as far ahead as there is evidence for, mostly the next phase. It reads the open `[plan]` PRs first so it doesn't duplicate them. A box it thinks should go becomes a question in `docs/decisions.md`, or `.agents/decisions.md` if it is about process.

## Box IDs and needs

- Every box starts with an ID such as **P1.2**. An ID never changes and is never reused, even if the box is reworded, moved or split. Order in this file comes from position, not from the ID: a box added later takes the next unused number in its phase and goes wherever it belongs.
- Every box ends with what it needs, such as _needs P1.1, P1.3_. A box is free to take only when every ID it needs is checked on `main`. Boxes are checked inside their own PR, so checked on `main` means merged.
- _needs nothing_ means the box can be taken now. _needs every box above_ means every box above it in this file. A box with no needs written needs the box directly above it.
- _needs decision: Name_ means the box waits until the decision called Name is under Settled in `docs/decisions.md` or `.agents/decisions.md` on `main`.
- Boxes that implement a design note list the note's ID in their needs, so a note only holds up the work that depends on it.
- A blank line separates boxes, so two PRs checking off neighboring boxes merge without a conflict.

## Phase 0 — the repo builds and is guarded

- [x] **P0.1** Scaffold: Vite + React + Tailwind client, Hono server on Node, SQLite through Drizzle with a first migration, `npm test` (Vitest) and `npm run build` green. A page that shows a greeting fetched from the server. _needs nothing_

- [x] **P0.2** CI: a GitHub Actions workflow running lint, tests and build on every PR, plus gitleaks over the full history. _needs P0.1_

- [x] **P0.6** Move the process docs into `.agents/`, so how agents are managed is kept apart from the product: `PLAN.md`, the process entries of `docs/decisions.md` (product decisions such as the stack stay in `docs/`), `docs/design/slots.md`, and `docs/ops/` if P0.4 has landed. `CLAUDE.md` stays at the root, where sessions read it; update its paths and fetch commands, the paths it lets a `[plan]` PR change (adding process design notes under `.agents/`, so a scheduling note can ride in a `[plan]` PR), and every other reference. Open box branches still carry the old paths, so the PR says how a resuming session merges main. _needs nothing_

- [x] **P0.3** `LICENSE` (MIT), `.editorconfig`, a Dockerfile that builds and serves the app, and a `README.md` quickstart that has actually been run. _needs P0.1_

- [ ] **P0.4** Scheduled workers: the box-worker prompt and the two planner prompts (morning review, later feature) as files under `docs/ops/`, the cron expressions for the weekday and Wednesday windows and the planner runs, and the steps to install the tasks and disable the daily box and Wednesday evening tasks. _needs nothing_

- [ ] **P0.5** Rename Bridle to Brindle: code, docs, UI text, PWA manifest, package name, Docker image, container and volume names, the database file and the `BRIDLE_*` environment variables. An existing install keeps working: on startup the server renames `bridle.sqlite` to `brindle.sqlite` if only the old file exists, and reads an old `BRIDLE_*` variable with a warning when the new one is unset. The README says how to move an existing `bridle-data` volume. Renaming the GitHub repository is the user's step, listed in the PR. Best landed when few box PRs are open, since it touches most files. _needs nothing_

## Phase 1 — channels, on a scripted model

- [x] **P1.1** The shell: bottom navigation on narrow screens, a side rail on wide ones, with Channels, Goals, Feed and Artifacts. Empty state for each. PWA manifest and icons so it installs on a phone. _needs P0.1_

- [x] **P1.2** Storage: channels, runs and events tables. Create, rename, archive, restore and delete a channel. _needs P1.1_

- [x] **P1.3** The model adapter contract and a **scripted model** that replays canned responses from a fixture, including tool calls and failures. A contract test suite every adapter must pass, passing against the scripted model. _needs P0.1_

- [x] **P1.4** The run engine, minimal: a message starts a run, the loop calls the model, events persist and stream over SSE, cancel works, and the step, token and time limits end a run with a visible reason. _needs P1.2, P1.3_

- [x] **P1.8** Server wiring: `main.ts` builds a run engine from a model chosen by configuration (`BRIDLE_MODEL=scripted` with a fixture file path, for development and acceptance until real adapters land in P2.2), calls `recoverInterrupted()` at startup, and the README says how to try it. _needs P1.4_

- [x] **P1.7** The Channels screen: list, create, rename, archive, restore and delete channels from the UI; a channel view that sends a message, streams the run's events and shows a failed run's error in place. _needs P1.2, P1.4, P1.8_

- [ ] **P1.5** Acceptance: two channels with separate histories survive a server restart and a reload; a failed run shows its error in place and the channel keeps working. _needs P1.1, P1.4, P1.7, P1.8_

- [ ] **P1.6** **Review** of Phase 1. _needs P1.1, P1.2, P1.3, P1.4, P1.5, P1.7, P1.8_

## Phase 2 — real models, tools and artifacts

- [x] **P2.1** **Design note:** the tool registry and effect levels, the approval flow for external tools, and how tool results are sized before they go back to the model. _needs nothing_

- [x] **P2.2** Adapters: OpenAI-compatible chat completions and the Anthropic Messages API, both with streaming and tool calls, passing the contract suite against recorded fixtures so CI needs no key. _needs P1.2, P1.3_

- [ ] **P2.2a** Model choice per channel, keys from environment variables: a model setting on each channel, the server building the adapter from configuration, and the channel view showing which model it uses. `npm run evals -- --live` builds its model from the same configuration and drops `BRIDLE_EVAL_MODEL_MODULE`. _needs P2.2, P1.8, P2.5_

- [ ] **P2.3** Tools: the registry, `web_fetch` and `web_search`, with the approval card for external-effect tools (none of the first tools need it, but the path exists and is tested). _needs P2.1, P1.4_

- [ ] **P2.4** Artifacts: `create_artifact`, files on disk with metadata in SQLite, and the gallery screen (newest first, filter by kind and scope, each item linked to its run). _needs P2.3, P1.1_

- [x] **P2.5** Evals: the `evals/` runner, one scenario format, CI running all scenarios against the scripted model, and a manual command to run them against a real model. _needs P1.4, P0.2_

- [ ] **P2.6** **Review** of Phase 2. _needs P2.1, P2.2, P2.3, P2.4, P2.5_

## Phase 3 — long channels stay useful

- [ ] **P3.1** **Design note:** context assembly (the layers of a prompt and a token budget for each), the purpose card, rolling compaction (when it triggers, what it must keep, how a summary is revised), and the drift nudge. _needs P2.1_

- [ ] **P3.2** Context assembly with per-layer budgets, and a debug view showing exactly what a run sent. _needs P3.1, P1.4_

- [ ] **P3.3** Purpose cards: drafted after the first few exchanges, editable, sent with every run. _needs P3.2_

- [ ] **P3.4** Rolling compaction, with eval scenarios: facts, decisions and commitments planted early survive several rounds of compaction. _needs P3.2, P2.5_

- [ ] **P3.5** Drift nudge, with "move the last few messages to a new channel". _needs P3.3_

- [ ] **P3.6** **Review** of Phase 3. _needs P3.1, P3.2, P3.3, P3.4, P3.5_

## Phase 4 — goals and the scheduler

- [ ] **P4.1** **Design note:** the goal model (brief, versioned state document, schedules, channel), how schedules are stored and fire, what happens to runs missed while the server was down, and concurrency limits. _needs P2.1_

- [ ] **P4.2** The scheduler: persisted cron-like entries, survives restarts without double-firing, applies the missed-run policy, and keeps a log of what fired. _needs P4.1, P1.4_

- [ ] **P4.3** Goals: create, edit, archive; the goal's channel with its brief pinned; the Goals screen listing each goal with its next scheduled run. _needs P4.1, P1.2_

- [ ] **P4.4** The state document: `update_goal_state` with versions, shown as an artifact, readable and editable by the user, with history. _needs P4.3, P2.4_

- [ ] **P4.5** `propose_schedule` from plain words, confirmed by the user, with eval scenarios ("twice a day", "weekdays at 6:30", "every other Sunday"). _needs P4.2, P4.3, P2.3, P2.5_

- [ ] **P4.6** Goal templates behind the category buttons. _needs P4.3_

- [ ] **P4.7** Acceptance: "learn Rust" produces a curriculum held in the goal's state document, visible in the gallery, and a later lesson updates its progress. _needs P4.2, P4.4, P4.5, P2.2_

- [ ] **P4.8** **Review** of Phase 4. _needs P4.1, P4.2, P4.3, P4.4, P4.5, P4.6, P4.7_

## Phase 5 — the feed

- [ ] **P5.1** Feed items from scheduled runs: title, summary, link, date, source goal, deduplicated against existing items. _needs P4.2, P4.3_

- [ ] **P5.2** The feed screen with mark-read and per-goal filtering. _needs P5.1, P1.1_

- [ ] **P5.3** Atom feeds, overall and per goal, behind the token, and verified in a real RSS reader. _needs P5.1_

- [ ] **P5.4** Acceptance: a goal watching a public events-listing page fills the feed, a re-run adds only new entries, and the Atom feed shows them on a phone. _needs P5.2, P5.3, P2.3_

- [ ] **P5.5** **Review** of Phase 5. _needs P5.1, P5.2, P5.3, P5.4_

## Phase 6 — the key manager

- [ ] **P6.1** **Design note and threat model:** the vault's API, encryption and master-key handling, handles and how tools resolve them, scope rules, output scrubbing, the credential request flow, auditing, and the attacks the red-team suite must cover. Reviewed with extra care before anything is built. _needs P2.1_

- [ ] **P6.2** The vault: encrypted storage, the narrow API, master key outside the database, unit tests. _needs P6.1_

- [ ] **P6.3** Handles and scoped resolution inside tools, with refusal of out-of-scope hosts and tools, and the audit log. _needs P6.2, P2.3_

- [ ] **P6.4** Output scrubbing across tool results, model output, logs, artifacts and errors, including common encodings. _needs P6.2, P2.4_

- [ ] **P6.5** `request_credential`, the vault form, and detection of secrets pasted into chat. _needs P6.3, P6.4_

- [ ] **P6.6** The red-team suite: every attack named in the threat model as a test, all passing. _needs P6.3, P6.4, P6.5_

- [ ] **P6.7** An adversarial session: an agent given the codebase and told to make the vault leak, with every finding filed as an issue and fixed or answered. _needs P6.6_

- [ ] **P6.8** **Review** of Phase 6. _needs P6.1, P6.2, P6.3, P6.4, P6.5, P6.6, P6.7_

## Phase 7 — suggestions

- [ ] **P7.1** The suggestion run: reads goals, purpose cards and recent activity, proposes a few cards, at most daily, off switch in settings. _needs P4.2, P4.3, P3.3_

- [ ] **P7.2** Accept and dismiss: accept becomes a run, goal, schedule or credential request; dismissed cards are remembered. _needs P7.1, P4.5, P6.5_

- [ ] **P7.3** Eval scenarios: suggestions are relevant to the fixture's goals and never repeat a dismissed one. _needs P7.2, P2.5_

- [ ] **P7.4** **Review** of Phase 7. _needs P7.1, P7.2, P7.3_

## Phase 8 — briefs and notifications

- [ ] **P8.1** `speak`: text-to-speech through an OpenAI-compatible speech endpoint, saved as an audio artifact with a player in the gallery. _needs P2.3, P2.4_

- [ ] **P8.2** The daily digest: new feed items, goal check-ins, finished long runs, in-app and optionally to a webhook. _needs P5.1, P4.2_

- [ ] **P8.3** Web push, opt-in per goal or channel, nothing on by default. _needs P8.2_

- [ ] **P8.4** Acceptance: a "daily audio brief" goal produces a listenable brief each morning, and a fresh install notifies nothing until the user opts in. _needs P8.1, P8.2, P8.3, P4.7_

- [ ] **P8.5** **Review** of Phase 8. _needs P8.1, P8.2, P8.3, P8.4_

## Phase 9 — plug-ins

- [ ] **P9.1** MCP client: configure MCP servers, their tools join the registry with an effect level the user assigns. _needs P2.3_

- [x] **P9.2** **Design note:** ACP delegates (spawning an external agent, mapping a run to its session, surfacing its permission requests as approval cards), after checking the protocol's current state. _needs P2.1_

- [ ] **P9.3** The ACP delegate tool, verified with one real coding agent. _needs P9.2, P2.3_

- [ ] **P9.4** **Review** of Phase 9. _needs P9.1, P9.2, P9.3_

## Acceptance (the whole thing)

- [ ] **A.1** Installed on a phone, channels, goals, the feed and artifacts are each one tap from the others. _needs every box above_

- [ ] **A.2** Two different model providers and one ACP agent are usable with configuration only. _needs every box above_

- [ ] **A.3** A goal that needs a login gets it through the request flow, uses it on schedule, and the red-team suite still passes. _needs every box above_

- [ ] **A.4** A month of daily use produces no notification the user didn't ask for. _needs every box above_

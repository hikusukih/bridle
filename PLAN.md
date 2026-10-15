# Plan

The work queue. Read `CLAUDE.md` first, then take the topmost unchecked box that isn't blocked. The design lives in `docs/architecture.md`; open questions and settled answers live in `docs/decisions.md`.

Every box is sized for one short session and lands as one PR. A box marked **design note** produces a document under `docs/design/` and nothing else; the boxes after it are blocked until the user merges that note.

## Phase 0 — the repo builds and is guarded

- [x] Scaffold: Vite + React + Tailwind client, Hono server on Node, SQLite through Drizzle with a first migration, `npm test` (Vitest) and `npm run build` green. A page that shows a greeting fetched from the server.
- [x] CI: a GitHub Actions workflow running lint, tests and build on every PR, plus gitleaks over the full history.
- [x] `LICENSE` (MIT), `.editorconfig`, a Dockerfile that builds and serves the app, and a `README.md` quickstart that has actually been run.

## Phase 1 — channels, on a scripted model

- [ ] The shell: bottom navigation on narrow screens, a side rail on wide ones, with Channels, Goals, Feed and Artifacts. Empty state for each. PWA manifest and icons so it installs on a phone.
- [ ] Storage: channels, runs and events tables. Create, rename, archive, restore and delete a channel.
- [ ] The model adapter contract and a **scripted model** that replays canned responses from a fixture, including tool calls and failures. A contract test suite every adapter must pass, passing against the scripted model.
- [ ] The run engine, minimal: a message starts a run, the loop calls the model, events persist and stream over SSE, cancel works, and the step, token and time limits end a run with a visible reason.
- [ ] Acceptance: two channels with separate histories survive a server restart and a reload; a failed run shows its error in place and the channel keeps working.

## Phase 2 — real models, tools and artifacts

- [ ] **Design note:** the tool registry and effect levels, the approval flow for external tools, and how tool results are sized before they go back to the model.
- [ ] Adapters: OpenAI-compatible chat completions and the Anthropic Messages API, both with streaming and tool calls, passing the contract suite against recorded fixtures so CI needs no key. Model choice per channel, keys from environment variables.
- [ ] Tools: the registry, `web_fetch` and `web_search`, with the approval card for external-effect tools (none of the first tools need it, but the path exists and is tested).
- [ ] Artifacts: `create_artifact`, files on disk with metadata in SQLite, and the gallery screen (newest first, filter by kind and scope, each item linked to its run).
- [ ] Evals: the `evals/` runner, one scenario format, CI running all scenarios against the scripted model, and a manual command to run them against a real model.

## Phase 3 — long channels stay useful

- [ ] **Design note:** context assembly (the layers of a prompt and a token budget for each), the purpose card, rolling compaction (when it triggers, what it must keep, how a summary is revised), and the drift nudge.
- [ ] Context assembly with per-layer budgets, and a debug view showing exactly what a run sent.
- [ ] Purpose cards: drafted after the first few exchanges, editable, sent with every run.
- [ ] Rolling compaction, with eval scenarios: facts, decisions and commitments planted early survive several rounds of compaction.
- [ ] Drift nudge, with "move the last few messages to a new channel".

## Phase 4 — goals and the scheduler

- [ ] **Design note:** the goal model (brief, versioned state document, schedules, channel), how schedules are stored and fire, what happens to runs missed while the server was down, and concurrency limits.
- [ ] The scheduler: persisted cron-like entries, survives restarts without double-firing, applies the missed-run policy, and keeps a log of what fired.
- [ ] Goals: create, edit, archive; the goal's channel with its brief pinned; the Goals screen listing each goal with its next scheduled run.
- [ ] The state document: `update_goal_state` with versions, shown as an artifact, readable and editable by the user, with history.
- [ ] `propose_schedule` from plain words, confirmed by the user, with eval scenarios ("twice a day", "weekdays at 6:30", "every other Sunday").
- [ ] Goal templates behind the category buttons.
- [ ] Acceptance: "learn Rust" produces a curriculum held in the goal's state document, visible in the gallery, and a later lesson updates its progress.

## Phase 5 — the feed

- [ ] Feed items from scheduled runs: title, summary, link, date, source goal, deduplicated against existing items.
- [ ] The feed screen with mark-read and per-goal filtering.
- [ ] Atom feeds, overall and per goal, behind the token, and verified in a real RSS reader.
- [ ] Acceptance: a goal watching a public events-listing page fills the feed, a re-run adds only new entries, and the Atom feed shows them on a phone.

## Phase 6 — the key manager

- [ ] **Design note and threat model:** the vault's API, encryption and master-key handling, handles and how tools resolve them, scope rules, output scrubbing, the credential request flow, auditing, and the attacks the red-team suite must cover. Reviewed with extra care before anything is built.
- [ ] The vault: encrypted storage, the narrow API, master key outside the database, unit tests.
- [ ] Handles and scoped resolution inside tools, with refusal of out-of-scope hosts and tools, and the audit log.
- [ ] Output scrubbing across tool results, model output, logs, artifacts and errors, including common encodings.
- [ ] `request_credential`, the vault form, and detection of secrets pasted into chat.
- [ ] The red-team suite: every attack named in the threat model as a test, all passing.
- [ ] An adversarial session: an agent given the codebase and told to make the vault leak, with every finding filed as an issue and fixed or answered.

## Phase 7 — suggestions

- [ ] The suggestion run: reads goals, purpose cards and recent activity, proposes a few cards, at most daily, off switch in settings.
- [ ] Accept and dismiss: accept becomes a run, goal, schedule or credential request; dismissed cards are remembered.
- [ ] Eval scenarios: suggestions are relevant to the fixture's goals and never repeat a dismissed one.

## Phase 8 — briefs and notifications

- [ ] `speak`: text-to-speech through an OpenAI-compatible speech endpoint, saved as an audio artifact with a player in the gallery.
- [ ] The daily digest: new feed items, goal check-ins, finished long runs, in-app and optionally to a webhook.
- [ ] Web push, opt-in per goal or channel, nothing on by default.
- [ ] Acceptance: a "daily audio brief" goal produces a listenable brief each morning, and a fresh install notifies nothing until the user opts in.

## Phase 9 — plug-ins

- [ ] MCP client: configure MCP servers, their tools join the registry with an effect level the user assigns.
- [ ] **Design note:** ACP delegates (spawning an external agent, mapping a run to its session, surfacing its permission requests as approval cards), after checking the protocol's current state.
- [ ] The ACP delegate tool, verified with one real coding agent.

## Acceptance (the whole thing)

- [ ] Installed on a phone, channels, goals, the feed and artifacts are each one tap from the others.
- [ ] Two different model providers and one ACP agent are usable with configuration only.
- [ ] A goal that needs a login gets it through the request flow, uses it on schedule, and the red-team suite still passes.
- [ ] A month of daily use produces no notification the user didn't ask for.

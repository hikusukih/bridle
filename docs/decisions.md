# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Text-to-speech provider.** Recommend an OpenAI-compatible speech endpoint, so a local TTS server and a hosted one are interchangeable.
- **Master key for the vault.** Recommend a key file outside the data directory with owner-only permissions, its path set by an environment variable, with an OS keychain as a later option. Decided in the Phase 6 design note.

## Settled

- Public repo, MIT license.
- Stack: TypeScript throughout, React + Vite + Tailwind PWA, Hono on Node, SQLite through Drizzle, SSE, Vitest, Docker. The most standard choice, so any agent can pick it up cold.
- Work happens in Claude Code on the web sessions, which push a branch and open a PR. The user merges; sessions never merge their own PRs.
- The plan lives in this repo (`PLAN.md`), not anywhere else.
- The plan changes through `[plan]` proposal PRs kept apart from box work, so an idea that turns up mid-box is recorded and offered, not acted on or lost when the session ends. Each phase ends with a review box.
- Scheduled sessions work the queue unattended, started only by the clock (`docs/design/slots.md`): two box-worker tasks an hour, offset by half an hour, from 07:00 to 10:30 on most days and from 00:01 to 22:31 on Wednesday, plus two planner runs a day. The window follows the clock, not the provider's five-hour window, and the time zone lives in the task configuration. The old daily box task and Wednesday evening task are disabled the day the new tasks go on. Whether scheduled and interactive sessions share a usage meter doesn't change this: the aim is to use more of the allowance than before, not all of it. Boxes have stable IDs and explicit needs, and a pushed `box/<ID>` branch is the claim, so sessions never take the same box. GitHub Issues were rejected: the plan would live in two places, and plan changes would stop showing up as PR diffs.
- The harness is ours; models are pluggable behind an adapter, and external agents plug in as ACP delegates.
- The agent may ask for logins. Credentials go through the key manager, which is held to a higher bar than the rest of the code.
- The planner runs twice a day: a morning session reviews the day's area of the code base, and a session hours later proposes one feature or fleshes out an existing one. Both share a cap of 3 open `[plan]` PRs. Each starts by reading new comments on open PRs and answers every one with an action or a recorded deferred action, so no comment is left open. The planner runs on Opus or better, and on Fable only when there is spare promotional usage; the model is set in the task configuration.
- Name: Brindle. Several AI-agent tools already use Bridle, and Bindle is a WebAssembly package system; no software named Brindle turned up. The rename is box P0.5, proposed in #20.
- Where it runs: the Docker image on an always-on host, reached over a private network or a reverse proxy the operator already runs. Nothing in the code assumes a particular host.
- Default models: one strong model for conversation and goal planning, and one cheap or local model for watchers and summaries, chosen per scope in configuration. Models are reached through the OpenAI-style API first, since one adapter then covers local servers such as Ollama and hosted models alike (P2.2); the adapter contract (P1.3) is the interface that keeps other providers from becoming a big refactor. Running the harness itself on cloud compute is not built now.

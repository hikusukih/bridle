# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Name.** Working name Bridle: a bridle is how a rider steers a much stronger animal with light, simple input, which is the job of a harness meant to be easy to use. Alternatives in the same spirit: tiller, halter, reins, toyboat, bumper-car. Renaming is a search-and-replace while the repo is young.
- **Where it runs.** Schedules only fire while the server is up, so it wants an always-on host. Recommend the Docker image on whatever always-on machine is available, reached over a private network or a reverse proxy the operator already runs. Nothing in the code assumes a particular host.
- **Default models.** Recommend one strong model for conversation and goal planning, and one cheap or local model for watchers and summaries, chosen per scope in configuration.
- **Text-to-speech provider.** Recommend an OpenAI-compatible speech endpoint, so a local TTS server and a hosted one are interchangeable.
- **Master key for the vault.** Recommend a key file outside the data directory with owner-only permissions, its path set by an environment variable, with an OS keychain as a later option. Decided in the Phase 6 design note.
- **Using leftover weekly quota.** A scheduled cloud session shortly before the weekly usage reset could take one box with whatever quota is left. Decide once Phase 1 shows boxes can be picked up cold.

## Settled

- Public repo, MIT license.
- Stack: TypeScript throughout, React + Vite + Tailwind PWA, Hono on Node, SQLite through Drizzle, SSE, Vitest, Docker. The most standard choice, so any agent can pick it up cold.
- Work happens in Claude Code on the web sessions, which push a branch and open a PR. The user merges; sessions never merge their own PRs.
- The plan lives in this repo (`PLAN.md`), not anywhere else.
- The harness is ours; models are pluggable behind an adapter, and external agents plug in as ACP delegates.
- The agent may ask for logins. Credentials go through the key manager, which is held to a higher bar than the rest of the code.

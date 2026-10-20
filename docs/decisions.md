# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Scheduled workers.** Two hourly box-worker tasks and one daily planner task, started only by the clock, as described in `docs/design/slots.md`. Recommend adopting it; box P0.4 waits on this.
- **Scheduled workers: the window.** Non-Wednesday days start workers at the top and bottom of each hour from 07:00 to 10:30; Wednesday from 00:01 to 22:31. The window follows the clock, not the provider's real five-hour window, which starts at the first request and may start earlier. Recommend the clock now. The time zone belongs in the task configuration, not in the repo.
- **Scheduled workers: two usage pools?** Scheduled sessions report a five-hour limit and API-created or interactive sessions report a promotional one resetting on 2026-11-05. Recommend checking the usage page for whether they share a meter before relying on Wednesday to drain the weekly allowance.
- **Scheduled workers: replacing the old tasks.** The daily box task and the Wednesday evening task would be disabled when the new tasks go on. Recommend disabling them the same day, not running both.
- **Scheduled workers: planner timing.** Recommend one planner run a day at midday, which on weekdays is after the box window closes and on Wednesday overlaps it. It stops at 3 open `[plan]` PRs, so overlap does little harm.
- **Planner focus.** Comments on open PRs every day; Thursday divides the code base into areas and records them; other days alternate feature proposals and review of one area, chosen from the date. Recommend this, with the division heuristic left to the Thursday session to propose.
- **Name.** Working name Bridle: a bridle is how a rider steers a much stronger animal with light, simple input, which is the job of a harness meant to be easy to use. Alternatives in the same spirit: tiller, halter, reins, toyboat, bumper-car. Renaming is a search-and-replace while the repo is young.
- **Where it runs.** Schedules only fire while the server is up, so it wants an always-on host. Recommend the Docker image on whatever always-on machine is available, reached over a private network or a reverse proxy the operator already runs. Nothing in the code assumes a particular host.
- **Default models.** Recommend one strong model for conversation and goal planning, and one cheap or local model for watchers and summaries, chosen per scope in configuration.
- **Text-to-speech provider.** Recommend an OpenAI-compatible speech endpoint, so a local TTS server and a hosted one are interchangeable.
- **Master key for the vault.** Recommend a key file outside the data directory with owner-only permissions, its path set by an environment variable, with an OS keychain as a later option. Decided in the Phase 6 design note.

## Settled

- Public repo, MIT license.
- Stack: TypeScript throughout, React + Vite + Tailwind PWA, Hono on Node, SQLite through Drizzle, SSE, Vitest, Docker. The most standard choice, so any agent can pick it up cold.
- Work happens in Claude Code on the web sessions, which push a branch and open a PR. The user merges; sessions never merge their own PRs.
- The plan lives in this repo (`PLAN.md`), not anywhere else.
- The plan changes through `[plan]` proposal PRs kept apart from box work, so an idea that turns up mid-box is recorded and offered, not acted on or lost when the session ends. Each phase ends with a review box.
- Scheduled sessions work the queue unattended: one box every morning, and a weekly run that takes boxes until the remaining usage is spent. Boxes have stable IDs and explicit needs, and a pushed `box/<ID>` branch is the claim, so sessions never take the same box. GitHub Issues were rejected: the plan would live in two places, and plan changes would stop showing up as PR diffs.
- The harness is ours; models are pluggable behind an adapter, and external agents plug in as ACP delegates.
- The agent may ask for logins. Credentials go through the key manager, which is held to a higher bar than the rest of the code.

# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Slots.** Run up to three sessions at once (two box workers, one planner) using leases held as `slot/*` branches, with a watchdog, a run window and a reaper, as described in `docs/design/slots.md`. Recommend adopting it. Boxes P0.4 to P0.6 wait on this.
- **Slots: staleness and heartbeat.** A slot is takeable 90 minutes after its last heartbeat, and holders beat at least every 30 minutes of work. Too short and a slow box loses its lease to a second session; too long and a dead chain sits idle. Recommend 90 and 30, then adjust after the first Wednesday.
- **Slots: time zone and window.** The run window is measured by the clock in the user's time zone (open at 07:00, close 4 hours later, no close on Wednesday, reaper at 11:00 or 23:00). The provider's real usage window starts at the first request, which may be earlier than 07:00. Recommend the clock window now, and replacing it with the usage window if the session can read it (the session metadata has a rate-limit block whose contents are unconfirmed). The time zone itself is for the user to state; it must not be committed with anything that identifies them.
- **Slots: can scheduled sessions spawn and archive sessions?** The design assumes a session can create sessions, tag them and archive them, and that a scheduled run can do the same. Unconfirmed, and permissions may be narrower for unattended runs. Recommend a hand-run trial of the watchdog and reaper before relying on either.
- **Slots: the existing schedules.** The Settled entry about one box every morning and a weekly run would be replaced by the watchdog. Recommend replacing them once the watchdog has run for a week, and moving that entry to a line saying so.
- **Planner scope and cost.** The planner reads the whole code base, which is expensive, and stops at 3 open `[plan]` PRs. Recommend rotating its focus (code, docs, tests, UX) by day so it does not reread everything every time, and recording the focus in each proposal PR.

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

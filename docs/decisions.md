# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Text-to-speech provider.** Recommend an OpenAI-compatible speech endpoint, so a local TTS server and a hosted one are interchangeable.
- **The optional cost budget on runs.** `docs/architecture.md` promises "an optional cost budget" beside the step, token and time limits, but no box implements it and the run engine has no notion of price. Recommend dropping the words from the architecture until a real need shows up, and relying on the token limit (which the engine enforces today) for scheduled work; a price needs a per-model rate table that goes stale. If the user wants it, add a box after P2.2a that takes a rate per million tokens in model configuration and stops a run as "cost limit reached".
- **Master key for the vault.** Recommend a key file outside the data directory with owner-only permissions, its path set by an environment variable, with an OS keychain as a later option. Decided in the Phase 6 design note.

## Settled

- Public repo, MIT license.
- Stack: TypeScript throughout, React + Vite + Tailwind PWA, Hono on Node, SQLite through Drizzle, SSE, Vitest, Docker. The most standard choice, so any agent can pick it up cold.
- The harness is ours; models are pluggable behind an adapter, and external agents plug in as ACP delegates.
- The agent may ask for logins. Credentials go through the key manager, which is held to a higher bar than the rest of the code.
- Name: Brindle. Several AI-agent tools already use Bridle, and Bindle is a WebAssembly package system; no software named Brindle turned up. The rename is box P0.5, proposed in #20.
- Where it runs: the Docker image on an always-on host, reached over a private network or a reverse proxy the operator already runs. Nothing in the code assumes a particular host.
- Default models: one strong model for conversation and goal planning, and one cheap or local model for watchers and summaries, chosen per scope in configuration. Models are reached through the OpenAI-style API first, since one adapter then covers local servers such as Ollama and hosted models alike (P2.2); the adapter contract (P1.3) is the interface that keeps other providers from becoming a big refactor.

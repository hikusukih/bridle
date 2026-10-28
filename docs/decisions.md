# Decisions

Open questions first, each with a recommendation. A session that hits a question not listed here adds it with a recommendation and moves on to work that doesn't depend on it. Settled decisions move to the bottom with the reason, one line each.

## Open

- **Text-to-speech provider.** Recommend an OpenAI-compatible speech endpoint, so a local TTS server and a hosted one are interchangeable.
- **Web search provider.** Recommend a self-hosted SearXNG-style JSON endpoint named by an environment variable, with `web_search` registered only when it is set, because it needs no key and nothing about the user's queries goes to a third party by default. A hosted API (Brave, Tavily and the like) can be added later as a second backend behind the same tool if SearXNG proves unreliable. Box P2.3 lands this as `BRINDLE_SEARCH_URL`; closing this question confirms it.
- **Master key for the vault.** Recommend a key file outside the data directory with owner-only permissions, its path set by an environment variable, with an OS keychain as a later option. Decided in the Phase 6 design note.

- **Backup and restore.** Everything a user would grieve to lose (channels, goal state documents, artifacts, the vault) lives in one data directory on one host. Recommend documenting, not building, a first answer: a README section saying to stop the server or use SQLite's online backup for the database and copy the artifacts directory alongside it, and, once the vault exists, to back up its key file separately from the data directory so that a stolen backup does not open the vault. A built-in export can follow if the manual steps prove error-prone.

## Settled

- Public repo, MIT license.
- Stack: TypeScript throughout, React + Vite + Tailwind PWA, Hono on Node, SQLite through Drizzle, SSE, Vitest, Docker. The most standard choice, so any agent can pick it up cold.
- The harness is ours; models are pluggable behind an adapter, and external agents plug in as ACP delegates.
- The agent may ask for logins. Credentials go through the key manager, which is held to a higher bar than the rest of the code.
- Name: Brindle. Several AI-agent tools already use Bridle, and Bindle is a WebAssembly package system; no software named Brindle turned up. The rename landed as box P0.5.
- Where it runs: the Docker image on an always-on host, reached over a private network or a reverse proxy the operator already runs. Nothing in the code assumes a particular host.
- Default models: one strong model for conversation and goal planning, and one cheap or local model for watchers and summaries, chosen per **scope** in configuration. Models are reached through the OpenAI-style API first, since one adapter then covers local servers such as Ollama and hosted models alike (P2.2); the adapter contract (P1.3) is the interface that keeps other providers from becoming a big refactor.

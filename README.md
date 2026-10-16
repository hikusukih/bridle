# Bridle

A self-hosted personal agent with a calm, phone-friendly home: persistent **channels** for conversations, **goals** that keep their own state and act on a schedule, a **feed** of what scheduled work found (also published as RSS), one gallery of **artifacts**, and opt-in **suggestions**. Models are pluggable; credentials go through a key manager that keeps them out of the model's sight.

Early and under construction. The design is in `docs/architecture.md` and the work queue is `PLAN.md`.

## Quickstart

Node 22 or newer. `npm ci && npm run build && npm start`, then open http://127.0.0.1:8787. The page shows a greeting fetched from the server. Data lives in `./data`.

With Docker: `docker build -t bridle .`, then `docker run --rm -p 127.0.0.1:8787:8787 -v bridle-data:/data bridle` and open http://127.0.0.1:8787. The image listens on all interfaces inside the container, so publish the port on loopback as shown unless you have put something in front of it; there is no login yet.

## Development

Node 22 or newer. `npm install`, then `npm run dev` starts the server on port 8787 and Vite on port 5173 with `/api` proxied to the server. `npm test` runs Vitest; `npm run lint` runs Biome (`npm run lint:fix` applies its safe fixes); `npm run build` then `npm start` serves the built app from one process. Data lives in `./data` unless `BRIDLE_DATA_DIR` says otherwise. After changing `src/server/db/schema.ts`, run `npm run db:generate` to add a migration; migrations apply on startup.

License: MIT.

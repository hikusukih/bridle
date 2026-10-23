# Bridle

[![CI](https://github.com/hikusukih/bridle/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hikusukih/bridle/actions/workflows/ci.yml)

A self-hosted personal agent with a calm, phone-friendly home: persistent **channels** for conversations, **goals** that keep their own state and act on a schedule, a **feed** of what scheduled work found (also published as RSS), one gallery of **artifacts**, and opt-in **suggestions**. Models are pluggable; credentials go through a key manager that keeps them out of the model's sight.

Early and under construction. The design is in `docs/architecture.md` and the work queue is `PLAN.md`.

## Quickstart with Docker

Clone this repository, then from its root:

```sh
docker build -t bridle .
docker run -d --name bridle --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  -v bridle-data:/data \
  bridle
```

Open `http://127.0.0.1:8787`. The page shows a greeting from the server and the time it first started.

- Bridle has no login yet. Inside the container it listens on all interfaces so Docker can forward to it, which is why the `-p` above publishes it on the host's loopback only. Don't publish it more widely until authentication lands.
- Everything Bridle keeps lives in the `bridle-data` volume, mounted at `/data`. Removing the container keeps it; `docker volume rm bridle-data` deletes it.
- To upgrade, pull the new code, rebuild the image, then `docker rm -f bridle` and run the same `docker run` again. Database migrations apply on startup.
- The image runs as an unprivileged user and needs no compiler: the SQLite driver's prebuilt binaries cover amd64 and arm64.

## Quickstart from source

Node 22 or newer.

```sh
npm install
npm run build
npm start
```

Open `http://127.0.0.1:8787`. Data lives in `./data` unless `BRIDLE_DATA_DIR` says otherwise; `PORT` and `HOST` change where it listens (loopback by default).

### Trying runs with the scripted model

Until the real model adapters land, set `BRIDLE_MODEL=scripted` and `BRIDLE_SCRIPTED_FIXTURE` to a JSON file of canned turns to make sending a message work. Without `BRIDLE_MODEL`, starting a run answers 503.

```sh
cat > fixture.json <<'JSON'
{ "turns": [{ "text": ["Hello ", "from the scripted model."], "usage": { "inputTokens": 5, "outputTokens": 6 } }] }
JSON
BRIDLE_MODEL=scripted BRIDLE_SCRIPTED_FIXTURE=fixture.json npm start
```

Each turn answers one model call and the script does not loop, so a fixture of N turns serves N calls across all runs until the server restarts. Runs left working by a previous process are marked failed at startup.

## Development

`npm run dev` starts the server on port 8787 and Vite on port 5173 with `/api` proxied to the server. `npm test` runs Vitest; `npm run lint` runs Biome (`npm run lint:fix` applies its safe fixes). After changing `src/server/db/schema.ts`, run `npm run db:generate` to add a migration; migrations apply on startup.

## License

MIT; see `LICENSE`.

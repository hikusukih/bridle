import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp, recordFirstStart } from "./app.js";
import { openDatabase } from "./db/index.js";
import { modelFromEnv } from "./model/config.js";
import { RunEngine } from "./runs.js";

const dataDir = resolve(process.env.BRIDLE_DATA_DIR ?? "data");
// Single user and no auth yet, so stay on loopback unless the operator says otherwise.
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

mkdirSync(dataDir, { recursive: true });
const db = openDatabase(join(dataDir, "bridle.sqlite"));
recordFirstStart(db);

// Resolves to the package root from both src/server and dist/server.
const builtClient = fileURLToPath(new URL("../../dist/client", import.meta.url));
// Only the scripted model exists until P2.2; with no model configured, starting a run answers 503.
const model = modelFromEnv(process.env);
const engine = model ? new RunEngine(db, model) : undefined;
const recovered = engine?.recoverInterrupted() ?? 0;
if (recovered > 0) console.log(`Marked ${recovered} interrupted run(s) as failed.`);
const app = createApp({ db, engine, clientRoot: existsSync(builtClient) ? builtClient : undefined });

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Bridle listening on http://${info.address}:${info.port}`);
});

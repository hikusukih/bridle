import { serve } from "@hono/node-server";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, recordFirstStart } from "./app.js";
import { openDatabase } from "./db/index.js";

const dataDir = resolve(process.env.BRIDLE_DATA_DIR ?? "data");
// Single user and no auth yet, so stay on loopback unless the operator says otherwise.
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8787);

mkdirSync(dataDir, { recursive: true });
const db = openDatabase(join(dataDir, "bridle.sqlite"));
recordFirstStart(db);

// Resolves to the package root from both src/server and dist/server.
const builtClient = fileURLToPath(new URL("../../dist/client", import.meta.url));
const app = createApp({ db, clientRoot: existsSync(builtClient) ? builtClient : undefined });

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Bridle listening on http://${info.address}:${info.port}`);
});

import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Db } from "./db/index.js";
import { appMeta } from "./db/schema.js";

export type Greeting = {
  message: string;
  since: string;
};

type AppOptions = {
  db: Db;
  // Built client to serve; absent in development, where Vite serves it.
  clientRoot?: string;
};

export function createApp({ db, clientRoot }: AppOptions) {
  const app = new Hono();

  app.get("/api/greeting", (c) => {
    const row = db.select().from(appMeta).where(eq(appMeta.key, "first_started_at")).get();
    const greeting: Greeting = {
      message: "Hello from Bridle.",
      since: row?.value ?? new Date().toISOString(),
    };
    return c.json(greeting);
  });

  if (clientRoot) {
    app.use("/*", serveStatic({ root: clientRoot }));
    // Unknown paths fall back to the app shell so client-side routes survive a reload.
    app.get("*", serveStatic({ root: clientRoot, path: "index.html" }));
  }

  return app;
}

export function recordFirstStart(db: Db, now = new Date()) {
  db.insert(appMeta)
    .values({ key: "first_started_at", value: now.toISOString() })
    .onConflictDoNothing()
    .run();
}

import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import {
  archiveChannel,
  ChannelError,
  createChannel,
  deleteChannel,
  listChannels,
  renameChannel,
  restoreChannel,
} from "./channels.js";
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

  app.onError((err, c) => {
    if (err instanceof ChannelError) {
      const status = err.code === "not_found" ? 404 : err.code === "archived" ? 409 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    throw err;
  });

  const nameFrom = async (c: Context) => {
    const body = await c.req.json().catch(() => ({}));
    return (body as { name?: unknown }).name;
  };

  app.get("/api/channels", (c) => c.json(listChannels(db, { archived: c.req.query("archived") === "true" })));
  app.post("/api/channels", async (c) => c.json(createChannel(db, await nameFrom(c)), 201));
  app.patch("/api/channels/:id", async (c) => c.json(renameChannel(db, c.req.param("id"), await nameFrom(c))));
  app.post("/api/channels/:id/archive", (c) => c.json(archiveChannel(db, c.req.param("id"))));
  app.post("/api/channels/:id/restore", (c) => c.json(restoreChannel(db, c.req.param("id"))));
  app.delete("/api/channels/:id", (c) => {
    deleteChannel(db, c.req.param("id"));
    return c.body(null, 204);
  });

  if (clientRoot) {
    app.use("/*", serveStatic({ root: clientRoot }));
    // Unknown paths fall back to the app shell so client-side routes survive a reload.
    app.get("*", serveStatic({ root: clientRoot, path: "index.html" }));
  }

  return app;
}

export function recordFirstStart(db: Db, now = new Date()) {
  db.insert(appMeta).values({ key: "first_started_at", value: now.toISOString() }).onConflictDoNothing().run();
}

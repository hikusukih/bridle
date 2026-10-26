import { serveStatic } from "@hono/node-server/serve-static";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
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
import { channelTranscript, type RunEngine, RunError, type RunEvent } from "./runs.js";

export type Greeting = {
  message: string;
  since: string;
};

type AppOptions = {
  db: Db;
  // Absent until a real adapter is configured; starting a run then answers 503.
  engine?: RunEngine;
  // Built client to serve; absent in development, where Vite serves it.
  clientRoot?: string;
};

export function createApp({ db, engine, clientRoot }: AppOptions) {
  const app = new Hono();

  app.get("/api/greeting", (c) => {
    const row = db.select().from(appMeta).where(eq(appMeta.key, "first_started_at")).get();
    const greeting: Greeting = {
      message: "Hello from Brindle.",
      since: row?.value ?? new Date().toISOString(),
    };
    return c.json(greeting);
  });

  app.onError((err, c) => {
    if (err instanceof ChannelError) {
      const status = err.code === "not_found" ? 404 : err.code === "archived" ? 409 : 400;
      return c.json({ error: err.code, message: err.message }, status);
    }
    if (err instanceof RunError) {
      const status = err.code === "not_found" ? 404 : err.code === "invalid_text" ? 400 : 409;
      return c.json({ error: err.code, message: err.message }, status);
    }
    if (err instanceof HTTPException) return err.getResponse();
    throw err;
  });

  const needEngine = () => {
    if (!engine) throw new HTTPException(503, { message: "No model is configured." });
    return engine;
  };

  app.get("/api/channels/:id/runs", (c) => c.json(channelTranscript(db, c.req.param("id"))));
  app.post("/api/channels/:id/runs", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    return c.json(needEngine().start(c.req.param("id"), body.text), 201);
  });
  app.get("/api/runs/:id", (c) => c.json(needEngine().get(c.req.param("id"))));
  app.post("/api/runs/:id/cancel", (c) => c.json(needEngine().cancel(c.req.param("id"))));

  // Replays stored events, then follows the live run. A reconnecting client sends Last-Event-ID (the last seq it saw).
  app.get("/api/runs/:id/events", (c) => {
    const runEngine = needEngine();
    const after = Number(c.req.header("last-event-id") ?? c.req.query("after") ?? 0) || 0;
    const queue: (RunEvent | null)[] = [];
    let wake: (() => void) | undefined;
    const { backlog, done, unsubscribe } = runEngine.subscribe(c.req.param("id"), after, (e) => {
      queue.push(e);
      wake?.();
    });
    return streamSSE(c, async (stream) => {
      stream.onAbort(unsubscribe);
      const send = (e: RunEvent) => stream.writeSSE({ id: String(e.seq), event: e.type, data: e.data });
      for (const e of backlog) await send(e);
      let finished = done;
      while (!finished) {
        while (queue.length) {
          const e = queue.shift();
          if (e) await send(e);
          else finished = true;
        }
        if (!finished) await new Promise<void>((resolve) => (wake = resolve));
      }
      unsubscribe();
      await stream.writeSSE({
        event: "end",
        data: JSON.stringify({ status: runEngine.get(c.req.param("id")).status }),
      });
    });
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

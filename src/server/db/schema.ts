import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Small facts about this install, such as when it first started.
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Timestamps are ISO 8601 strings so they sort lexically and read cleanly in the database.
export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  // Null while the channel is live; archiving hides it and makes it read-only, restoring clears it.
  archivedAt: text("archived_at"),
  // A model spec such as "openai:gpt-4o"; null means the server's default model.
  model: text("model"),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    // running | done | failed | cancelled | stopped; the run engine (P1.4) owns the transitions.
    status: text("status").notNull(),
    // The visible reason a run ended, such as which limit it hit.
    stopReason: text("stop_reason"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
  },
  (t) => [index("runs_channel_idx").on(t.channelId, t.startedAt)],
);

// One row per step of a run. seq orders events within a run and lets a reconnecting SSE client resume after the last one it saw.
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    // message | text | tool_call | tool_result | artifact | error
    type: text("type").notNull(),
    // JSON payload; its shape depends on type.
    data: text("data").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("events_run_seq_idx").on(t.runId, t.seq)],
);

// One row per model request: what assembly counted and, for the most recent runs of a channel, the exact messages sent.
export const contextReports = sqliteTable(
  "context_reports",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    // JSON ContextReport.
    report: text("report").notNull(),
    // JSON Message[]; set to null once the run falls out of the channel's most recent 20.
    messages: text("messages"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("context_reports_channel_idx").on(t.channelId, t.createdAt),
    index("context_reports_run_idx").on(t.runId, t.step),
  ],
);

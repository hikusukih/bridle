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

// A goal's recurring task. goal_id is a plain id until the goals table exists (P4.3); the scheduler never looks inside it.
export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull(),
  // Five fields, read in the user's time zone.
  cron: text("cron").notNull(),
  prompt: text("prompt").notNull(),
  // channel in Phase 4; feed and digest arrive later as new values.
  destination: text("destination").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  nextFireAt: text("next_fire_at"),
  // catch_up_once | skip
  missedPolicy: text("missed_policy").notNull(),
  createdAt: text("created_at").notNull(),
});

// Both the waiting list and the log of what fired. The unique index makes double-firing an occurrence impossible.
export const scheduleFires = sqliteTable(
  "schedule_fires",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    dueAt: text("due_at").notNull(),
    // waiting | started | missed | skipped_busy | failed_to_start
    state: text("state").notNull(),
    runId: text("run_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("schedule_fires_due_idx").on(t.scheduleId, t.dueAt)],
);

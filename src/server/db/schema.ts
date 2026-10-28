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

// An ongoing project with its own channel. The brief lives in scope_cards; the state document arrives with P4.4.
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  // active | archived
  status: text("status").notNull(),
  // Deleting the channel deletes the goal, since a goal without its channel has nowhere to run.
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// A channel's purpose card and a goal's brief share this table: append-only versions, the highest is current.
export const scopeCards = sqliteTable(
  "scope_cards",
  {
    id: text("id").primaryKey(),
    // channel | goal
    scopeKind: text("scope_kind").notNull(),
    scopeId: text("scope_id").notNull(),
    version: integer("version").notNull(),
    text: text("text").notNull(),
    // user | agent
    author: text("author").notNull(),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("scope_cards_version_idx").on(t.scopeKind, t.scopeId, t.version)],
);

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Small facts about this install, such as when it first started. Domain tables arrive with their own boxes.
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { scopeCards } from "./db/schema.js";

// See docs/design/context.md: a purpose card and a goal brief are one table and two kinds.
type Stored = typeof scopeCards.$inferSelect;
export type PurposeCard = Stored & { kind: "purpose" };
export type GoalBrief = Stored & { kind: "goal_brief" };
export type ScopeCard = PurposeCard | GoalBrief;

/** Characters in a brief: the context note's 500-token cap at four characters a token. */
export const briefMaxChars = 2_000;

/**
 * What may be written. The types are the rule: a goal brief only ever gets a user's confirmed text, so an
 * agent's draft has no way to save one; a purpose card may be drafted by the agent.
 */
export type CardWrite =
  | { scopeKind: "goal"; scopeId: string; text: string; author: "user"; confirmed: true }
  | { scopeKind: "channel"; scopeId: string; text: string; author: "user" | "agent"; confirmed: boolean };

export class ScopeCardError extends Error {
  constructor(
    readonly code: "invalid_text" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

function tag(row: Stored): ScopeCard {
  return row.scopeKind === "goal" ? { ...row, kind: "goal_brief" } : { ...row, kind: "purpose" };
}

export function cardVersions(db: Db, scopeKind: "channel" | "goal", scopeId: string): ScopeCard[] {
  return db
    .select()
    .from(scopeCards)
    .where(and(eq(scopeCards.scopeKind, scopeKind), eq(scopeCards.scopeId, scopeId)))
    .orderBy(asc(scopeCards.version))
    .all()
    .map(tag);
}

export function currentCard(db: Db, scopeKind: "channel" | "goal", scopeId: string): ScopeCard | undefined {
  const row = db
    .select()
    .from(scopeCards)
    .where(and(eq(scopeCards.scopeKind, scopeKind), eq(scopeCards.scopeId, scopeId)))
    .orderBy(desc(scopeCards.version))
    .get();
  return row && tag(row);
}

export function writeCard(db: Db, write: CardWrite, now = new Date()): ScopeCard {
  const text = write.text.trim();
  if (!text) throw new ScopeCardError("invalid_text", "A brief can't be empty.");
  if (write.scopeKind === "goal" && text.length > briefMaxChars)
    throw new ScopeCardError("invalid_text", `A brief is at most ${briefMaxChars} characters.`);
  const row: Stored = {
    id: randomUUID(),
    scopeKind: write.scopeKind,
    scopeId: write.scopeId,
    version: (currentCard(db, write.scopeKind, write.scopeId)?.version ?? 0) + 1,
    text,
    author: write.author,
    confirmed: write.confirmed,
    createdAt: now.toISOString(),
  };
  db.insert(scopeCards).values(row).run();
  return tag(row);
}

/** Restoring writes an earlier version again as a new one, so history only grows. */
export function restoreCard(db: Db, scopeKind: "channel" | "goal", scopeId: string, version: number, now = new Date()) {
  const old = cardVersions(db, scopeKind, scopeId).find((c) => c.version === version);
  if (!old) throw new ScopeCardError("not_found", "No such version.");
  // A restore is the user's act, so it is confirmed whoever wrote the old text.
  return writeCard(db, { scopeKind, scopeId, text: old.text, author: "user", confirmed: true } as CardWrite, now);
}

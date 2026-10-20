import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { getChannel } from "./channels.js";
import type { Db } from "./db/index.js";
import { events, runs } from "./db/schema.js";
import { type Message, type ModelAdapter, ModelError, type ToolCall } from "./model/adapter.js";

export type Run = typeof runs.$inferSelect;
export type RunEvent = typeof events.$inferSelect;

export type RunLimits = {
  /** Model calls in one run. */
  maxSteps: number;
  /** Input plus output tokens summed over the run. */
  maxTokens: number;
  maxMillis: number;
};

export const defaultLimits: RunLimits = { maxSteps: 10, maxTokens: 100_000, maxMillis: 120_000 };

export class RunError extends Error {
  constructor(
    readonly code: "not_found" | "busy" | "invalid_text" | "finished",
    message: string,
  ) {
    super(message);
  }
}

type Listener = (event: RunEvent | null) => void;

/** Owns the live side of runs: abort handles and SSE subscribers. Persistence stays in the database. */
export class RunEngine {
  private readonly active = new Map<string, AbortController>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly settled = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Db,
    private readonly model: ModelAdapter,
    private readonly limits: RunLimits = defaultLimits,
  ) {}

  /** Runs left "running" by a previous process can never finish; say so instead of leaving them spinning. */
  recoverInterrupted(now = new Date()): number {
    const stale = this.db.select().from(runs).where(eq(runs.status, "running")).all();
    for (const run of stale) {
      this.append(run.id, "error", { message: "The server restarted while this run was working." }, now);
      this.finish(run.id, "failed", "server restarted", now);
    }
    return stale.length;
  }

  start(channelId: string, text: unknown, now = new Date()): Run {
    const channel = getChannel(this.db, channelId);
    if (channel.archivedAt) throw new RunError("busy", "Restore the channel before sending a message.");
    const message = typeof text === "string" ? text.trim() : "";
    if (!message) throw new RunError("invalid_text", "A message can't be empty.");
    const running = this.db.select().from(runs).where(eq(runs.channelId, channelId)).all();
    if (running.some((r) => r.status === "running"))
      throw new RunError("busy", "This channel is still working on a message.");

    const history = this.history(channelId);
    const run: Run = {
      id: randomUUID(),
      channelId,
      status: "running",
      stopReason: null,
      startedAt: now.toISOString(),
      endedAt: null,
    };
    this.db.insert(runs).values(run).run();
    this.append(run.id, "message", { text: message }, now);

    const controller = new AbortController();
    this.active.set(run.id, controller);
    this.settled.set(run.id, this.loop(run.id, [...history, { role: "user", content: message }], controller));
    return run;
  }

  /** Resolves once the run's loop has ended; tests use it instead of sleeping. */
  whenSettled(runId: string): Promise<void> {
    return this.settled.get(runId) ?? Promise.resolve();
  }

  cancel(runId: string): Run {
    const run = this.get(runId);
    if (run.status !== "running") throw new RunError("finished", "This run has already ended.");
    this.active.get(runId)?.abort(new CancelledByUser());
    return run;
  }

  get(runId: string): Run {
    const run = this.db.select().from(runs).where(eq(runs.id, runId)).get();
    if (!run) throw new RunError("not_found", "No such run.");
    return run;
  }

  /**
   * Stored events after `after`, plus an unsubscribe. Reading and subscribing happen in one
   * synchronous step so no event can fall between the replay and the live feed.
   */
  subscribe(
    runId: string,
    after: number,
    onEvent: Listener,
  ): { backlog: RunEvent[]; done: boolean; unsubscribe: () => void } {
    const run = this.get(runId);
    const all = this.db.select().from(events).where(eq(events.runId, runId)).orderBy(asc(events.seq)).all();
    const backlog = all.filter((e) => e.seq > after);
    if (run.status !== "running") return { backlog, done: true, unsubscribe: () => {} };
    const set = this.listeners.get(runId) ?? new Set();
    set.add(onEvent);
    this.listeners.set(runId, set);
    return { backlog, done: false, unsubscribe: () => set.delete(onEvent) };
  }

  private history(channelId: string): Message[] {
    const channelRuns = this.db
      .select()
      .from(runs)
      .where(eq(runs.channelId, channelId))
      .orderBy(asc(runs.startedAt))
      .all();
    if (!channelRuns.length) return [];
    const rows = this.db
      .select()
      .from(events)
      .where(
        inArray(
          events.runId,
          channelRuns.map((r) => r.id),
        ),
      )
      .orderBy(asc(events.seq))
      .all();
    const byRun = new Map<string, RunEvent[]>();
    for (const e of rows) byRun.set(e.runId, [...(byRun.get(e.runId) ?? []), e]);
    const messages: Message[] = [];
    for (const run of channelRuns) {
      for (const e of byRun.get(run.id) ?? []) {
        if (e.type !== "message" && e.type !== "text") continue;
        const { text } = JSON.parse(e.data) as { text: string };
        messages.push({ role: e.type === "message" ? "user" : "assistant", content: text });
      }
    }
    return messages;
  }

  private async loop(runId: string, messages: Message[], controller: AbortController): Promise<void> {
    const { maxSteps, maxTokens, maxMillis } = this.limits;
    const timer = setTimeout(() => controller.abort(new TimeLimit()), maxMillis);
    let tokens = 0;
    try {
      for (let step = 1; ; step++) {
        let text = "";
        const calls: ToolCall[] = [];
        let stop: string | undefined;
        for await (const ev of this.model.stream({ messages: [...messages], signal: controller.signal })) {
          if (ev.type === "text") text += ev.text;
          else if (ev.type === "tool_call") calls.push(ev.call);
          else {
            stop = ev.stop;
            tokens += ev.usage.inputTokens + ev.usage.outputTokens;
          }
        }
        if (text) this.append(runId, "text", { text });
        messages.push({ role: "assistant", content: text, toolCalls: calls.length ? calls : undefined });

        if (stop !== "tool_use" || !calls.length) {
          // A reply cut off by the model's own length cap is still an answer, but the user should know.
          if (stop === "length") return this.finish(runId, "stopped", "the model hit its output length limit");
          return this.finish(runId, "done", null);
        }
        for (const call of calls) {
          this.append(runId, "tool_call", { id: call.id, name: call.name, arguments: call.arguments });
          // The tool registry arrives with P2.3; until then every call is answered as unknown so the loop stays whole.
          const result = `Error: no tool named ${call.name} is available.`;
          this.append(runId, "tool_result", { id: call.id, name: call.name, result, isError: true });
          messages.push({ role: "tool", toolCallId: call.id, content: result });
        }
        if (tokens >= maxTokens) return this.stopForLimit(runId, `token limit (${maxTokens}) reached`);
        if (step >= maxSteps) return this.stopForLimit(runId, `step limit (${maxSteps}) reached`);
      }
    } catch (error) {
      const cause = controller.signal.reason;
      if (cause instanceof CancelledByUser) return this.finish(runId, "cancelled", "cancelled by you");
      if (cause instanceof TimeLimit) return this.stopForLimit(runId, `time limit (${maxMillis / 1000}s) reached`);
      const message = error instanceof ModelError ? error.message : "Something went wrong inside the server.";
      this.append(runId, "error", { message, ...(error instanceof ModelError ? { kind: error.kind } : {}) });
      this.finish(runId, "failed", message);
    } finally {
      clearTimeout(timer);
    }
  }

  private stopForLimit(runId: string, reason: string) {
    this.append(runId, "error", { message: `Stopped: ${reason}.`, kind: "limit" });
    this.finish(runId, "stopped", reason);
  }

  private append(runId: string, type: string, payload: object, now = new Date()): RunEvent {
    const last = this.db
      .select({ seq: events.seq })
      .from(events)
      .where(eq(events.runId, runId))
      .orderBy(asc(events.seq))
      .all()
      .at(-1);
    const row: RunEvent = {
      id: randomUUID(),
      runId,
      seq: (last?.seq ?? 0) + 1,
      type,
      data: JSON.stringify(payload),
      createdAt: now.toISOString(),
    };
    this.db.insert(events).values(row).run();
    for (const listener of this.listeners.get(runId) ?? []) listener(row);
    return row;
  }

  private finish(runId: string, status: Run["status"], stopReason: string | null, now = new Date()) {
    this.db.update(runs).set({ status, stopReason, endedAt: now.toISOString() }).where(eq(runs.id, runId)).run();
    this.active.delete(runId);
    for (const listener of this.listeners.get(runId) ?? []) listener(null);
    this.listeners.delete(runId);
  }
}

class CancelledByUser extends Error {}
class TimeLimit extends Error {}

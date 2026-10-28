import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db/index.js";
import { events, runs, scheduleFires, schedules } from "./db/schema.js";

// See docs/design/goals.md. Starting values, tuned from the log.
const hour = 60 * 60 * 1000;

export type Schedule = typeof schedules.$inferSelect;
export type Fire = typeof scheduleFires.$inferSelect;
export type MissedPolicy = "catch_up_once" | "skip";

export type SchedulerOptions = {
  /** The user's IANA time zone; every cron expression is read in it. */
  timeZone: string;
  pollMillis?: number;
  /** How late an occurrence may still run, whether it was missed or is waiting for room. */
  graceMillis?: number;
  /** Scheduled runs at once across the server. */
  maxConcurrent?: number;
};

export type SchedulerHooks = {
  /** Inside the transaction that marks a fire started: create the run's row and return its id. Nothing may run yet. */
  prepareRun(schedule: Schedule, fire: Fire): string;
  /** After that transaction commits: let the prepared run go. */
  beginRun(runId: string): void;
  /** True while the goal has a run going, scheduled or the user's, including one waiting on an approval. */
  goalBusy(goalId: string): boolean;
};

export class SchedulerError extends Error {}

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly pollMillis: number;
  private readonly graceMillis: number;
  private readonly maxConcurrent: number;

  constructor(
    private readonly db: Db,
    private readonly hooks: SchedulerHooks,
    private readonly options: SchedulerOptions,
  ) {
    this.pollMillis = options.pollMillis ?? 30_000;
    this.graceMillis = options.graceMillis ?? 6 * hour;
    this.maxConcurrent = options.maxConcurrent ?? 2;
  }

  createSchedule(
    args: { goalId: string; cron: string; prompt: string; missedPolicy?: MissedPolicy; enabled?: boolean },
    now = new Date(),
  ): Schedule {
    const next = this.after(args.cron, now);
    const row: Schedule = {
      id: randomUUID(),
      goalId: args.goalId,
      cron: args.cron,
      prompt: args.prompt,
      destination: "channel",
      enabled: args.enabled ?? true,
      nextFireAt: next.toISOString(),
      missedPolicy: args.missedPolicy ?? "catch_up_once",
      createdAt: now.toISOString(),
    };
    this.db.insert(schedules).values(row).run();
    return row;
  }

  /** Disabling stops new occurrences; enabling picks up from the next one after now, never from the time it was off. */
  setEnabled(scheduleId: string, enabled: boolean, now = new Date()) {
    const schedule = this.db.select().from(schedules).where(eq(schedules.id, scheduleId)).get();
    if (!schedule) throw new SchedulerError("No such schedule.");
    const nextFireAt = enabled ? this.after(schedule.cron, now).toISOString() : null;
    this.db.update(schedules).set({ enabled, nextFireAt }).where(eq(schedules.id, scheduleId)).run();
  }

  /** What fired, oldest first. */
  log(scheduleId?: string): Fire[] {
    const query = this.db.select().from(scheduleFires);
    return (scheduleId ? query.where(eq(scheduleFires.scheduleId, scheduleId)) : query)
      .orderBy(asc(scheduleFires.dueAt), asc(scheduleFires.createdAt))
      .all();
  }

  /**
   * Run once at startup, before the first poll. A fire left "started" whose run never wrote an event
   * crashed between commit and beginning; it is recorded, not retried, so the worst case is one missed run.
   */
  recover(now = new Date()): number {
    const started = this.db.select().from(scheduleFires).where(eq(scheduleFires.state, "started")).all();
    let failed = 0;
    for (const fire of started) {
      const began =
        fire.runId !== null &&
        this.db.select({ id: events.id }).from(events).where(eq(events.runId, fire.runId)).limit(1).get();
      if (began) continue;
      this.db
        .update(scheduleFires)
        .set({ state: "failed_to_start", updatedAt: now.toISOString() })
        .where(eq(scheduleFires.id, fire.id))
        .run();
      failed++;
    }
    this.tick(now);
    return failed;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => this.tick(), this.pollMillis);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One poll: bring due occurrences in as fires, then start what there is room for. */
  tick(now = new Date()) {
    this.comeDue(now);
    this.startWaiting(now);
  }

  private after(cron: string, from: Date): Date {
    let next: Date | null;
    try {
      next = new Cron(cron, { timezone: this.options.timeZone, paused: true }).nextRun(from);
    } catch (error) {
      throw new SchedulerError(`"${cron}" is not a schedule I can read: ${(error as Error).message}`);
    }
    if (!next) throw new SchedulerError(`"${cron}" never comes due.`);
    return next;
  }

  private comeDue(now: Date) {
    const due = this.db.select().from(schedules).where(eq(schedules.enabled, true)).all();
    for (const schedule of due) {
      if (!schedule.nextFireAt || schedule.nextFireAt > now.toISOString()) continue;
      const occurrences: Date[] = [];
      let at = new Date(schedule.nextFireAt);
      // Capped so a once-a-minute schedule on a host that slept for months can't spin.
      while (at <= now && occurrences.length < 10_000) {
        occurrences.push(at);
        at = this.after(schedule.cron, at);
      }
      const last = occurrences.at(-1) as Date;
      const onTime = occurrences.length === 1 && now.getTime() - last.getTime() <= 2 * this.pollMillis;
      const runsLast =
        onTime || (schedule.missedPolicy === "catch_up_once" && now.getTime() - last.getTime() <= this.graceMillis);
      const next = this.after(schedule.cron, now);
      const stamp = now.toISOString();

      this.db.transaction((tx) => {
        for (const occurrence of occurrences) {
          const isLast = occurrence === last;
          if (isLast && runsLast) {
            // At most one waiting fire per schedule: a newer one replaces an older that never got room.
            tx.update(scheduleFires)
              .set({ state: "skipped_busy", updatedAt: stamp })
              .where(and(eq(scheduleFires.scheduleId, schedule.id), eq(scheduleFires.state, "waiting")))
              .run();
          }
          tx.insert(scheduleFires)
            .values({
              id: randomUUID(),
              scheduleId: schedule.id,
              dueAt: occurrence.toISOString(),
              state: isLast && runsLast ? "waiting" : "missed",
              runId: null,
              createdAt: stamp,
              updatedAt: stamp,
            })
            .onConflictDoNothing()
            .run();
        }
        tx.update(schedules).set({ nextFireAt: next.toISOString() }).where(eq(schedules.id, schedule.id)).run();
      });
    }
  }

  private startWaiting(now: Date) {
    const waiting = this.db
      .select()
      .from(scheduleFires)
      .where(eq(scheduleFires.state, "waiting"))
      .orderBy(asc(scheduleFires.dueAt))
      .all();
    let inFlight = this.scheduledRunning();
    const claimed = new Set<string>();
    for (const fire of waiting) {
      const stamp = now.toISOString();
      const schedule = this.db.select().from(schedules).where(eq(schedules.id, fire.scheduleId)).get();
      if (!schedule) continue;
      if (now.getTime() - new Date(fire.dueAt).getTime() > this.graceMillis) {
        this.mark(fire.id, "skipped_busy", stamp);
        continue;
      }
      if (inFlight >= this.maxConcurrent || claimed.has(schedule.goalId) || this.hooks.goalBusy(schedule.goalId))
        continue;
      let runId = "";
      this.db.transaction((tx) => {
        runId = this.hooks.prepareRun(schedule, fire);
        tx.update(scheduleFires)
          .set({ state: "started", runId, updatedAt: stamp })
          .where(eq(scheduleFires.id, fire.id))
          .run();
      });
      claimed.add(schedule.goalId);
      inFlight++;
      this.hooks.beginRun(runId);
    }
  }

  /** Scheduled runs using compute: started fires whose run is going. One parked on an approval uses none and doesn't count. */
  private scheduledRunning(): number {
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(scheduleFires)
      .innerJoin(runs, eq(runs.id, scheduleFires.runId))
      .where(and(eq(scheduleFires.state, "started"), inArray(runs.status, ["running"])))
      .get();
    return row?.n ?? 0;
  }

  private mark(fireId: string, state: Fire["state"], stamp: string) {
    this.db.update(scheduleFires).set({ state, updatedAt: stamp }).where(eq(scheduleFires.id, fireId)).run();
  }
}

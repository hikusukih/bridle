import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

/**
 * The project was called Bridle before Brindle. An install that still sets BRIDLE_* variables keeps
 * working: each is copied to its BRINDLE_ name when that is unset, with a warning so the operator
 * renames it. Mutates `env` so everything downstream reads only the new names.
 */
export function applyLegacyEnv(
  env: Record<string, string | undefined>,
  warn: (message: string) => void = console.warn,
): void {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("BRIDLE_") || value === undefined) continue;
    const next = `BRINDLE_${name.slice("BRIDLE_".length)}`;
    if (env[next] !== undefined) continue;
    warn(`${name} is deprecated; rename it to ${next}.`);
    env[next] = value;
  }
}

/**
 * Renames bridle.sqlite (and SQLite's -wal and -shm companions) to brindle.sqlite when only the old
 * file exists, so an existing data directory or volume carries over. Never overwrites a new database.
 */
export function migrateLegacyDatabase(dataDir: string, warn: (message: string) => void = console.warn): void {
  const oldPath = join(dataDir, "bridle.sqlite");
  const newPath = join(dataDir, "brindle.sqlite");
  if (!existsSync(oldPath) || existsSync(newPath)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(oldPath + suffix)) renameSync(oldPath + suffix, newPath + suffix);
  }
  warn("Renamed bridle.sqlite to brindle.sqlite.");
}

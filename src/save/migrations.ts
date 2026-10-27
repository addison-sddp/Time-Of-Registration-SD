import { isSaveV1, type SaveV1 } from "./schema";

export const CURRENT_SCHEMA_VERSION = 1;

type Raw = Record<string, unknown>;

// Pure step functions. migrations[n - 1] turns a version n object into version n + 1, and
// must set schema_version itself. v1 is the initial schema, so the list is empty (DESIGN 6.5).
export type Migration = (old: Raw) => Raw;
export const migrations: readonly Migration[] = [];

export type MigrateResult =
  | { status: "ok"; save: SaveV1 }
  | { status: "newer_version"; found_version: number } // refused: the caller must not overwrite it
  | { status: "invalid"; reason: string };

const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

// Applies steps in order from `from` up to `to`; null if a step is missing.
export function applyMigrations(raw: Raw, from: number, to: number, steps: readonly Migration[]): Raw | null {
  let current = raw;
  for (let v = from; v < to; v++) {
    const step = steps[v - 1];
    if (step === undefined) return null;
    current = step(current);
  }
  return current;
}

// Reads schema_version first, then migrates and validates. Never throws and never mutates raw.
export function migrate(raw: unknown): MigrateResult {
  if (!isRaw(raw)) return { status: "invalid", reason: "not an object" };
  const version = raw["schema_version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { status: "invalid", reason: "missing or bad schema_version" };
  }
  if (version > CURRENT_SCHEMA_VERSION) return { status: "newer_version", found_version: version };

  let migrated: Raw | null;
  try {
    migrated = applyMigrations(raw, version, CURRENT_SCHEMA_VERSION, migrations);
  } catch {
    return { status: "invalid", reason: "migration failed" };
  }
  if (migrated === null) return { status: "invalid", reason: "no migration path" };
  return isSaveV1(migrated)
    ? { status: "ok", save: migrated }
    : { status: "invalid", reason: "does not match the save schema" };
}

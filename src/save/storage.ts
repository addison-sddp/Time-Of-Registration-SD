import { CURRENT_SCHEMA_VERSION, migrate } from "./migrations";
import type { SaveV1 } from "./schema";

export const SAVE_KEY = "tors.save";
// Holds the latest unreadable save that a newer save replaced; overwritten each time.
export const BACKUP_KEY = "tors.save.unreadable";

// Anything shaped like the browser's key-value store. The caller injects it (or nothing,
// when storage is missing), so this module never reaches for a global.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const MESSAGES = {
  newer_version: "Save data was created by a newer version and was not loaded.",
  invalid: "Save data could not be read and was not loaded.",
  unavailable: "Saving is not available. The game will run without saving.",
} as const;

export type LoadResult =
  | { status: "empty" } // nothing stored yet
  | { status: "loaded"; save: SaveV1 }
  | { status: "newer_version"; message: string } // refused; storage untouched
  | { status: "invalid"; message: string } // unreadable; load leaves it be, and the next save first copies it to BACKUP_KEY
  | { status: "unavailable"; message: string }; // storage missing or throwing; play without saving

export type WriteResult =
  | { status: "saved" }
  | { status: "refused"; message: string } // stored data is from a newer version; not overwritten
  | { status: "unavailable"; message: string };

export interface SaveStore {
  load(): LoadResult;
  save(save: SaveV1): WriteResult;
  clear(): WriteResult;
}

const unavailable = { status: "unavailable", message: MESSAGES.unavailable } as const;

// Version of whatever is stored, or null if it cannot be determined.
function storedVersion(text: string): number | null {
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== "object" || v === null) return null;
    const n = (v as Record<string, unknown>)["schema_version"];
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

// True if the text parses and migrates to a valid save.
function isReadable(text: string): boolean {
  try {
    return migrate(JSON.parse(text)).status === "ok";
  } catch {
    return false;
  }
}

export function createSaveStore(storage: StorageLike | null | undefined): SaveStore {
  // Every write path first looks at what is stored, so a newer version's data is never
  // overwritten or removed, even if load() was never called.
  // With backupUnreadable (save only), unreadable stored text is copied byte-for-byte to
  // BACKUP_KEY before anything is written. If that copy fails, nothing is written.
  function guardedWrite(write: (s: StorageLike) => void, backupUnreadable: boolean): WriteResult {
    if (!storage) return unavailable;
    try {
      const existing = storage.getItem(SAVE_KEY);
      if (existing !== null) {
        const version = storedVersion(existing);
        if (version !== null && version > CURRENT_SCHEMA_VERSION) {
          return { status: "refused", message: MESSAGES.newer_version };
        }
        if (backupUnreadable && !isReadable(existing)) storage.setItem(BACKUP_KEY, existing);
      }
      write(storage);
      return { status: "saved" };
    } catch {
      return unavailable;
    }
  }

  return {
    load() {
      if (!storage) return unavailable;
      let text: string | null;
      try {
        text = storage.getItem(SAVE_KEY);
      } catch {
        return unavailable;
      }
      if (text === null) return { status: "empty" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { status: "invalid", message: MESSAGES.invalid };
      }
      const result = migrate(parsed);
      if (result.status === "ok") return { status: "loaded", save: result.save };
      if (result.status === "newer_version") return { status: "newer_version", message: MESSAGES.newer_version };
      return { status: "invalid", message: MESSAGES.invalid };
    },
    save: (save) => guardedWrite((s) => s.setItem(SAVE_KEY, JSON.stringify(save)), true),
    clear: () => guardedWrite((s) => s.removeItem(SAVE_KEY), false),
  };
}

// A new save needs a random salt. Randomness is injected, never drawn here; in the browser
// pass (bytes) => crypto.getRandomValues(bytes). Returns 32 hex characters.
export function makeSaveSalt(fillRandom: (bytes: Uint8Array) => void): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

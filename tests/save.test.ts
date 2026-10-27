import { describe, expect, test } from "vitest";
import {
  applyMigrations, BACKUP_KEY, createSaveStore, CURRENT_SCHEMA_VERSION, isSaveV1, makeSaveSalt, MESSAGES, migrate, migrations,
  newSave, SAVE_KEY, type SaveV1, type StorageLike,
} from "../src/save";
import { shifts } from "../src/data";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  writes = 0;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes++;
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.writes++;
    this.data.delete(key);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("denied");
  }
  setItem(): void {
    throw new Error("quota");
  }
  removeItem(): void {
    throw new Error("denied");
  }
}

class WriteOnlyThrows extends MemoryStorage {
  override setItem(): void {
    throw new Error("quota");
  }
}

const fresh = (): SaveV1 => newSave("salt-1", "2026-10-27T12:00:00Z");

describe("newSave", () => {
  test("is a valid v1 save with the documented defaults", () => {
    const s = fresh();
    expect(isSaveV1(s)).toBe(true);
    expect(s.schema_version).toBe(1);
    expect(s.save_salt).toBe("salt-1");
    expect(s.created_at).toBe("2026-10-27T12:00:00Z");
    expect(s.progress).toEqual({ current_shift_id: shifts[0]!.shift_id, completed_shift_ids: [], attempt_number: 1 });
    expect(s.decision_log).toEqual([]);
    expect(s.desk_layout).toEqual({});
    expect(s.flags).toEqual({});
  });
  test("stores no rules, calendar or applicants", () => {
    const text = JSON.stringify(fresh());
    for (const word of ["rule", "calendar", "election", "applicant", "application"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
    expect(Object.keys(fresh()).sort()).toEqual(
      ["created_at", "decision_log", "desk_layout", "economy", "flags", "progress", "save_salt", "schema_version", "settings"],
    );
  });
  test("each call returns independent objects", () => {
    const a = fresh();
    a.progress.completed_shift_ids.push("s01");
    expect(fresh().progress.completed_shift_ids).toEqual([]);
  });
});

describe("shape validation", () => {
  test("accepts a fully populated save", () => {
    const s = fresh();
    s.desk_layout["flag"] = { x: 10, y: 20 };
    s.flags["seen"] = true;
    s.decision_log.push({
      shift_id: "s01", application_id: "s01-a01", as_of: "2025-10-01", player_decision: "deny",
      engine_verdict: "deny", violated_rule_ids: ["R2_RESIDENCY"], attempt_number: 2,
    });
    expect(isSaveV1(s)).toBe(true);
  });
  test.each([
    ["null", null],
    ["array", []],
    ["string", "save"],
    ["no version", { ...fresh(), schema_version: undefined }],
    ["wrong salt type", { ...fresh(), save_salt: 5 }],
    ["missing progress", { ...fresh(), progress: undefined }],
    ["attempt 0", { ...fresh(), progress: { ...fresh().progress, attempt_number: 0 } }],
    ["fractional attempt", { ...fresh(), progress: { ...fresh().progress, attempt_number: 1.5 } }],
    ["NaN balance", { ...fresh(), economy: { balance: NaN, balance_at_shift_start: 0 } }],
    ["bad setting", { ...fresh(), settings: { text_scale: "big", audio_volume: 1, reduced_motion: false } }],
    ["bad desk item", { ...fresh(), desk_layout: { flag: { x: 1 } } }],
    ["bad log entry", { ...fresh(), decision_log: [{ shift_id: "s01" }] }],
    ["bad decision", { ...fresh(), decision_log: [{ shift_id: "s", application_id: "a", as_of: "2025-10-01", player_decision: "maybe", engine_verdict: "deny", violated_rule_ids: [], attempt_number: 1 }] }],
    ["non-boolean flag", { ...fresh(), flags: { a: 1 } }],
  ])("rejects %s", (_name, value) => {
    expect(isSaveV1(value)).toBe(false);
  });
});

describe("migrate", () => {
  test("v1 is current and the migration list is empty", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(migrations.length).toBe(CURRENT_SCHEMA_VERSION - 1);
  });
  test("a v1 save passes through unchanged", () => {
    const s = fresh();
    const r = migrate(JSON.parse(JSON.stringify(s)));
    expect(r).toEqual({ status: "ok", save: s });
  });
  test("a newer version is refused, whatever else is in the object", () => {
    expect(migrate({ schema_version: 2 })).toEqual({ status: "newer_version", found_version: 2 });
    expect(migrate({ ...fresh(), schema_version: 99 })).toEqual({ status: "newer_version", found_version: 99 });
  });
  test.each([[null], [[]], ["x"], [7], [{}], [{ schema_version: "1" }], [{ schema_version: 0 }], [{ schema_version: 1.5 }], [{ schema_version: 1 }]])(
    "bad input %j is invalid, not a throw",
    (raw) => {
      expect(migrate(raw).status).toBe("invalid");
    },
  );
  test("does not mutate its input", () => {
    const raw = JSON.parse(JSON.stringify(fresh()));
    const before = JSON.stringify(raw);
    migrate(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
  test("migration steps run in order, and a missing step is reported", () => {
    const steps = [
      (o: Record<string, unknown>) => ({ ...o, schema_version: 2, trail: "1>2" }),
      (o: Record<string, unknown>) => ({ ...o, schema_version: 3, trail: `${String(o["trail"])},2>3` }),
    ];
    expect(applyMigrations({ schema_version: 1 }, 1, 3, steps)).toEqual({ schema_version: 3, trail: "1>2,2>3" });
    expect(applyMigrations({ schema_version: 2 }, 2, 3, steps)).toEqual({ schema_version: 3, trail: "undefined,2>3" });
    expect(applyMigrations({ schema_version: 1 }, 1, 4, steps)).toBeNull();
    expect(applyMigrations({ schema_version: 3 }, 3, 3, steps)).toEqual({ schema_version: 3 });
  });
});

describe("storage adapter", () => {
  test("empty storage loads as empty", () => {
    expect(createSaveStore(new MemoryStorage()).load()).toEqual({ status: "empty" });
  });
  test("round-trips through an in-memory Storage under the tors.save key", () => {
    const mem = new MemoryStorage();
    const store = createSaveStore(mem);
    const s = fresh();
    s.economy.balance = 42;
    expect(store.save(s)).toEqual({ status: "saved" });
    expect(mem.data.has(SAVE_KEY)).toBe(true);
    expect(SAVE_KEY).toBe("tors.save");
    expect(createSaveStore(mem).load()).toEqual({ status: "loaded", save: s });
  });
  test("clear removes the save", () => {
    const mem = new MemoryStorage();
    const store = createSaveStore(mem);
    store.save(fresh());
    expect(store.clear()).toEqual({ status: "saved" });
    expect(store.load()).toEqual({ status: "empty" });
  });
  test("corrupted JSON is invalid, does not throw, and is left alone by load", () => {
    const mem = new MemoryStorage();
    mem.data.set(SAVE_KEY, "{not json");
    const r = createSaveStore(mem).load();
    expect(r).toEqual({ status: "invalid", message: MESSAGES.invalid });
    expect(mem.data.get(SAVE_KEY)).toBe("{not json");
    expect(mem.writes).toBe(0);
  });
  test("valid JSON of the wrong shape is invalid", () => {
    const mem = new MemoryStorage();
    mem.data.set(SAVE_KEY, JSON.stringify({ schema_version: 1, hello: "world" }));
    expect(createSaveStore(mem).load().status).toBe("invalid");
  });
  test("schema_version 2 is refused and storage is byte-unchanged afterwards", () => {
    const mem = new MemoryStorage();
    const future = JSON.stringify({ ...fresh(), schema_version: 2, new_field: { keep: "me" } }, null, 1);
    mem.data.set(SAVE_KEY, future);
    const store = createSaveStore(mem);

    expect(store.load()).toEqual({ status: "newer_version", message: MESSAGES.newer_version });
    expect(MESSAGES.newer_version).toBe("Save data was created by a newer version and was not loaded.");
    expect(mem.data.get(SAVE_KEY)).toBe(future);

    // Later saves and clears in the same session, even without a prior load, must not touch it.
    expect(store.save(fresh())).toEqual({ status: "refused", message: MESSAGES.newer_version });
    expect(createSaveStore(mem).save(fresh()).status).toBe("refused");
    expect(store.clear().status).toBe("refused");
    expect(mem.data.get(SAVE_KEY)).toBe(future);
    expect(mem.writes).toBe(0);
  });
  test("a save from the current version is overwritten normally", () => {
    const mem = new MemoryStorage();
    const store = createSaveStore(mem);
    store.save(fresh());
    const next = fresh();
    next.progress.attempt_number = 3;
    expect(store.save(next).status).toBe("saved");
    expect(store.load()).toEqual({ status: "loaded", save: next });
  });
  test("corrupted JSON is backed up byte-for-byte before the next save overwrites it", () => {
    const mem = new MemoryStorage();
    mem.data.set(SAVE_KEY, "{not json");
    const s = fresh();
    expect(createSaveStore(mem).save(s)).toEqual({ status: "saved" });
    expect(mem.data.get(BACKUP_KEY)).toBe("{not json");
    expect(mem.data.get(SAVE_KEY)).toBe(JSON.stringify(s));
  });
  test("valid JSON that fails the schema is backed up too, and only the latest copy is kept", () => {
    const mem = new MemoryStorage();
    const bad = JSON.stringify({ schema_version: 1, hello: "world" });
    mem.data.set(SAVE_KEY, bad);
    const store = createSaveStore(mem);
    expect(store.save(fresh()).status).toBe("saved");
    expect(mem.data.get(BACKUP_KEY)).toBe(bad);
    mem.data.set(SAVE_KEY, "second damaged copy");
    expect(store.save(fresh()).status).toBe("saved");
    expect(mem.data.get(BACKUP_KEY)).toBe("second damaged copy");
  });
  test("a valid save, or nothing stored, writes no backup", () => {
    const mem = new MemoryStorage();
    const store = createSaveStore(mem);
    store.save(fresh());
    store.save(fresh());
    expect(mem.data.has(BACKUP_KEY)).toBe(false);
  });
  test("a newer version is refused with both keys unchanged", () => {
    const mem = new MemoryStorage();
    const future = JSON.stringify({ ...fresh(), schema_version: 2 });
    mem.data.set(SAVE_KEY, future);
    expect(createSaveStore(mem).save(fresh()).status).toBe("refused");
    expect(mem.data.get(SAVE_KEY)).toBe(future);
    expect(mem.data.has(BACKUP_KEY)).toBe(false);
  });
  test("if the backup cannot be written, the save is not written either", () => {
    class BackupThrows extends MemoryStorage {
      override setItem(key: string, value: string): void {
        if (key === BACKUP_KEY) throw new Error("quota");
        super.setItem(key, value);
      }
    }
    const mem = new BackupThrows();
    mem.data.set(SAVE_KEY, "{not json");
    expect(createSaveStore(mem).save(fresh())).toEqual({ status: "unavailable", message: MESSAGES.unavailable });
    expect(mem.data.get(SAVE_KEY)).toBe("{not json");
    expect(mem.writes).toBe(0);
  });
  test("clear leaves an existing backup alone and never makes one", () => {
    const mem = new MemoryStorage();
    mem.data.set(SAVE_KEY, "{not json");
    mem.data.set(BACKUP_KEY, "older copy");
    expect(createSaveStore(mem).clear()).toEqual({ status: "saved" });
    expect(mem.data.has(SAVE_KEY)).toBe(false);
    expect(mem.data.get(BACKUP_KEY)).toBe("older copy");
  });
  test("load never writes, even for unreadable data", () => {
    const mem = new MemoryStorage();
    mem.data.set(SAVE_KEY, "{not json");
    createSaveStore(mem).load();
    expect(mem.writes).toBe(0);
    expect(mem.data.has(BACKUP_KEY)).toBe(false);
  });
  test("storage that throws is unavailable, never an exception", () => {
    const store = createSaveStore(new ThrowingStorage());
    expect(store.load()).toEqual({ status: "unavailable", message: MESSAGES.unavailable });
    expect(store.save(fresh())).toEqual({ status: "unavailable", message: MESSAGES.unavailable });
    expect(store.clear()).toEqual({ status: "unavailable", message: MESSAGES.unavailable });
  });
  test("a write that throws (quota) is unavailable", () => {
    const store = createSaveStore(new WriteOnlyThrows());
    expect(store.load()).toEqual({ status: "empty" });
    expect(store.save(fresh()).status).toBe("unavailable");
  });
  test("absent storage is unavailable", () => {
    for (const none of [null, undefined]) {
      const store = createSaveStore(none);
      expect(store.load().status).toBe("unavailable");
      expect(store.save(fresh()).status).toBe("unavailable");
      expect(store.clear().status).toBe("unavailable");
    }
  });
  test("messages are neutral", () => {
    for (const m of Object.values(MESSAGES)) expect(m).not.toMatch(/!|error|fail|corrupt|oops/i);
  });
});

describe("makeSaveSalt", () => {
  test("is 32 hex characters from the injected source only", () => {
    const salt = makeSaveSalt((bytes) => bytes.forEach((_, i) => (bytes[i] = i * 17)));
    expect(salt).toBe("00112233445566778899aabbccddeeff");
    expect(makeSaveSalt((b) => b.fill(255))).toBe("ff".repeat(16));
  });
});

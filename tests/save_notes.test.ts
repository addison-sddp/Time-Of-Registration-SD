import { describe, expect, test } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrate, newSave, withNotes } from "../src/save";

const base = (): Record<string, unknown> => ({ ...newSave("salt", "2026-01-01T00:00:00Z") });

describe("save notes field", () => {
  test("schema version unchanged", () => expect(CURRENT_SCHEMA_VERSION).toBe(1));

  test("round-trips through JSON and migrate", () => {
    const saved = withNotes(newSave("salt", "2026-01-01T00:00:00Z"), "line one\nline two");
    const r = migrate(JSON.parse(JSON.stringify(saved)));
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.save.notes).toBe("line one\nline two");
  });

  test("a save without notes loads", () => {
    const r = migrate(base());
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.save.notes).toBeUndefined();
  });

  test("a non-string notes field is dropped, not a load failure", () => {
    for (const bad of [5, null, { a: 1 }, ["x"], true]) {
      const r = migrate({ ...base(), notes: bad });
      expect(r.status).toBe("ok");
      if (r.status === "ok") expect("notes" in r.save).toBe(false);
    }
  });

  test("overlong notes are truncated to 4000 characters", () => {
    const r = migrate({ ...base(), notes: "x".repeat(5000) });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.save.notes?.length).toBe(4000);
    expect(withNotes(newSave("s", "t"), "y".repeat(9000)).notes?.length).toBe(4000);
  });

  test("migrate does not mutate its input", () => {
    const raw = { ...base(), notes: 7 };
    migrate(raw);
    expect(raw.notes).toBe(7);
  });

  test("a newer schema version is still refused", () => {
    expect(migrate({ ...base(), schema_version: 2, notes: "hi" }).status).toBe("newer_version");
  });
});

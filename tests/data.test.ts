import { describe, expect, test } from "vitest";
import { calendar, economy, shifts } from "../src/data";
import { rules } from "../src/rules";
import { lookupElection } from "../src/engine/calendar";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isFeb29 = (d: string) => d.slice(5) === "02-29";

describe("data validation", () => {
  test("calendar shape", () => {
    expect(calendar).toHaveLength(3);
    for (const e of calendar) {
      expect(e.from === null || ISO.test(e.from)).toBe(true);
      expect(e.to === null || ISO.test(e.to)).toBe(true);
      expect(ISO.test(e.election_date)).toBe(true);
      expect(ISO.test(e.registration_deadline)).toBe(true);
      expect(e.label.length).toBeGreaterThan(0);
    }
  });
  test("calendar ranges end the day after the deadline", () => {
    expect(calendar.map((e) => [e.to, e.registration_deadline])).toEqual([
      ["2026-05-19", "2026-05-18"],
      ["2026-06-03", "2026-06-08"],
      ["2026-06-09", "2026-06-08"],
    ]);
  });
  test("shifts shape", () => {
    expect(shifts.map((s) => s.shift_id)).toEqual(["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10"]);
    for (const s of shifts) expect(ISO.test(s.shift_date)).toBe(true);
    expect(shifts[9]?.shift_date).toBe("2026-06-03");
  });
  test("economy shape", () => {
    expect(economy).toEqual({
      income_per_correct_decision: 7,
      penalty_per_error: 12,
      error_limit_per_shift: 3,
      starting_balance: 0,
      minimum_balance: 0,
      restart_restores_shift_start_balance: true,
    });
  });
  test("every shift date has exactly one calendar entry", () => {
    for (const s of shifts) {
      const hits = calendar.filter((e) => (e.from === null || e.from <= s.shift_date) && (e.to === null || s.shift_date < e.to));
      expect(hits, s.shift_id).toHaveLength(1);
      expect(lookupElection(calendar, s.shift_date).ok).toBe(true);
    }
  });
  test("no Feb 29 in calendar or shifts", () => {
    const dates = [
      ...calendar.flatMap((e) => [e.from, e.to, e.election_date, e.registration_deadline]),
      ...shifts.map((s) => s.shift_date),
    ].filter((d): d is string => d !== null);
    expect(dates.filter(isFeb29)).toEqual([]);
  });
  test("nothing is marked verified", () => {
    for (const r of rules) expect(r.verified, r.id).toBe(false);
    for (const e of calendar) expect(e.verified, e.label).toBe(false);
  });
  test("rule ids are unique and introduced months match the doc", () => {
    expect(rules.map((r) => [r.id, r.introduced_month])).toEqual([
      ["R1_AGE", "2025-10"],
      ["R2_RESIDENCY", "2025-10"],
      ["R3_CITIZENSHIP", "2026-04"],
    ]);
  });
  test("participating tribes are keyed tribe:<slug> with names", () => {
    const tribes = rules[2]!.params.participating_tribes as { key: string; name: string }[];
    expect(tribes).toHaveLength(9);
    for (const t of tribes) {
      expect(t.key).toMatch(/^tribe:[a-z-]+$/);
      expect(t.name.length).toBeGreaterThan(0);
    }
    expect(new Set(tribes.map((t) => t.key)).size).toBe(9);
  });
});

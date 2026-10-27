import { describe, expect, test } from "vitest";
import { lookupElection } from "../src/engine/calendar";
import { calendar, shifts } from "../src/data";
import type { ElectionEntry } from "../src/engine/types";

const pick = (d: string) => {
  const r = lookupElection(calendar, d);
  return r.ok ? `${r.entry.election_date}|${r.entry.label}` : r.code;
};

describe("calendar lookup", () => {
  test.each([
    ["2026-05-18", "2026-06-02|statewide primary and municipal election"],
    ["2026-05-19", "2026-06-23|municipal runoff, if required"],
    ["2026-06-01", "2026-06-23|municipal runoff, if required"],
    ["2026-06-02", "2026-06-23|municipal runoff, if required"],
    ["2026-06-03", "2026-06-23|municipal runoff"],
    ["2026-06-08", "2026-06-23|municipal runoff"],
    ["2026-06-09", "NO_ELECTION_CONFIGURED"],
    ["2030-01-01", "NO_ELECTION_CONFIGURED"],
    ["2000-01-01", "2026-06-02|statewide primary and municipal election"],
  ])("%s", (d, expected) => expect(pick(d)).toBe(expected));

  test("every shift date resolves", () => {
    for (const s of shifts) expect(lookupElection(calendar, s.shift_date).ok).toBe(true);
  });

  test("overlapping entries are reported", () => {
    const overlap: ElectionEntry[] = [
      { ...calendar[0]!, from: null, to: "2026-06-01" },
      { ...calendar[1]!, from: "2026-05-01", to: "2026-07-01" },
    ];
    expect(lookupElection(overlap, "2026-05-15")).toEqual({ ok: false, code: "OVERLAPPING_CALENDAR_ENTRIES" });
  });

  test("empty calendar reports no election", () => {
    expect(lookupElection([], "2026-05-01")).toEqual({ ok: false, code: "NO_ELECTION_CONFIGURED" });
  });

  test("from is inclusive and to is exclusive", () => {
    const one: ElectionEntry[] = [{ ...calendar[0]!, from: "2026-01-10", to: "2026-01-20" }];
    expect(lookupElection(one, "2026-01-10").ok).toBe(true);
    expect(lookupElection(one, "2026-01-19").ok).toBe(true);
    expect(lookupElection(one, "2026-01-20").ok).toBe(false);
    expect(lookupElection(one, "2026-01-09").ok).toBe(false);
  });
});

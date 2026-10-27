import { describe, expect, test } from "vitest";
import { calendar, shifts } from "../src/data";
import { lookupElection } from "../src/engine/calendar";
import { bornBeforeDate, nextDay } from "../src/game/format";
import { r1Age } from "../src/rules/r1_age";
import { readoutText, readoutWidth } from "../src/ui/signs";
import { handAngles } from "../src/ui/wallclock";
import { app, doc } from "./fixtures";

const born = (d: string) =>
  app({ declared_birth_date: d, id_document: doc({ birth_date: d }), citizenship_documents: [] });

function r1(birth: string, as_of: string): string {
  const found = lookupElection(calendar, as_of);
  if (!found.ok) throw new Error(`no election for ${as_of}`);
  return r1Age.check({ application: born(birth), as_of, next_election: found.entry }, r1Age.params).outcome;
}

describe("born-before sign date", () => {
  test("every shift: the day before the displayed date passes R1, the displayed date fails", () => {
    for (const shift of shifts) {
      const found = lookupElection(calendar, shift.shift_date);
      if (!found.ok) continue;
      const shown = bornBeforeDate(found.entry.election_date);
      expect(r1(prevDay(shown), shift.shift_date)).toBe("pass");
      expect(r1(shown, shift.shift_date)).toBe("fail");
    }
  });

  test("the calendar yields at least one shift to check", () => {
    expect(shifts.some((s) => lookupElection(calendar, s.shift_date).ok)).toBe(true);
  });

  test("worked examples", () => {
    expect(bornBeforeDate("2026-06-02")).toBe("2008-06-03");
    expect(bornBeforeDate("2026-06-23")).toBe("2008-06-24");
  });

  test("month, year and leap rollover", () => {
    expect(bornBeforeDate("2026-12-31")).toBe("2009-01-01");
    expect(bornBeforeDate("2026-06-30")).toBe("2008-07-01");
    expect(bornBeforeDate("2026-02-28")).toBe("2008-02-29"); // 2008 is a leap year
    expect(nextDay("2007-02-28")).toBe("2007-03-01");
    expect(nextDay("1999-12-31")).toBe("2000-01-01");
  });
});

describe("sign and clock helpers", () => {
  test("election readout text", () => {
    expect(readoutText("2026-06-02")).toBe("06 02 2026");
    expect(readoutWidth("06 02 2026")).toBeGreaterThan(readoutWidth("06"));
  });
  test("hand angles", () => {
    expect(handAngles(3, 0, 0)).toEqual({ hour: 90, minute: 0, second: 0 });
    expect(handAngles(15, 30, 30)).toEqual({ hour: 105, minute: 183, second: 180 });
    expect(handAngles(0, 0, 0).hour).toBe(0);
  });
});

function prevDay(d: string): string {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) - 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

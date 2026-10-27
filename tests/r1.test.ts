import { describe, expect, test } from "vitest";
import { r1Age } from "../src/rules/r1_age";
import { calendar } from "../src/data";
import { lookupElection } from "../src/engine/calendar";
import type { Application, CheckResult } from "../src/engine/types";
import { app, doc } from "./fixtures";

function run(a: Application, as_of: string): CheckResult {
  const found = lookupElection(calendar, as_of);
  if (!found.ok) throw new Error("no election");
  return r1Age.check({ application: a, as_of, next_election: found.entry }, r1Age.params);
}

const born = (d: string): Application =>
  app({ declared_birth_date: d, id_document: doc({ birth_date: d }), citizenship_documents: [] });

describe("R1_AGE", () => {
  test.each([
    ["s08 (2026-05-01) cutoff 2008-06-02", "2026-05-01", "2008-06-02", "2008-06-03"],
    ["s09 (2026-06-01) cutoff 2008-06-23", "2026-06-01", "2008-06-23", "2008-06-24"],
    ["s10 (2026-06-03) cutoff 2008-06-23", "2026-06-03", "2008-06-23", "2008-06-24"],
  ])("%s: equal passes, next day fails", (_n, asOf, onCutoff, dayAfter) => {
    expect(run(born(onCutoff), asOf)).toEqual({ outcome: "pass" });
    const r = run(born(dayAfter), asOf);
    expect(r.outcome).toBe("fail");
    if (r.outcome === "fail") expect(r.details.condition).toMatch(/^below eligibility date for the next election \(2026-06-\d\d\)$/);
  });

  test("condition names the election date", () => {
    const r = run(born("2010-01-01"), "2026-05-01");
    expect(r).toEqual({
      outcome: "fail",
      details: { condition: "below eligibility date for the next election (2026-06-02)" },
    });
  });

  test("declared date differs from id", () => {
    const a = app({ declared_birth_date: "1991-01-01" });
    expect(run(a, "2026-05-01")).toEqual({ outcome: "fail", details: { condition: "differs between documents" } });
  });

  test("citizenship document date differs from id", () => {
    const a = app({ citizenship_documents: [doc({ birth_date: "1990-01-02" })] });
    expect(run(a, "2026-05-01")).toMatchObject({ outcome: "fail", details: { condition: "differs between documents" } });
  });

  test("null birth date on a citizenship document is ignored", () => {
    const a = app({ citizenship_documents: [doc({ birth_date: null })] });
    expect(run(a, "2026-05-01")).toEqual({ outcome: "pass" });
  });

  test("missing id document fails neutrally", () => {
    const r = run(app({ id_document: null }), "2026-05-01");
    expect(r).toEqual({ outcome: "fail", details: { condition: "no date of birth on identity document" } });
  });

  test("id document without birth date fails neutrally", () => {
    const r = run(app({ id_document: doc({ birth_date: null }) }), "2026-05-01");
    expect(r.outcome).toBe("fail");
  });

  test("mismatch is reported ahead of the age condition", () => {
    const a = app({ declared_birth_date: "2012-01-01", id_document: doc({ birth_date: "2010-01-01" }), citizenship_documents: [] });
    expect(run(a, "2026-05-01")).toMatchObject({ details: { condition: "differs between documents" } });
  });
});

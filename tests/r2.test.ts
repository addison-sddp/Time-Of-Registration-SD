import { describe, expect, test } from "vitest";
import { r2Residency } from "../src/rules/r2_residency";
import { calendar } from "../src/data";
import { lookupElection } from "../src/engine/calendar";
import type { Application } from "../src/engine/types";
import { app, doc, residency } from "./fixtures";

function run(a: Application) {
  const found = lookupElection(calendar, "2026-05-01");
  if (!found.ok) throw new Error("no election");
  return r2Residency.check({ application: a, as_of: "2026-05-01", next_election: found.entry }, r2Residency.params);
}

describe("R2_RESIDENCY", () => {
  test("SD address passes", () => {
    expect(run(app())).toEqual({ outcome: "pass" });
  });
  test("non-SD state fails", () => {
    expect(run(app({ residency_declaration: residency({ address_state: "MN" }) }))).toEqual({
      outcome: "fail",
      details: { condition: "address state is not South Dakota" },
    });
  });
  test.each([[null], [""], ["   "]])("empty address line %j fails", (line) => {
    expect(run(app({ residency_declaration: residency({ address_line: line }) }))).toEqual({
      outcome: "fail",
      details: { condition: "no address listed" },
    });
  });
  test("null state with an address fails", () => {
    expect(run(app({ residency_declaration: residency({ address_state: null }) })).outcome).toBe("fail");
  });
  test("id address in another state is not compared", () => {
    const a = app({ id_document: doc({ address_state: "MN", address_line: "1 Elsewhere Rd" }) });
    expect(run(a)).toEqual({ outcome: "pass" });
  });
});

import { describe, expect, test } from "vitest";
import { evaluate } from "../src/engine/evaluate";
import { calendar } from "../src/data";
import { rules } from "../src/rules";
import type { AnyRule, ElectionEntry } from "../src/engine/types";
import { app, deepFreeze, doc, residency } from "./fixtures";

const CAL = { mode: "calendar" } as const;
const ev = (a = app(), asOf = "2026-05-01", mode: Parameters<typeof evaluate>[4] = CAL, rs: readonly AnyRule[] = rules, cal: readonly ElectionEntry[] = calendar) =>
  evaluate(a, asOf, cal, rs, mode);

// Fails R1 (born 2010), R2 (MN) and R3 (no citizenship documents).
const failsAll = () =>
  app({
    declared_birth_date: "2010-01-01",
    id_document: doc({ birth_date: "2010-01-01" }),
    residency_declaration: residency({ address_state: "MN" }),
    citizenship_documents: [],
  });

describe("combination", () => {
  test("passing application is approved with no violations", () => {
    const r = ev();
    expect(r.ok && r.value.verdict).toBe("approve");
    expect(r.ok && r.value.violated_rule_ids).toEqual([]);
    expect(r.ok && r.value.results.map((x) => x.rule_id)).toEqual(["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"]);
  });
  test("multiple violations are sorted", () => {
    const r = ev(failsAll());
    expect(r.ok && r.value.verdict).toBe("deny");
    expect(r.ok && r.value.violated_rule_ids).toEqual(["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"]);
  });
  test("violations are sorted regardless of rule order", () => {
    const r = ev(failsAll(), "2026-05-01", CAL, [...rules].reverse());
    expect(r.ok && r.value.violated_rule_ids).toEqual(["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"]);
  });
  test("R1 and R3 only", () => {
    const a = app({ declared_birth_date: "2010-01-01", id_document: doc({ birth_date: "2010-01-01" }), citizenship_documents: [] });
    const r = ev(a);
    expect(r.ok && r.value.violated_rule_ids).toEqual(["R1_AGE", "R3_CITIZENSHIP"]);
  });
  test("verdict carries the looked-up election", () => {
    const r = ev(app(), "2026-06-03");
    expect(r.ok && r.value.next_election.election_date).toBe("2026-06-23");
  });
});

describe("activation", () => {
  test("calendar: R3 inactive on 2026-03-01", () => {
    const r = ev(failsAll(), "2026-03-01");
    expect(r.ok && r.value.results.map((x) => x.rule_id)).toEqual(["R1_AGE", "R2_RESIDENCY"]);
    expect(r.ok && r.value.violated_rule_ids).toEqual(["R1_AGE", "R2_RESIDENCY"]);
  });
  test("calendar: R3 active on 2026-04-01", () => {
    const r = ev(failsAll(), "2026-04-01");
    expect(r.ok && r.value.violated_rule_ids).toContain("R3_CITIZENSHIP");
  });
  test("calendar: before every introduced month nothing is active", () => {
    const r = ev(failsAll(), "2025-09-01");
    expect(r.ok && r.value.results).toEqual([]);
    expect(r.ok && r.value.verdict).toBe("approve");
  });
  test("sandbox: only listed rules, regardless of month", () => {
    const r = ev(failsAll(), "2025-10-01", { mode: "sandbox", rule_ids: ["R3_CITIZENSHIP"] });
    expect(r.ok && r.value.results.map((x) => x.rule_id)).toEqual(["R3_CITIZENSHIP"]);
    expect(r.ok && r.value.violated_rule_ids).toEqual(["R3_CITIZENSHIP"]);
  });
  test("sandbox: empty list activates nothing", () => {
    const r = ev(failsAll(), "2026-05-01", { mode: "sandbox", rule_ids: [] });
    expect(r.ok && r.value.verdict).toBe("approve");
  });
  test("sandbox does not edit rule data", () => {
    const before = rules.map((x) => x.introduced_month);
    ev(app(), "2025-10-01", { mode: "sandbox", rule_ids: ["R3_CITIZENSHIP"] });
    expect(rules.map((x) => x.introduced_month)).toEqual(before);
  });
});

describe("purity", () => {
  test("deep-frozen inputs, repeated calls equal, nothing mutated", () => {
    const a = deepFreeze(failsAll());
    const cal = deepFreeze(structuredClone([...calendar]));
    const rs = deepFreeze([...rules]);
    const snapshot = JSON.stringify(a);
    const first = ev(a, "2026-05-01", CAL, rs, cal);
    const second = ev(a, "2026-05-01", CAL, rs, cal);
    expect(second).toEqual(first);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe("error paths", () => {
  test("no election configured", () => {
    expect(ev(app(), "2026-06-09")).toEqual({ ok: false, error: { code: "NO_ELECTION_CONFIGURED", as_of: "2026-06-09" } });
  });
  test("overlapping calendar", () => {
    const cal: ElectionEntry[] = [{ ...calendar[0]!, to: null }, { ...calendar[1]!, from: null }];
    expect(ev(app(), "2026-05-01", CAL, rules, cal)).toEqual({
      ok: false,
      error: { code: "OVERLAPPING_CALENDAR_ENTRIES", as_of: "2026-05-01" },
    });
  });
  test("applies_to naming an absent field is a config error", () => {
    const bad: AnyRule = { ...rules[0]!, applies_to: ["application.id_document.shoe_size"] };
    const r = ev(app(), "2026-05-01", CAL, [bad]);
    expect(r).toMatchObject({ ok: false, error: { code: "RULE_CONFIG_INVALID", rule_id: "R1_AGE" } });
  });
  test("duplicate rule ids are a config error", () => {
    expect(ev(app(), "2026-05-01", CAL, [rules[0]!, rules[0]!])).toMatchObject({ ok: false, error: { code: "RULE_CONFIG_INVALID" } });
  });
  test("unknown sandbox rule id is a config error", () => {
    expect(ev(app(), "2026-05-01", { mode: "sandbox", rule_ids: ["NOPE"] })).toMatchObject({
      ok: false,
      error: { code: "RULE_CONFIG_INVALID", rule_id: "NOPE" },
    });
  });
  test("a throwing check returns an error instead of throwing", () => {
    const boom: AnyRule = { ...rules[0]!, check: () => { throw new Error("x"); } };
    expect(() => ev(app(), "2026-05-01", CAL, [boom])).not.toThrow();
    expect(ev(app(), "2026-05-01", CAL, [boom])).toMatchObject({ ok: false, error: { code: "RULE_CONFIG_INVALID" } });
  });
  test("not_applicable neither passes nor fails", () => {
    const na: AnyRule = { ...rules[0]!, id: "RX", check: () => ({ outcome: "not_applicable" }) };
    const r = ev(app(), "2026-05-01", CAL, [na]);
    expect(r.ok && r.value.verdict).toBe("approve");
    expect(r.ok && r.value.results).toHaveLength(1);
  });
});

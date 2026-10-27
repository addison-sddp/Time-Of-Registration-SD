import { describe, expect, test } from "vitest";
import { evaluate } from "../src/engine/evaluate";
import type { Activation, ISODate } from "../src/engine/types";
import { calendar, shifts } from "../src/data";
import { rules } from "../src/rules";
import {
  buildApplicant, createContext, createRng, hashSeed, intentKey, listIntents, type GenOptions, type Intent,
} from "../src/gen";
import { problemsWith } from "./gen_helpers";

// DESIGN 3.9: for many seeds per intent profile, the engine's verdict, sorted violated
// rule ids and per-rule failure conditions must equal the generator's intent.
const SEEDS = 200;

function mismatches(intent: Intent, as_of: ISODate, activation: Activation): string[] {
  const opts: GenOptions = { as_of, activation };
  const ctx = createContext(as_of, opts);
  const key = intentKey(intent);
  const problems: string[] = [];
  for (let i = 0; i < SEEDS; i++) {
    const rng = createRng(hashSeed("property", key, as_of, i));
    const { application } = buildApplicant(rng, ctx, intent, `p${i}`);
    const where = `${as_of} ${key} seed ${i}`;
    problems.push(...problemsWith(application, as_of).map((p) => `${where}: ${p}`));

    const r = evaluate(application, as_of, calendar, rules, activation);
    if (!r.ok) {
      problems.push(`${where}: engine error ${r.error.code}`);
      continue;
    }
    const want = intent.verdict === "approve" ? [] : intent.violations.map((v) => v.rule_id).sort();
    if (r.value.verdict !== intent.verdict) problems.push(`${where}: verdict ${r.value.verdict}`);
    if (JSON.stringify(r.value.violated_rule_ids) !== JSON.stringify(want)) {
      problems.push(`${where}: violated ${r.value.violated_rule_ids.join(",")} wanted ${want.join(",")}`);
    }
    if (intent.verdict === "deny") {
      for (const v of intent.violations) {
        const res = r.value.results.find((x) => x.rule_id === v.rule_id)?.result;
        const got = res?.outcome === "fail" ? res.details.condition : res?.outcome;
        if (got !== v.condition) problems.push(`${where}: ${v.rule_id} condition "${got}" wanted "${v.condition}"`);
      }
    }
    if (problems.length > 5) break; // enough to diagnose
  }
  return problems;
}

const ALL: Activation = { mode: "sandbox", rule_ids: rules.map((r) => r.id) };
const CAL: Activation = { mode: "calendar" };

describe("profiles", () => {
  const ctx = createContext("2026-05-01", { activation: ALL });
  const intents = listIntents(ctx);

  test("all three rules active: approve plus 44 deny profiles", () => {
    // (1 + 2) * (1 + 2) * (1 + 4) - 1 failing combinations, plus approve.
    expect(intents.length).toBe(1 + 44);
    expect(new Set(intents.map(intentKey)).size).toBe(intents.length);
  });
  test("every deny profile is non-empty, sorted, and names exact condition strings", () => {
    for (const i of intents) {
      if (i.verdict === "approve") continue;
      expect(i.violations.length).toBeGreaterThan(0);
      const ids = i.violations.map((v) => v.rule_id);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
    }
    const all = new Set(intents.flatMap((i) => (i.verdict === "deny" ? i.violations.map((v) => v.condition) : [])));
    expect([...all].sort()).toEqual(
      [
        "below eligibility date for the next election (2026-06-02)",
        "differs between documents",
        "address state is not South Dakota",
        "no address listed",
        "no qualifying document presented",
        "photocopy presented where original required",
        "name differs between documents",
        "document expired",
      ].sort(),
    );
  });
  test("calendar mode: no profile ever fails an inactive rule", () => {
    for (const s of shifts) {
      const c = createContext(s.shift_date);
      const active = rules.filter((r) => r.introduced_month <= s.shift_date.slice(0, 7)).map((r) => r.id);
      expect(c.active_rule_ids).toEqual(active);
      for (const i of listIntents(c)) {
        if (i.verdict === "deny") for (const v of i.violations) expect(active).toContain(v.rule_id);
      }
    }
  });
  test("calendar mode: R3 profiles appear from April 2026 only", () => {
    const has = (date: string) =>
      listIntents(createContext(date)).some((i) => i.verdict === "deny" && i.violations.some((v) => v.rule_id === "R3_CITIZENSHIP"));
    expect(has("2026-03-01")).toBe(false);
    expect(has("2026-04-01")).toBe(true);
  });
  test("explicit sandbox rule list restricts profiles", () => {
    const only2 = createContext("2026-05-01", { activation: { mode: "sandbox", rule_ids: ["R2_RESIDENCY"] } });
    expect(listIntents(only2).map(intentKey)).toEqual([
      "approve",
      "deny:R2_RESIDENCY=address state is not South Dakota",
      "deny:R2_RESIDENCY=no address listed",
    ]);
  });
});

describe("generator ground truth: sandbox, all rules active, every shift date", () => {
  for (const s of shifts) {
    test(`as_of ${s.shift_date} (${listIntents(createContext(s.shift_date, { activation: ALL })).length} profiles x ${SEEDS} seeds)`, () => {
      const ctx = createContext(s.shift_date, { activation: ALL });
      for (const intent of listIntents(ctx)) {
        expect(mismatches(intent, s.shift_date, ALL)).toEqual([]);
      }
    });
  }
});

describe("generator ground truth: calendar mode, each shift", () => {
  for (const s of shifts) {
    test(`${s.shift_id} ${s.shift_date}`, () => {
      const ctx = createContext(s.shift_date);
      for (const intent of listIntents(ctx)) {
        expect(mismatches(intent, s.shift_date, CAL)).toEqual([]);
      }
    });
  }
});

describe("generator ground truth: other activations", () => {
  test("sandbox with only R1 and R3 on a late date", () => {
    const a: Activation = { mode: "sandbox", rule_ids: ["R1_AGE", "R3_CITIZENSHIP"] };
    for (const intent of listIntents(createContext("2026-06-03", { activation: a }))) {
      expect(mismatches(intent, "2026-06-03", a)).toEqual([]);
    }
  });
  test("sandbox with a single rule on the earliest date", () => {
    for (const id of ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"]) {
      const a: Activation = { mode: "sandbox", rule_ids: [id] };
      for (const intent of listIntents(createContext("2025-10-01", { activation: a }))) {
        expect(mismatches(intent, "2025-10-01", a)).toEqual([]);
      }
    }
  });
  test("sandbox with no rules active: only approve exists, and the engine approves", () => {
    const a: Activation = { mode: "sandbox", rule_ids: [] };
    const intents = listIntents(createContext("2026-05-01", { activation: a }));
    expect(intents).toEqual([{ verdict: "approve" }]);
    expect(mismatches(intents[0] as Intent, "2026-05-01", a)).toEqual([]);
  });
  test("as_of values off the shift grid, including the calendar boundaries", () => {
    for (const d of ["2026-05-18", "2026-05-19", "2026-06-02", "2026-06-08", "2025-07-01", "2026-04-30"]) {
      const c = createContext(d, { activation: ALL });
      for (const intent of listIntents(c).filter((_, k) => k % 6 === 0)) {
        expect(mismatches(intent, d, ALL)).toEqual([]);
      }
    }
  });
});

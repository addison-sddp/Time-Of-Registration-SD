import { describe, expect, test } from "vitest";
import { evaluate } from "../src/engine/evaluate";
import { calendar, shifts } from "../src/data";
import { rules } from "../src/rules";
import {
  buildApplicant, createContext, createRng, generateShift, MAX_APPLICANTS, MIN_APPLICANTS, orderShift,
  type GeneratedApplicant, type ShiftInput,
} from "../src/gen";
import { docsOf, everyDocument, problemsWith } from "./gen_helpers";

const SALTS = ["alpha", "bravo-2", "c0ffee", "salt with spaces", "4"];
const ATTEMPTS = [1, 2, 3, 4, 5];
const ids = (xs: GeneratedApplicant[]) => xs.map((a) => a.application.application_id);

function scripted(index: number, pinned: number, shift: ShiftInput): GeneratedApplicant {
  const ctx = createContext(shift.shift_date);
  const a = buildApplicant(createRng(1000 + index), ctx, { verdict: "approve" }, `${shift.shift_id}-scripted${index}`);
  return { ...a, pinned_position: pinned };
}

describe("generateShift", () => {
  test("5 to 10 applicants for every shift and salt, and counts vary", () => {
    const counts = new Set<number>();
    for (const salt of SALTS) {
      for (const s of shifts) {
        const n = generateShift(salt, s).length;
        expect(n).toBeGreaterThanOrEqual(MIN_APPLICANTS);
        expect(n).toBeLessThanOrEqual(MAX_APPLICANTS);
        counts.add(n);
      }
    }
    expect(counts.size).toBeGreaterThanOrEqual(4);
  });

  test("same seed gives byte-identical JSON; a different salt or shift does not", () => {
    for (const s of shifts) {
      const a = JSON.stringify(generateShift("alpha", s));
      expect(JSON.stringify(generateShift("alpha", s))).toBe(a);
      expect(JSON.stringify(generateShift("bravo-2", s))).not.toBe(a);
    }
    const s01 = shifts[0]!;
    const s02 = shifts[1]!;
    expect(JSON.stringify(generateShift("alpha", s01))).not.toBe(JSON.stringify(generateShift("alpha", s02)));
  });

  test("applications are well formed, with unique ids, and every intent is a real one", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        const xs = generateShift(salt, s);
        expect(new Set(ids(xs)).size).toBe(xs.length);
        for (const x of xs) {
          expect(problemsWith(x.application, s.shift_date)).toEqual([]);
          if (x.intent.verdict === "deny") expect(x.intent.violations.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("engine verdicts agree with intent for whole generated shifts (calendar mode)", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        for (const x of generateShift(salt, s)) {
          const r = evaluate(x.application, s.shift_date, calendar, rules, { mode: "calendar" });
          expect(r.ok && r.value.verdict).toBe(x.intent.verdict);
          const want = x.intent.verdict === "deny" ? x.intent.violations.map((v) => v.rule_id) : [];
          expect(r.ok && r.value.violated_rule_ids).toEqual(want);
        }
      }
    }
  });

  test("each shift has at least one approval and one denial", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        const verdicts = generateShift(salt, s).map((x) => x.intent.verdict);
        expect(verdicts).toContain("approve");
        expect(verdicts).toContain("deny");
      }
    }
  });

  test("calendar mode: no applicant fails a rule that is not active yet", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        const active = createContext(s.shift_date).active_rule_ids;
        for (const x of generateShift(salt, s)) {
          if (x.intent.verdict === "deny") for (const v of x.intent.violations) expect(active).toContain(v.rule_id);
        }
      }
    }
    const r3Early = shifts.filter((s) => s.shift_date < "2026-04-01");
    for (const s of r3Early) {
      expect(JSON.stringify(generateShift("alpha", s))).not.toContain('"rule_id":"R3_CITIZENSHIP"');
    }
  });

  test("an explicit sandbox rule list is honored", () => {
    const s = shifts[7]!;
    const xs = generateShift("alpha", s, { activation: { mode: "sandbox", rule_ids: ["R2_RESIDENCY"] } });
    for (const x of xs) {
      if (x.intent.verdict === "deny") expect(x.intent.violations.map((v) => v.rule_id)).toEqual(["R2_RESIDENCY"]);
    }
  });

  test("a shift date with no election throws instead of guessing", () => {
    expect(() => generateShift("alpha", { shift_id: "sx", shift_date: "2026-06-09" })).toThrow();
  });
});

describe("content rules", () => {
  const all = SALTS.flatMap((salt) => shifts.flatMap((s) => generateShift(salt, s)));
  const json = JSON.stringify(all);

  test("no Feb 29 in any date field, and no Feb 29 text anywhere", () => {
    expect(json).not.toMatch(/\d{4}-02-29/);
    expect(json).not.toMatch(/-02-29/);
  });
  test("no PO boxes", () => {
    expect(json).not.toMatch(/P\.?\s?O\.?\s*Box/i);
    expect(json).not.toMatch(/post office box/i);
  });
  test("every address has a street number, name and suffix; state codes are real two-letter codes", () => {
    const states = new Set(["SD", "MN", "IA", "NE", "ND", "MT", "WY", "CO", "WI", "KS", "IL"]);
    for (const d of everyDocument(all.map((x) => x.application))) {
      if (d.address_line !== null) expect(d.address_line).toMatch(/^\d{3,4} [A-Za-z ]+ (St|Ave|Rd|Ln|Dr|Ct|Blvd|Way|Pl)$/);
      if (d.address_state !== null) expect(states.has(d.address_state)).toBe(true);
    }
  });
  test("tribal IDs use only participating tribe keys from R3", () => {
    const r3 = rules.find((r) => r.id === "R3_CITIZENSHIP")!;
    const keys = new Set((r3.params.participating_tribes as { key: string }[]).map((t) => t.key));
    const tribal = everyDocument(all.map((x) => x.application)).filter((d) => d.type === "tribal_id");
    expect(tribal.length).toBeGreaterThan(10);
    for (const d of tribal) expect(keys.has(d.issuing_jurisdiction ?? "")).toBe(true);
  });
  test("residency addresses are in SD except when the intent says otherwise", () => {
    for (const x of all) {
      const res = x.application.residency_declaration;
      const v = x.intent.verdict === "deny" ? x.intent.violations.find((y) => y.rule_id === "R2_RESIDENCY") : undefined;
      if (v === undefined) expect(res.address_state).toBe("SD");
      else if (v.condition === "no address listed") expect(res.address_line).toBeNull();
      else expect(res.address_state).not.toBe("SD");
    }
  });
  test("approved applicants hold only unexpired real documents", () => {
    for (const x of all) {
      if (x.intent.verdict !== "approve") continue;
      const asOf = shifts.find((s) => x.application.application_id.startsWith(s.shift_id + "-"))!.shift_date;
      for (const d of docsOf(x.application)) {
        if (d.type === "other_unrecognized") continue;
        if (d.expiry_date !== null) expect(d.expiry_date >= asOf).toBe(true);
      }
    }
  });
  test("document variety: distractors, photocopies, old SD licenses beside other proof, every tier", () => {
    const docs = everyDocument(all.map((x) => x.application));
    const types = new Set(docs.map((d) => d.type));
    for (const t of [
      "sd_drivers_license", "other_state_drivers_license", "other_state_nondriver_id", "tribal_id", "birth_certificate",
      "us_passport", "consular_report_of_birth_abroad", "certificate_of_naturalization", "residency_declaration",
      "other_unrecognized",
    ]) expect(types.has(t as never)).toBe(true);
    expect(docs.some((d) => d.type === "us_passport" && d.is_photocopy)).toBe(true);
    expect(docs.some((d) => d.type === "birth_certificate" && d.is_photocopy)).toBe(true);
    expect(
      all.some((x) => {
        const a = x.application;
        return (
          a.id_document?.type === "sd_drivers_license" &&
          a.id_document.issue_date !== null && a.id_document.issue_date < "2025-07-01" &&
          a.citizenship_documents.some((d) => d.type === "us_passport")
        );
      }),
    ).toBe(true);
    // Names vary in case on documents without changing the verdict.
    expect(docs.some((d) => d.name !== null && d.name === d.name.toUpperCase())).toBe(true);
    expect(docs.some((d) => d.name !== null && d.name !== d.name.toUpperCase())).toBe(true);
  });
  test("distinct portrait seeds and names across applicants", () => {
    const seeds = new Set(everyDocument(all.map((x) => x.application)).map((d) => d.portrait_seed));
    expect(seeds.size).toBeGreaterThan(100);
    expect(new Set(all.map((x) => x.application.applicant_name)).size).toBeGreaterThan(100);
  });
});

describe("orderShift", () => {
  test("content is identical across attempts 1 to 5 for every shift", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        const content = generateShift(salt, s);
        const canonical = JSON.stringify([...content].sort((a, b) => a.application.application_id.localeCompare(b.application.application_id)));
        for (const attempt of ATTEMPTS) {
          const ordered = orderShift(generateShift(salt, s), salt, s.shift_id, attempt);
          expect(ordered.length).toBe(content.length);
          const sorted = [...ordered].sort((a, b) => a.application.application_id.localeCompare(b.application.application_id));
          expect(JSON.stringify(sorted)).toBe(canonical);
        }
      }
    }
  });

  test("order is deterministic per attempt and does not mutate its input", () => {
    for (const s of shifts) {
      const content = generateShift("alpha", s);
      const before = JSON.stringify(content);
      for (const attempt of ATTEMPTS) {
        expect(ids(orderShift(content, "alpha", s.shift_id, attempt))).toEqual(
          ids(orderShift(content, "alpha", s.shift_id, attempt)),
        );
      }
      expect(JSON.stringify(content)).toBe(before);
    }
  });

  test("order differs across attempts", () => {
    let pairs = 0;
    let differing = 0;
    for (const salt of SALTS) {
      for (const s of shifts) {
        const content = generateShift(salt, s);
        const orders = ATTEMPTS.map((a) => ids(orderShift(content, salt, s.shift_id, a)).join(","));
        expect(new Set(orders).size).toBeGreaterThan(1);
        for (let k = 1; k < orders.length; k++) {
          pairs++;
          if (orders[k] !== orders[k - 1]) differing++;
        }
      }
    }
    expect(differing / pairs).toBeGreaterThan(0.9);
  });

  test("pinned_position never moves; the rest shuffle into the remaining slots", () => {
    for (const salt of SALTS) {
      for (const s of shifts) {
        const input: ShiftInput = { ...s, scripted_applicants: [scripted(1, 0, s), scripted(2, 4, s)] };
        const content = generateShift(salt, input);
        expect(content.length).toBeGreaterThanOrEqual(5);
        const moved = new Set<string>();
        for (const attempt of ATTEMPTS) {
          const ordered = orderShift(content, salt, s.shift_id, attempt);
          expect(ordered[0]?.application.application_id).toBe(`${s.shift_id}-scripted1`);
          expect(ordered[4]?.application.application_id).toBe(`${s.shift_id}-scripted2`);
          expect(new Set(ids(ordered)).size).toBe(content.length);
          moved.add(ids(ordered).slice(1, 4).join(","));
        }
        expect(moved.size).toBeGreaterThan(1);
      }
    }
  });

  test("scripted entries count toward the total and keep their data", () => {
    const s = shifts[0]!;
    const sc = scripted(1, 2, s);
    const xs = generateShift("alpha", { ...s, scripted_applicants: [sc] });
    expect(xs[0]).toEqual(sc);
    expect(xs.length).toBeLessThanOrEqual(MAX_APPLICANTS);
    expect(xs.length).toBe(generateShift("alpha", s).length);
  });

  test("invalid or clashing pins fall back to the shuffle instead of dropping anyone", () => {
    const items = [0, 1, 2, 3, 4, 5].map((n) => ({ n, pinned_position: n === 0 ? 2 : n === 1 ? 2 : n === 2 ? 99 : n === 3 ? -1 : undefined }));
    const out = orderShift(items, "alpha", "s01", 1);
    expect(out.map((x) => x.n).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(out[2]?.n).toBe(0);
  });

  test("the order seed includes the salt, the shift and the attempt", () => {
    const content = generateShift("alpha", shifts[0]!);
    const base = ids(orderShift(content, "alpha", "s01", 1)).join(",");
    expect(ids(orderShift(content, "alpha", "s01", 1)).join(",")).toBe(base);
    const variants = [orderShift(content, "bravo-2", "s01", 1), orderShift(content, "alpha", "s02", 1), orderShift(content, "alpha", "s01", 2)];
    expect(variants.some((v) => ids(v).join(",") !== base)).toBe(true);
  });
});

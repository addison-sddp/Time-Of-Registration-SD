import { describe, expect, test } from "vitest";
import { calendar, narrative, shifts } from "../src/data";
import { evaluate } from "../src/engine/evaluate";
import type { Application, Document, ISODate, RuleResult } from "../src/engine/types";
import {
  allSources, conditionKey, fieldsOfDoc, findReason, isValidSource, presentedDocuments, reasonCatalog,
  reasonConfirmed, reasonsForResults, validSources, type DocSource, type Reason,
} from "../src/game";
import { generateShift, perturbers, createContext } from "../src/gen";
import { rules } from "../src/rules";
import { app, doc, residency } from "./fixtures";

const ALL = ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"];
const reason = (id: string): Reason => {
  const r = findReason(id);
  if (r === null) throw new Error(`no reason ${id}`);
  return r;
};
const src = (a: Application, doc_id: string, field: string): DocSource => {
  const p = presentedDocuments(a).find((d) => d.doc_id === doc_id);
  if (p === undefined) throw new Error(`no doc ${doc_id}`);
  return { doc_id, doc_type: p.doc_type, field };
};

// ---- Applicants picked by intent -----------------------------------------------------------

interface Found {
  a: Application;
  as_of: ISODate;
  results: RuleResult[];
}
const cache = new Map<string, Found>();

// The first generated applicant (fixed salts) whose only violation is this rule and condition.
function pickByIntent(rule_id: string, key: string, accept: (f: Found) => boolean = () => true): Found {
  const id = `${rule_id}|${key}`;
  const hit = cache.get(id);
  if (hit !== undefined && accept(hit)) return hit;
  for (let i = 0; i < 120; i++) {
    for (const shift of shifts) {
      const content = generateShift(`reason-salt-${i}`, shift, {
        as_of: shift.shift_date,
        activation: { mode: "sandbox", rule_ids: ALL },
      });
      for (const g of content) {
        if (g.intent.verdict !== "deny" || g.intent.violations.length !== 1) continue;
        const v = g.intent.violations[0]!;
        if (v.rule_id !== rule_id || conditionKey(v.condition) !== key) continue;
        const r = evaluate(g.application, shift.shift_date, calendar, rules, { mode: "sandbox", rule_ids: ALL });
        if (!r.ok) continue;
        const f = { a: g.application, as_of: shift.shift_date, results: r.value.results };
        if (!accept(f)) continue;
        cache.set(id, f);
        return f;
      }
    }
  }
  throw new Error(`no applicant for ${id}`);
}

const failing = (f: Found, rule_id: string): string =>
  f.results.flatMap((r) => (r.rule_id === rule_id && r.result.outcome === "fail" ? [r.result.details.condition] : []))[0] ?? "";

// ---- Catalog -------------------------------------------------------------------------------

describe("reason catalog", () => {
  test("one group per active rule, in order, with the rules' own conditions", () => {
    const cat = reasonCatalog(["R2_RESIDENCY", "R1_AGE"]);
    expect(cat.map((g) => g.rule_id)).toEqual(["R2_RESIDENCY", "R1_AGE"]);
    expect(cat[0]!.reasons.map((r) => r.text)).toEqual(["Address state is not South Dakota", "No address listed"]);
    expect(cat[1]!.reasons.map((r) => r.text)).toEqual([
      "No date of birth on identity document",
      "Date of birth differs between documents",
      "Below minimum voter registration age",
    ]);
    expect(cat[0]!.heading).toBe(narrative.briefing.rules["R2_RESIDENCY"]!.heading);
  });

  test("an inactive rule contributes nothing; unknown rule ids are skipped", () => {
    expect(reasonCatalog(["R1_AGE"]).flatMap((g) => g.reasons).every((r) => r.rule_id === "R1_AGE")).toBe(true);
    expect(reasonCatalog([])).toEqual([]);
    expect(reasonCatalog(["R9_NONE"])).toEqual([]);
  });

  test("R3 lists its four conditions; only the absence needs no source", () => {
    const r3 = reasonCatalog(["R3_CITIZENSHIP"])[0]!.reasons;
    expect(r3.map((r) => r.condition)).toEqual([
      "photocopy presented where original required",
      "name differs between documents",
      "document expired",
      "no qualifying document presented",
    ]);
    expect(r3.map((r) => r.needs_source)).toEqual([true, true, true, false]);
    expect(reason("R1_AGE.no_birth_date").needs_source).toBe(false);
  });

  test("R1's eligibility reason shows no date placeholder", () => {
    const r = reason("R1_AGE.below_eligibility");
    expect(r.text).toBe("Below minimum voter registration age");
    expect(r.text).not.toMatch(/[({]/);
    expect(r.condition).toBe("below eligibility date for the next election");
  });

  test("every reason has text, ids are unique, and findReason round-trips", () => {
    const all = reasonCatalog(ALL).flatMap((g) => g.reasons);
    expect(all).toHaveLength(9);
    expect(new Set(all.map((r) => r.id)).size).toBe(9);
    for (const r of all) {
      expect(r.text.length).toBeGreaterThan(3);
      expect(findReason(r.id)).toEqual(r);
    }
    expect(findReason("R1_AGE.nope")).toBeNull();
    expect(findReason("garbage")).toBeNull();
    expect(Object.keys(narrative.reasons).sort()).toEqual(all.map((r) => r.id).sort());
  });

  test("every condition the generator can produce has a reason", () => {
    for (const shift of shifts) {
      const ctx = createContext(shift.shift_date, { activation: { mode: "sandbox", rule_ids: ALL } });
      for (const p of perturbers) {
        for (const c of p.conditions(ctx)) {
          const match = reasonCatalog(ALL).flatMap((g) => g.reasons).find((r) => r.rule_id === p.rule_id && r.condition === conditionKey(c));
          expect(match, `${p.rule_id}: ${c}`).toBeDefined();
        }
      }
    }
  });

  test("conditionKey drops the parenthesised date only", () => {
    expect(conditionKey("below eligibility date for the next election (2026-11-03)")).toBe("below eligibility date for the next election");
    expect(conditionKey("no address listed")).toBe("no address listed");
  });
});

// ---- Valid sources: fixtures ---------------------------------------------------------------

describe("fields of a document", () => {
  test("the form, residency declaration and cards list their printed fields", () => {
    const a = app();
    const docs = presentedDocuments(a);
    expect(docs.map((d) => d.doc_type)).toEqual(["application_form", "sd_drivers_license", "residency_declaration", "sd_drivers_license"]);
    expect(fieldsOfDoc(docs[0]!)).toEqual(["name", "birth_date", "photocopy"]);
    expect(fieldsOfDoc(docs[2]!)).toEqual(["name", "address", "photocopy"]);
    expect(fieldsOfDoc(docs[1]!)).toEqual([
      "name", "birth_date", "address", "issue_date", "expiry_date", "issuing_jurisdiction", "fine_print", "photocopy",
    ]);
  });

  test("a residency declaration with no address still offers the address field", () => {
    const a = app({ residency_declaration: residency({ address_line: null, address_city: null, address_state: null, address_postal: null }) });
    expect(fieldsOfDoc(presentedDocuments(a)[2]!)).toContain("address");
  });

  test("the identity document listed again as citizenship evidence appears once", () => {
    const id = doc({ doc_id: "id" });
    const a = app({ id_document: id, citizenship_documents: [id] });
    expect(presentedDocuments(a).filter((d) => d.doc_id === "id")).toHaveLength(1);
  });

  test("a tribal card names its issuer field tribe", () => {
    const t = doc({ doc_id: "t", type: "tribal_id", issuing_jurisdiction: "tribe:oglala-sioux", citizenship_verified_marker: null });
    const f = fieldsOfDoc({ doc_id: "t", doc_type: "tribal_id", doc: t });
    expect(f).toContain("tribe");
    expect(f).not.toContain("issuing_jurisdiction");
  });
});

describe("valid sources by condition (fixtures)", () => {
  const AS_OF = "2026-06-01";

  test("R1 below eligibility: any birth-date field, nothing else", () => {
    const a = app({ declared_birth_date: "2015-01-01", id_document: doc({ doc_id: "id", birth_date: "2015-01-01" }), citizenship_documents: [] });
    const r = reason("R1_AGE.below_eligibility");
    expect(isValidSource(a, AS_OF, r, src(a, "a1", "birth_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "id", "birth_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "id", "name"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "res", "address"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, null)).toBe(false);
  });

  test("R1 differs: the ID's date, and any date that disagrees with another", () => {
    const id = doc({ doc_id: "id", birth_date: "1990-01-01" });
    const cit = doc({ doc_id: "c1", type: "birth_certificate", birth_date: "1990-02-02" });
    const a = app({ declared_birth_date: "1990-01-01", id_document: id, citizenship_documents: [cit] });
    const r = reason("R1_AGE.differs");
    expect(isValidSource(a, AS_OF, r, src(a, "id", "birth_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "c1", "birth_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "a1", "birth_date"))).toBe(true); // disagrees with the certificate
    expect(isValidSource(a, AS_OF, r, src(a, "id", "issue_date"))).toBe(false);
  });

  test("R1 differs: a matching date elsewhere is not a source unless it is the ID's", () => {
    const id = doc({ doc_id: "id", birth_date: "1990-01-01" });
    const c1 = doc({ doc_id: "c1", type: "birth_certificate", birth_date: "1990-01-01" });
    const c2 = doc({ doc_id: "c2", type: "us_passport", birth_date: "1990-01-01" });
    const a = app({ declared_birth_date: "1990-01-01", id_document: id, citizenship_documents: [c1, c2] });
    const r = reason("R1_AGE.differs");
    expect(isValidSource(a, AS_OF, r, src(a, "c1", "birth_date"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "id", "birth_date"))).toBe(true);
  });

  test("R2 not SD and no address: the residency declaration's address field", () => {
    const a = app();
    for (const id of ["R2_RESIDENCY.not_sd", "R2_RESIDENCY.no_address"]) {
      const r = reason(id);
      expect(isValidSource(a, AS_OF, r, src(a, "res", "address"))).toBe(true);
      expect(isValidSource(a, AS_OF, r, src(a, "res", "name"))).toBe(false);
      expect(isValidSource(a, AS_OF, r, src(a, "id", "address"))).toBe(false);
      expect(isValidSource(a, AS_OF, r, null)).toBe(false);
    }
  });

  test("R3 photocopy: any part of a photocopied tier-1-type document only", () => {
    const copy = doc({ doc_id: "copy", is_photocopy: true });
    const real = doc({ doc_id: "real" });
    const certCopy = doc({ doc_id: "cert", type: "birth_certificate", is_photocopy: true, citizenship_verified_marker: null });
    const a = app({ citizenship_documents: [copy, real, certCopy] });
    const r = reason("R3_CITIZENSHIP.photocopy");
    expect(isValidSource(a, AS_OF, r, src(a, "copy", "photocopy"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "copy", "issue_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "real", "photocopy"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "cert", "photocopy"))).toBe(false); // tier 2 accepts copies
    expect(isValidSource(a, AS_OF, r, src(a, "res", "photocopy"))).toBe(false);
  });

  test("R3 name differs: the name on a qualifying-type document that does not match, or the form's name", () => {
    const other = doc({ doc_id: "other", name: "Someone Else" });
    const same = doc({ doc_id: "same" });
    const unrec = doc({ doc_id: "unrec", type: "other_unrecognized", name: "Third Person", citizenship_verified_marker: null });
    const a = app({ citizenship_documents: [other, same, unrec] });
    const r = reason("R3_CITIZENSHIP.name_differs");
    expect(isValidSource(a, AS_OF, r, src(a, "other", "name"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "a1", "name"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "same", "name"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "unrec", "name"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "other", "birth_date"))).toBe(false);
  });

  test("R3 expired: the expiry field of an expired qualifying-type document", () => {
    const old = doc({ doc_id: "old", expiry_date: "2026-01-01" });
    const fresh = doc({ doc_id: "fresh", expiry_date: "2031-01-01" });
    const a = app({ citizenship_documents: [old, fresh] });
    const r = reason("R3_CITIZENSHIP.expired");
    expect(isValidSource(a, AS_OF, r, src(a, "old", "expiry_date"))).toBe(true);
    expect(isValidSource(a, AS_OF, r, src(a, "old", "issue_date"))).toBe(false);
    expect(isValidSource(a, AS_OF, r, src(a, "fresh", "expiry_date"))).toBe(false);
  });

  test("absence reasons take no source", () => {
    const a = app();
    for (const id of ["R3_CITIZENSHIP.no_qualifying", "R1_AGE.no_birth_date"]) {
      const r = reason(id);
      expect(isValidSource(a, AS_OF, r, null)).toBe(true);
      expect(isValidSource(a, AS_OF, r, src(a, "id", "name"))).toBe(false);
      expect(validSources(a, AS_OF, r)).toEqual([]);
    }
  });

  test("a source naming a field the document does not print is never valid", () => {
    const a = app();
    expect(isValidSource(a, AS_OF, reason("R1_AGE.below_eligibility"), { doc_id: "a1", doc_type: "application_form", field: "expiry_date" })).toBe(false);
    expect(isValidSource(a, AS_OF, reason("R1_AGE.below_eligibility"), { doc_id: "nope", doc_type: "tribal_id", field: "birth_date" })).toBe(false);
  });
});

// ---- Valid sources: generated applicants ---------------------------------------------------

describe("valid sources by condition (generated applicants)", () => {
  const cases: [string, string][] = [
    ["R1_AGE", "below eligibility date for the next election"],
    ["R1_AGE", "differs between documents"],
    ["R2_RESIDENCY", "address state is not South Dakota"],
    ["R2_RESIDENCY", "no address listed"],
    ["R3_CITIZENSHIP", "photocopy presented where original required"],
    ["R3_CITIZENSHIP", "name differs between documents"],
    ["R3_CITIZENSHIP", "document expired"],
    ["R3_CITIZENSHIP", "no qualifying document presented"],
  ];

  for (const [rule_id, key] of cases) {
    test(`${rule_id}: ${key}`, () => {
      const f = pickByIntent(rule_id, key);
      const r = reasonCatalog(ALL).flatMap((g) => g.reasons).find((x) => x.rule_id === rule_id && x.condition === key)!;
      // The engine reports exactly this condition for this applicant.
      expect(conditionKey(failing(f, rule_id))).toBe(key);
      const good = validSources(f.a, f.as_of, r);
      const all = allSources(f.a);
      if (!r.needs_source) {
        expect(good).toEqual([]);
        expect(reasonConfirmed(f.a, f.as_of, f.results, r, null)).toBe(true);
        expect(reasonConfirmed(f.a, f.as_of, f.results, r, all[0]!)).toBe(false);
        return;
      }
      expect(good.length).toBeGreaterThan(0);
      for (const s of good) expect(reasonConfirmed(f.a, f.as_of, f.results, r, s)).toBe(true);
      const bad = all.filter((s) => !good.some((g) => g.doc_id === s.doc_id && g.field === s.field));
      expect(bad.length).toBeGreaterThan(0);
      for (const s of bad) expect(reasonConfirmed(f.a, f.as_of, f.results, r, s)).toBe(false);
      expect(reasonConfirmed(f.a, f.as_of, f.results, r, null)).toBe(false);
    });
  }

  test("the generated R1 differs applicant: the ID's date is among the valid sources", () => {
    const f = pickByIntent("R1_AGE", "differs between documents");
    const id = f.a.id_document!;
    const r = reason("R1_AGE.differs");
    expect(isValidSource(f.a, f.as_of, r, { doc_id: id.doc_id, doc_type: id.type, field: "birth_date" })).toBe(true);
  });

  test("the generated R2 applicants: only the residency address is valid", () => {
    for (const key of ["address state is not South Dakota", "no address listed"]) {
      const f = pickByIntent("R2_RESIDENCY", key);
      const r = reasonCatalog(["R2_RESIDENCY"])[0]!.reasons.find((x) => x.condition === key)!;
      const good = validSources(f.a, f.as_of, r);
      expect(good).toEqual([{ doc_id: f.a.residency_declaration.doc_id, doc_type: "residency_declaration", field: "address" }]);
    }
  });
});

describe("reason confirmation", () => {
  test("the right reason with the right source is confirmed; a wrong reason is not", () => {
    const f = pickByIntent("R2_RESIDENCY", "address state is not South Dakota");
    const right = reason("R2_RESIDENCY.not_sd");
    const s = validSources(f.a, f.as_of, right)[0]!;
    expect(reasonConfirmed(f.a, f.as_of, f.results, right, s)).toBe(true);
    expect(reasonConfirmed(f.a, f.as_of, f.results, reason("R2_RESIDENCY.no_address"), s)).toBe(false); // other condition
    expect(reasonConfirmed(f.a, f.as_of, f.results, reason("R3_CITIZENSHIP.no_qualifying"), null)).toBe(false); // rule passed
    expect(reasonConfirmed(f.a, f.as_of, f.results, null, null)).toBe(false);
  });

  test("R1's date suffix does not matter when matching the condition", () => {
    const f = pickByIntent("R1_AGE", "below eligibility date for the next election");
    expect(failing(f, "R1_AGE")).toMatch(/\(\d{4}-\d{2}-\d{2}\)$/);
    const r = reason("R1_AGE.below_eligibility");
    expect(reasonConfirmed(f.a, f.as_of, f.results, r, validSources(f.a, f.as_of, r)[0]!)).toBe(true);
  });

  test("with several failing rules, naming any one of them is enough", () => {
    const a = app({
      declared_birth_date: "2015-01-01",
      id_document: doc({ doc_id: "id", birth_date: "2015-01-01" }),
      residency_declaration: residency({ address_state: "MN" }),
      citizenship_documents: [],
    });
    const r = evaluate(a, "2026-06-01", calendar, rules, { mode: "sandbox", rule_ids: ALL });
    if (!r.ok) throw new Error("engine");
    const names = reasonsForResults(r.value.results).map((x) => x.id).sort();
    expect(names).toEqual(["R1_AGE.below_eligibility", "R2_RESIDENCY.not_sd", "R3_CITIZENSHIP.no_qualifying"]);
    const r2 = reason("R2_RESIDENCY.not_sd");
    expect(reasonConfirmed(a, "2026-06-01", r.value.results, r2, src(a, "res", "address"))).toBe(true);
    const r3 = reason("R3_CITIZENSHIP.no_qualifying");
    expect(reasonConfirmed(a, "2026-06-01", r.value.results, r3, null)).toBe(true);
  });

  test("fixtures stay well typed", () => {
    const d: Document = doc();
    expect(d.type).toBe("sd_drivers_license");
  });
});

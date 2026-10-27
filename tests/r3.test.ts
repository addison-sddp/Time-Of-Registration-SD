import { describe, expect, test } from "vitest";
import { r3Citizenship } from "../src/rules/r3_citizenship";
import { calendar } from "../src/data";
import { lookupElection } from "../src/engine/calendar";
import type { Document } from "../src/engine/types";
import { app, doc, NAME } from "./fixtures";

const AS_OF = "2026-05-01";

function run(docs: Document[], applicantName = NAME) {
  const found = lookupElection(calendar, AS_OF);
  if (!found.ok) throw new Error("no election");
  return r3Citizenship.check(
    { application: app({ citizenship_documents: docs, applicant_name: applicantName }), as_of: AS_OF, next_election: found.entry },
    r3Citizenship.params,
  );
}
const cond = (docs: Document[]) => {
  const r = run(docs);
  return r.outcome === "fail" ? r.details.condition : r.outcome;
};

const sd = (o: Partial<Document> = {}) => doc({ type: "sd_drivers_license", issuing_jurisdiction: "SD", issue_date: "2025-08-01", citizenship_verified_marker: true, ...o });
const oos = (o: Partial<Document> = {}) =>
  doc({ type: "other_state_drivers_license", issuing_jurisdiction: "MN", citizenship_verified_marker: true, ...o });
const tribal = (o: Partial<Document> = {}) =>
  doc({ type: "tribal_id", issuing_jurisdiction: "tribe:oglala-sioux", ...o });
const tier2Types = ["birth_certificate", "us_passport", "consular_report_of_birth_abroad", "certificate_of_naturalization"] as const;
const t2 = (type: (typeof tier2Types)[number], o: Partial<Document> = {}) =>
  doc({ type, issuing_jurisdiction: "US", issue_date: null, expiry_date: null, ...o });

describe("R3 tier 1", () => {
  test("SD license issued on 2025-07-01 passes", () => expect(cond([sd({ issue_date: "2025-07-01" })])).toBe("pass"));
  test("SD license issued 2025-07-02 passes", () => expect(cond([sd({ issue_date: "2025-07-02" })])).toBe("pass"));
  test.each([[false], [null]])("new SD license without the marker (%s) fails", (m) =>
    expect(cond([sd({ citizenship_verified_marker: m })])).toBe("no qualifying document presented"));
  test.each([[true], [false], [null]])("old SD license fails regardless of marker (%s)", (m) =>
    expect(cond([sd({ issue_date: "2025-06-30", citizenship_verified_marker: m })])).toBe("no qualifying document presented"));
  test("SD license issued 2025-06-30 fails", () =>
    expect(cond([sd({ issue_date: "2025-06-30" })])).toBe("no qualifying document presented"));
  test("SD license without issue date fails", () => expect(cond([sd({ issue_date: null })])).toBe("no qualifying document presented"));
  test("SD-type license from wrong issuer fails", () =>
    expect(cond([sd({ issuing_jurisdiction: "MN" })])).toBe("no qualifying document presented"));
  test("other-state license with marker passes", () => expect(cond([oos()])).toBe("pass"));
  test("other-state nondriver ID with marker passes", () =>
    expect(cond([oos({ type: "other_state_nondriver_id" })])).toBe("pass"));
  test.each([[false], [null]])("other-state without marker (%s) fails", (m) =>
    expect(cond([oos({ citizenship_verified_marker: m })])).toBe("no qualifying document presented"));
  test("other-state ID issued by SD fails", () =>
    expect(cond([oos({ issuing_jurisdiction: "SD" })])).toBe("no qualifying document presented"));
  test("participating tribal ID passes", () => expect(cond([tribal()])).toBe("pass"));
  test("every listed tribe key passes", () => {
    for (const t of r3Citizenship.params.participating_tribes) {
      expect(cond([tribal({ issuing_jurisdiction: t.key })])).toBe("pass");
    }
  });
  test("non-participating tribe key fails", () =>
    expect(cond([tribal({ issuing_jurisdiction: "tribe:not-listed" })])).toBe("no qualifying document presented"));
  test("photocopy of each tier-1 type fails with photocopy condition", () => {
    for (const d of [sd(), oos(), tribal()]) {
      expect(cond([{ ...d, is_photocopy: true }])).toBe("photocopy presented where original required");
    }
  });
  test("photocopy of an SD license issued before the cutoff is not tier 1", () =>
    expect(cond([sd({ issue_date: "2025-06-30", is_photocopy: true })])).toBe("no qualifying document presented"));
  test("expired tier 1 fails", () =>
    expect(cond([sd({ expiry_date: "2026-04-30" })])).toBe("document expired"));
  test("expiry on as_of is unexpired", () => expect(cond([sd({ expiry_date: AS_OF })])).toBe("pass"));
  test("null expiry passes", () => expect(cond([sd({ expiry_date: null })])).toBe("pass"));
  test("name mismatch fails", () => expect(cond([sd({ name: "Janet Public" })])).toBe("name differs between documents"));
  test("null name on document fails", () => expect(cond([sd({ name: null })])).toBe("name differs between documents"));
  test("name comparison ignores case, spacing and punctuation", () =>
    expect(cond([sd({ name: "  JANE   q public " })])).toBe("pass"));
});

describe("R3 tier 2", () => {
  test.each(tier2Types)("%s original passes", (t) => expect(cond([t2(t)])).toBe("pass"));
  test.each(tier2Types)("%s photocopy passes", (t) => expect(cond([t2(t, { is_photocopy: true })])).toBe("pass"));
  test.each(tier2Types)("%s expired fails", (t) => expect(cond([t2(t, { expiry_date: "2026-04-30" })])).toBe("document expired"));
  test("name mismatch fails", () => expect(cond([t2("us_passport", { name: "Someone Else" })])).toBe("name differs between documents"));
  test("unrecognized type fails", () =>
    expect(cond([doc({ type: "other_unrecognized" })])).toBe("no qualifying document presented"));
  test("no documents fails", () => expect(cond([])).toBe("no qualifying document presented"));
});

describe("R3 combinations", () => {
  test("one qualifying document among failing ones passes", () =>
    expect(cond([sd({ issue_date: "2025-06-30" }), oos({ citizenship_verified_marker: false }), t2("birth_certificate", { is_photocopy: true })])).toBe("pass"));
  test("photocopy condition wins over name condition", () =>
    expect(cond([sd({ is_photocopy: true }), t2("us_passport", { name: "Other Person" })])).toBe("photocopy presented where original required"));
  test("name condition wins over expired condition", () =>
    expect(cond([t2("us_passport", { name: "Other Person" }), t2("birth_certificate", { expiry_date: "2020-01-01" })])).toBe("name differs between documents"));
});

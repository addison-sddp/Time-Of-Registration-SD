import { describe, expect, test } from "vitest";
import { calendar, shifts } from "../src/data";
import { evaluate } from "../src/engine/evaluate";
import type { Document } from "../src/engine/types";
import { generateShift } from "../src/gen";
import { rules } from "../src/rules";
import { app, doc } from "./fixtures";

const AS_OF = "2026-05-01";
const calendarMode = { mode: "calendar" } as const;

const sdNoMarker = (o: Partial<Document> = {}) =>
  doc({ doc_id: "id", type: "sd_drivers_license", issue_date: "2025-08-01", citizenship_verified_marker: false, ...o });
const birthCert = (o: Partial<Document> = {}) =>
  doc({
    doc_id: "bc", type: "birth_certificate", issuing_jurisdiction: "SD", issue_date: "1990-02-01",
    expiry_date: null, citizenship_verified_marker: null, ...o,
  });

function verdict(a: ReturnType<typeof app>) {
  const r = evaluate(a, AS_OF, calendar, rules, calendarMode);
  if (!r.ok) throw new Error("engine error");
  return r.value;
}

describe("a license that is not proof of citizenship is still identity", () => {
  test("new SD license without the marker as ID, plus an original birth certificate: approve", () => {
    const id = sdNoMarker();
    expect(verdict(app({ id_document: id, citizenship_documents: [birthCert()] })).verdict).toBe("approve");
  });
  test("same, with a photocopied birth certificate: approve", () => {
    const id = sdNoMarker();
    expect(verdict(app({ id_document: id, citizenship_documents: [birthCert({ is_photocopy: true })] })).verdict).toBe("approve");
  });
  test("the license listed beside the birth certificate does not change that", () => {
    const id = sdNoMarker();
    expect(verdict(app({ id_document: id, citizenship_documents: [id, birthCert()] })).verdict).toBe("approve");
  });
  test("the same license as the ID with no other document: deny, no qualifying document", () => {
    const v = verdict(app({ id_document: sdNoMarker(), citizenship_documents: [] }));
    expect(v.verdict).toBe("deny");
    expect(v.violated_rule_ids).toEqual(["R3_CITIZENSHIP"]);
    const r3 = v.results.find((x) => x.rule_id === "R3_CITIZENSHIP")?.result;
    expect(r3).toEqual({ outcome: "fail", details: { condition: "no qualifying document presented" } });
  });
  test("the license also listed as the only citizenship document: deny", () => {
    const id = sdNoMarker();
    expect(verdict(app({ id_document: id, citizenship_documents: [id] })).verdict).toBe("deny");
  });
  test("a pre-July SD license as ID behaves the same way", () => {
    const old = sdNoMarker({ issue_date: "2025-06-30" });
    expect(verdict(app({ id_document: old, citizenship_documents: [birthCert()] })).verdict).toBe("approve");
    expect(verdict(app({ id_document: old, citizenship_documents: [] })).verdict).toBe("deny");
  });
});

describe("generator produces these cases on purpose", () => {
  const SALTS = Array.from({ length: 40 }, (_, i) => `sd-marker-${i}`);
  const r3Shifts = shifts.filter((s) => s.shift_date >= "2026-04-01");
  const all = SALTS.flatMap((salt) => r3Shifts.flatMap((s) => generateShift(salt, s).map((g) => ({ g, s }))));
  const isNewSdNoMarker = (d: Document | null) =>
    d !== null && d.type === "sd_drivers_license" && d.issue_date !== null && d.issue_date >= "2025-07-01" &&
    d.citizenship_verified_marker === false;

  test("every generated new SD license has marker true unless deliberately false; old ones are false", () => {
    for (const { g } of all) {
      for (const d of [g.application.id_document, ...g.application.citizenship_documents]) {
        if (d === null || d.type !== "sd_drivers_license") continue;
        if (d.issue_date !== null && d.issue_date < "2025-07-01") expect(d.citizenship_verified_marker).toBe(false);
        else expect(typeof d.citizenship_verified_marker).toBe("boolean");
      }
    }
  });

  test("approve: new SD license without marker as ID, with a separate qualifying document", () => {
    const hits = all.filter(({ g, s }) => {
      const a = g.application;
      if (!isNewSdNoMarker(a.id_document)) return false;
      const r = evaluate(a, s.shift_date, calendar, rules, calendarMode);
      return r.ok && r.value.verdict === "approve" && a.citizenship_documents.some((d) => d.doc_id !== a.id_document?.doc_id);
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  test("deny with no qualifying document: new SD license without marker is the only ID", () => {
    const hits = all.filter(({ g, s }) => {
      const a = g.application;
      if (!isNewSdNoMarker(a.id_document)) return false;
      const r = evaluate(a, s.shift_date, calendar, rules, calendarMode);
      if (!r.ok) return false;
      const r3 = r.value.results.find((x) => x.rule_id === "R3_CITIZENSHIP")?.result;
      return r3?.outcome === "fail" && r3.details.condition === "no qualifying document presented";
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  test("when R3 is inactive, new SD licenses without marker appear as non-qualifying IDs on approvals", () => {
    const early = shifts.filter((s) => s.shift_date < "2026-04-01");
    const hits = SALTS.flatMap((salt) => early.flatMap((s) => generateShift(salt, s).map((g) => ({ g, s })))).filter(
      ({ g, s }) => {
        if (!isNewSdNoMarker(g.application.id_document)) return false;
        const r = evaluate(g.application, s.shift_date, calendar, rules, calendarMode);
        return r.ok && r.value.verdict === "approve";
      },
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from "vitest";
import { CURRENT_SCHEMA_VERSION, isSaveV1, newSave, type DecisionLogEntry, type SaveV1 } from "../src/save";

const base: DecisionLogEntry = {
  shift_id: "s01",
  application_id: "s01-a01",
  as_of: "2025-10-01",
  player_decision: "deny",
  engine_verdict: "deny",
  violated_rule_ids: ["R2_RESIDENCY"],
  attempt_number: 1,
};

const withEntry = (e: unknown): unknown => ({ ...newSave("salt", "2026-01-01T00:00:00Z"), decision_log: [e] });

describe("save validation with the optional denial fields", () => {
  test("the schema version is unchanged", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  test("entries without the new fields stay valid", () => {
    expect(isSaveV1(withEntry(base))).toBe(true);
  });

  test("a full denial entry is valid, with a source or a null source", () => {
    const withSource = {
      ...base,
      denial_reason: { rule_id: "R2_RESIDENCY", condition: "no address listed" },
      denial_source: { doc_type: "residency_declaration", field: "address" },
      reason_confirmed: true,
    };
    expect(isSaveV1(withEntry(withSource))).toBe(true);
    expect(isSaveV1(withEntry({ ...withSource, denial_source: null, reason_confirmed: false }))).toBe(true);
  });

  test("each field may appear alone", () => {
    expect(isSaveV1(withEntry({ ...base, reason_confirmed: false }))).toBe(true);
    expect(isSaveV1(withEntry({ ...base, denial_source: null }))).toBe(true);
    expect(isSaveV1(withEntry({ ...base, denial_reason: { rule_id: "R1_AGE", condition: "differs between documents" } }))).toBe(true);
  });

  test("malformed new fields are rejected", () => {
    expect(isSaveV1(withEntry({ ...base, reason_confirmed: "yes" }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_reason: "R1_AGE" }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_reason: { rule_id: "R1_AGE" } }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_reason: { rule_id: 1, condition: "x" } }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_source: { doc_type: "tribal_id" } }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_source: "name" }))).toBe(false);
    expect(isSaveV1(withEntry({ ...base, denial_reason: null }))).toBe(false);
  });

  test("a save round-trips through JSON with the new fields", () => {
    const save: SaveV1 = {
      ...newSave("salt", "2026-01-01T00:00:00Z"),
      decision_log: [{ ...base, denial_reason: { rule_id: "R3_CITIZENSHIP", condition: "no qualifying document presented" }, denial_source: null, reason_confirmed: true }],
    };
    expect(isSaveV1(JSON.parse(JSON.stringify(save)))).toBe(true);
  });
});

import { describe, expect, test } from "vitest";
import { shifts } from "../src/data";
import type { Document } from "../src/engine/types";
import { backKind, isBookPassport } from "../src/game/docstyle";
import { FLIPPABLE_TYPES } from "../src/game/fineprint";
import { stateShape, STATES_WITH_SHAPE } from "../src/game/stateshape";
import { OTHER_STATES, SD } from "../src/gen/content";
import { generateShift } from "../src/gen";
import { doc } from "./fixtures";

function allDocs(): Document[] {
  const out: Document[] = [];
  for (let i = 0; i < 6; i++) {
    for (const s of shifts) {
      for (const g of generateShift(`doc-backs-${i}`, s)) {
        const a = g.application;
        out.push(...(a.id_document ? [a.id_document] : []), ...a.citizenship_documents, a.residency_declaration);
      }
    }
  }
  return out;
}

describe("which back a card shows", () => {
  test("every generated SD license, photocopy or not, gets the SD back", () => {
    const sd = allDocs().filter((d) => d.type === "sd_drivers_license");
    expect(sd.length).toBeGreaterThan(20);
    expect(sd.some((d) => d.is_photocopy)).toBe(true);
    for (const d of sd) expect(backKind(d)).toBe("sd");
  });
  test("the choice keys on the document type only", () => {
    expect(backKind(doc({ type: "sd_drivers_license", issuing_jurisdiction: null }))).toBe("sd");
    expect(backKind(doc({ type: "sd_drivers_license", issuing_jurisdiction: "MN", is_photocopy: true }))).toBe("sd");
    expect(backKind(doc({ type: "other_state_drivers_license", issuing_jurisdiction: "SD" }))).toBe("generic");
    expect(backKind(doc({ type: "tribal_id" }))).toBe("generic");
  });
  test("SD license is flippable", () => {
    expect(FLIPPABLE_TYPES).toContain("sd_drivers_license");
  });
});

describe("passport book", () => {
  test("a real passport is a book; a photocopy is not", () => {
    expect(isBookPassport(doc({ type: "us_passport", is_photocopy: false }))).toBe(true);
    expect(isBookPassport(doc({ type: "us_passport", is_photocopy: true }))).toBe(false);
    expect(isBookPassport(doc({ type: "sd_drivers_license" }))).toBe(false);
  });
});

describe("state outlines", () => {
  test("every state the generator can produce has an outline", () => {
    for (const code of [SD.code, ...OTHER_STATES.map((s) => s.code)]) {
      expect(STATES_WITH_SHAPE, code).toContain(code);
      const shape = stateShape(code);
      expect(shape).not.toBeNull();
      expect(shape?.d.startsWith("M")).toBe(true);
      expect(shape?.d).not.toMatch(/NaN/);
    }
  });
  test("unknown codes have no outline (generic emblem)", () => {
    expect(stateShape("ZZ")).toBeNull();
    expect(stateShape(null)).toBeNull();
  });
  test("outlines differ from each other", () => {
    const ds = new Set(STATES_WITH_SHAPE.map((c) => stateShape(c)?.d));
    expect(ds.size).toBe(STATES_WITH_SHAPE.length);
  });
});

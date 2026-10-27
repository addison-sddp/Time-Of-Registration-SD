import { describe, expect, test } from "vitest";
import { doc } from "./fixtures";
import {
  STATE_CODES, cardKind, guillocheBands, mrzLines, rosettePath, scallopPath, serialDigits, sineBandPath,
  starPoints, stateStyle, wearFor,
} from "../src/game/docstyle";

describe("state accents", () => {
  test("same code gives the same style, case-insensitively", () => {
    expect(stateStyle("mn")).toEqual(stateStyle("MN"));
    expect(stateStyle("MN")).toEqual(stateStyle("MN"));
  });
  test("every listed state gets its own hue, well separated", () => {
    const hues = STATE_CODES.map((c) => stateStyle(c).hue).sort((a, b) => a - b);
    expect(new Set(hues).size).toBe(STATE_CODES.length);
    for (let i = 1; i < hues.length; i++) expect(hues[i]! - hues[i - 1]!).toBeGreaterThanOrEqual(2);
  });
  test("different states look different", () => {
    expect(stateStyle("MN").accent).not.toBe(stateStyle("IA").accent);
    expect(stateStyle("ND").accent).not.toBe(stateStyle("NE").accent);
  });
  test("unknown and null codes still give a valid style", () => {
    expect(stateStyle(null).accent).toMatch(/^hsl\(/);
    expect(stateStyle("ZZ")).toEqual(stateStyle("zz"));
    const s = stateStyle("ZZ");
    expect(s.lobes).toBeGreaterThanOrEqual(5);
    expect(s.lobes).toBeLessThanOrEqual(9);
  });
});

describe("deterministic wear", () => {
  test("same doc_id gives identical wear", () => {
    expect(wearFor("abc-123")).toEqual(wearFor("abc-123"));
  });
  test("values stay in range and vary across ids", () => {
    const creases = new Set<string>();
    const folds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const w = wearFor(`doc-${i}`);
      creases.add(w.crease);
      folds.add(w.fold);
      expect(w.crease_pos).toBeGreaterThanOrEqual(30);
      expect(w.crease_pos).toBeLessThanOrEqual(70);
      expect(w.fold_size).toBeGreaterThanOrEqual(14);
      expect(w.fold_size).toBeLessThanOrEqual(22);
      expect(Math.abs(w.shift_x)).toBeLessThanOrEqual(0.6);
      expect(Math.abs(w.shift_y)).toBeLessThanOrEqual(0.6);
      expect(Math.abs(w.tilt)).toBeLessThanOrEqual(0.4);
      expect(w.ink).toBeGreaterThanOrEqual(0.84);
      expect(w.ink).toBeLessThanOrEqual(1);
    }
    expect(creases.size).toBe(4);
    expect(folds.size).toBeGreaterThan(2);
  });
});

describe("card kinds and serials", () => {
  test("kind is stable and all three occur", () => {
    expect(cardKind("x1")).toBe(cardKind("x1"));
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => cardKind(`k-${i}`)));
    expect(kinds.size).toBe(3);
  });
  test("serial digits have the requested length and are stable", () => {
    const a = serialDigits("d1", "t", 9);
    expect(a).toMatch(/^\d{9}$/);
    expect(serialDigits("d1", "t", 9)).toBe(a);
    expect(serialDigits("d1", "u", 9)).not.toBe(a);
  });
  test("machine-readable lines are 44 characters from the item's own fields", () => {
    const d = doc({ doc_id: "p1", type: "us_passport", name: "Jane Q Rivers", birth_date: "1990-02-03", expiry_date: "2030-01-02" });
    const [a, b] = mrzLines(d);
    expect(a).toHaveLength(44);
    expect(b).toHaveLength(44);
    expect(a.startsWith("P<USARIVERS<<JANE<Q")).toBe(true);
    expect(b).toContain("900203");
    expect(b).toContain("300102");
    expect(mrzLines(doc({ doc_id: "p2", type: "us_passport", name: null, birth_date: null }))[1]).toHaveLength(44);
  });
});

describe("line geometry", () => {
  test("sine path is deterministic, finite and spans the width", () => {
    const p = sineBandPath(100, 10, 3, 20, 0.5);
    expect(p).toBe(sineBandPath(100, 10, 3, 20, 0.5));
    expect(p.startsWith("M0,")).toBe(true);
    expect(p).toContain("L100,");
    expect(p).not.toMatch(/NaN|Infinity/);
  });
  test("guilloche bands are distinct phases", () => {
    const b = guillocheBands(80, 10, 4, 3, 16);
    expect(b).toHaveLength(4);
    expect(new Set(b).size).toBe(4);
  });
  test("rosette is closed and finite", () => {
    const p = rosettePath(50, 50, 40, 7);
    expect(p.endsWith("Z")).toBe(true);
    expect(p).not.toMatch(/NaN|Infinity/);
    const nums = [...p.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]));
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(101);
    }
  });
  test("scallop path has the expected number of arcs and closes", () => {
    const p = scallopPath(200, 100, 10);
    expect(p.startsWith("M0,0")).toBe(true);
    expect(p.endsWith("Z")).toBe(true);
    expect((p.match(/a/g) ?? []).length).toBe(2 * 10 + 2 * 5);
  });
  test("star has 2n points", () => {
    expect(starPoints(0, 0, 5, 2, 5).split(" ")).toHaveLength(10);
  });
});

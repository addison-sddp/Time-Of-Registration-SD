import { describe, expect, test } from "vitest";
import {
  addDays, addYears, createRng, differentDate, fnv1a, fromDays, hashSeed, mulberry32, randomDate, toDays,
} from "../src/gen";
import { isRealDate } from "./gen_helpers";

describe("mulberry32", () => {
  test("known values (seed 1 matches the published reference output)", () => {
    const next = mulberry32(1);
    expect(next()).toBe(0.6270739405881613);
    expect(next()).toBe(0.002735721180215478);
    expect(next()).toBe(0.5274470399599522);
  });
  test("known value for seed 0", () => {
    const next = mulberry32(0);
    expect(next()).toBe(0.26642920868471265);
    expect(next()).toBe(0.0003297457005828619);
  });
  test("same seed gives the same stream; different seeds differ", () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const c = mulberry32(100);
    const xs = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(xs);
    expect(Array.from({ length: 20 }, c)).not.toEqual(xs);
  });
  test("outputs stay in [0, 1)", () => {
    const next = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hash", () => {
  test("FNV-1a published test vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });
  test("hashSeed known values", () => {
    expect(hashSeed("salt", "s01")).toBe(557428765);
    expect(hashSeed("salt", "s01", 1)).toBe(2624591314);
    expect(hashSeed("salt", "s01", 2)).toBe(897343362);
  });
  test("part boundaries matter and numbers equal their text", () => {
    expect(hashSeed("ab", "c")).not.toBe(hashSeed("a", "bc"));
    expect(hashSeed("salt", "s01", 3)).toBe(hashSeed("salt", "s01", "3"));
  });
  test("results are unsigned 32-bit integers", () => {
    for (const s of ["", "x", "salté中", "long".repeat(50)]) {
      const h = hashSeed(s, 1);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("createRng", () => {
  test("known values", () => {
    const r = createRng(12345);
    expect([r.int(1, 100), r.int(1, 100), r.int(1, 100)]).toEqual([98, 31, 49]);
    expect(r.shuffle([1, 2, 3, 4, 5, 6])).toEqual([6, 4, 1, 2, 3, 5]);
  });
  test("int covers its inclusive range and nothing outside", () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(createRng(1).int(4, 4)).toBe(4);
  });
  test("bad ranges and empty picks throw", () => {
    expect(() => createRng(1).int(5, 4)).toThrow();
    expect(() => createRng(1).pick([])).toThrow();
  });
  test("shuffle returns a permutation and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(5).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort()).toEqual(input);
  });
  test("weighted never returns a zero-weight item", () => {
    const r = createRng(2);
    for (let i = 0; i < 500; i++) expect(r.weighted([["a", 0], ["b", 1]] as const)).toBe("b");
  });
});

describe("generator date arithmetic", () => {
  test("day numbers round-trip", () => {
    expect(toDays("1970-01-01")).toBe(0);
    for (const d of ["2025-10-01", "2026-06-23", "2000-03-01", "1999-12-31", "2008-06-02"]) {
      expect(fromDays(toDays(d))).toBe(d);
    }
  });
  test("addDays crosses month and year boundaries", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-06-02", 21)).toBe("2026-06-23");
  });
  test("Feb 29 is never emitted", () => {
    expect(addDays("2008-02-28", 1)).toBe("2008-03-01");
    expect(addDays("2008-03-01", -1)).toBe("2008-02-28");
    expect(addYears("2007-02-28", 1)).toBe("2008-02-28");
    const rng = createRng(3);
    for (let i = 0; i < 3000; i++) {
      const d = randomDate(rng, "2007-12-01", "2008-04-30");
      expect(d.endsWith("-02-29")).toBe(false);
      expect(isRealDate(d)).toBe(true);
      expect(d >= "2007-12-01" && d <= "2008-04-30").toBe(true);
    }
  });
  test("randomDate honors a one-day range and rejects an inverted one", () => {
    expect(randomDate(createRng(1), "2026-06-02", "2026-06-02")).toBe("2026-06-02");
    expect(() => randomDate(createRng(1), "2026-06-03", "2026-06-02")).toThrow();
  });
  test("differentDate always differs", () => {
    const rng = createRng(4);
    for (let i = 0; i < 500; i++) expect(differentDate(rng, "2000-03-01")).not.toBe("2000-03-01");
  });
});

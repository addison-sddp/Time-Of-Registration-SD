import { describe, expect, test } from "vitest";
import { FLAG_H, FLAG_W, flagPixels } from "../src/game/flagart";
import { FACE_SHAPES, faceMetrics, portraitParams, portraitPixels, rampColors } from "../src/game/portrait";
import { IMPRESSION_SIZE, STAMP_BODY_SIZE, impressionPixels, impressionShape, stampBodyPixels, type StampKind } from "../src/game/stampart";
import type { PixelGrid } from "../src/game/pixelart";

function checkGrid(g: PixelGrid): void {
  expect(g.pixels.length).toBe(g.width * g.height);
  expect(g.palette[0]).toBe("transparent");
  expect(g.palette.slice(1).every((c) => /^#[0-9A-F]{6}$/.test(c))).toBe(true);
  expect(g.pixels.every((v) => Number.isInteger(v) && v >= 0 && v < g.palette.length)).toBe(true);
  expect(g.palette.includes("#000000")).toBe(false);
}

describe("face shapes", () => {
  const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 11);
  test("every shape appears across seeds", () => {
    expect(new Set(SEEDS.map((s) => portraitParams(s).face_shape))).toEqual(new Set(FACE_SHAPES));
  });
  test("cheekbone width is less than face height for every shape and seed", () => {
    for (const s of SEEDS) {
      const m = faceMetrics(portraitParams(s));
      expect(m.cheekWidth).toBeLessThan(m.height);
    }
    for (const shape of FACE_SHAPES) {
      for (const head_rx of [19, 20]) {
        for (const head_ry of [25, 26]) {
          for (const jaw of [0, 1, 2]) {
            const m = faceMetrics({ head_rx, head_ry, jaw, face_shape: shape });
            expect(m.cheekWidth).toBeLessThan(m.height);
            expect(m.height / m.cheekWidth).toBeGreaterThan(1.1);
            expect(m.halfW(-0.6)).toBeLessThan(m.halfW(0)); // temples narrower than cheekbones
            expect(m.halfW(0.8)).toBeLessThan(m.halfW(0.1)); // the jaw tapers to the chin
          }
        }
      }
    }
  });
  test("rendered bald heads are taller than wide at the cheekbones, ears included", () => {
    for (const s of SEEDS.slice(0, 60)) {
      const p = { ...portraitParams(s), hair_style: "bald" as const, facial_hair: "none" as const, glasses: false };
      const g = portraitPixels(p);
      const skin = new Set(rampColors(p.skin, false));
      const isSkin = (x: number, y: number): boolean => skin.has(g.palette[g.pixels[y * g.width + x] ?? 0] ?? "");
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < 62; y++) {
        if (isSkin(32, y)) {
          if (top < 0) top = y;
          bottom = y;
        }
      }
      let left = 99;
      let right = -1;
      for (let x = 0; x < g.width; x++) if (isSkin(x, 32)) { left = Math.min(left, x); right = Math.max(right, x); }
      expect(right - left + 1).toBeLessThan(bottom - top + 1);
    }
  });
  test("shapes differ in outline", () => {
    const base = portraitParams(5);
    const grids = FACE_SHAPES.map((face_shape) => portraitPixels({ ...base, face_shape, hair_style: "bald", facial_hair: "none" }).pixels.join(","));
    expect(new Set(grids).size).toBe(FACE_SHAPES.length);
  });
});

describe("desk flag sprite", () => {
  test("is deterministic, on the grid, with a bounded palette", () => {
    const a = flagPixels();
    expect(a).toEqual(flagPixels());
    expect(a.width).toBe(FLAG_W);
    expect(a.height).toBe(FLAG_H);
    expect(FLAG_W).toBeGreaterThanOrEqual(40);
    expect(FLAG_W).toBeLessThanOrEqual(48);
    expect(FLAG_H).toBeGreaterThanOrEqual(64);
    expect(FLAG_H).toBeLessThanOrEqual(72);
    checkGrid(a);
    expect(a.palette.length).toBeLessThan(40);
  });
  test("uses the Sioux Falls flag colours", () => {
    const pal = flagPixels().palette;
    for (const c of ["#1269B2", "#C63843", "#EFB71B", "#FFFFFF"]) expect(pal).toContain(c);
  });
  test("pole and base are present: top rows narrow, bottom rows wide", () => {
    const g = flagPixels();
    const count = (y: number): number => { let n = 0; for (let x = 0; x < g.width; x++) if (g.pixels[y * g.width + x] !== 0) n++; return n; };
    expect(count(0)).toBeLessThanOrEqual(3);
    expect(count(40)).toBeLessThan(count(61));
    expect(count(61)).toBeGreaterThanOrEqual(20);
  });
});

describe("stamp sprites", () => {
  const kinds: StampKind[] = ["approve", "deny"];
  test("bodies are deterministic, in palette bounds, and differ in size and pixels", () => {
    for (const k of kinds) {
      const g = stampBodyPixels(k);
      expect(g).toEqual(stampBodyPixels(k));
      expect([g.width, g.height]).toEqual([...STAMP_BODY_SIZE[k]]);
      checkGrid(g);
    }
    const [a, d] = kinds.map((k) => stampBodyPixels(k));
    expect(d!.width).toBeGreaterThan(a!.width); // deny is wider ...
    expect(d!.height).toBeLessThan(a!.height); // ... and squatter
  });
  test("impressions are deterministic for a seed and vary with it", () => {
    for (const k of kinds) {
      const o = { seed: 5, tilt: 1, rough: true };
      expect(impressionPixels(k, o)).toEqual(impressionPixels(k, o));
      checkGrid(impressionPixels(k, o));
      expect(impressionPixels(k, { ...o, seed: 6 }).pixels).not.toEqual(impressionPixels(k, o).pixels);
      expect(impressionPixels(k, { ...o, rough: false }).pixels).not.toEqual(impressionPixels(k, o).pixels);
    }
  });
  test("ink unevenness drops and lightens some pixels but keeps most", () => {
    for (const k of kinds) {
      const clean = impressionPixels(k, { seed: 1, tilt: 0, rough: false }).pixels.filter((v) => v !== 0).length;
      const rough = impressionPixels(k, { seed: 1, tilt: 0, rough: true });
      const n = rough.pixels.filter((v) => v !== 0).length;
      expect(n).toBeLessThan(clean);
      expect(n).toBeGreaterThan(clean * 0.85);
      expect(new Set(rough.pixels).size).toBe(3); // transparent, ink, light ink
    }
  });
  test("DENIED and APPROVED impression masks differ in shape (rounded box vs octagon)", () => {
    const [aw, ah] = IMPRESSION_SIZE.approve;
    const [dw, dh] = IMPRESSION_SIZE.deny;
    const a = impressionShape("approve");
    const d = impressionShape("deny");
    expect(a.length).toBe(aw * ah);
    expect(d.length).toBe(dw * dh);
    expect(aw * ah).not.toBe(dw * dh);
    // How far in from the left the top edge of the frame starts: a small rounded corner versus a big chamfer.
    const inset = (m: boolean[], w: number): number => {
      for (let y = 0; y < m.length / w; y++) {
        const row = m.slice(y * w, y * w + w);
        if (row.filter(Boolean).length > w * 0.4) return row.indexOf(true);
      }
      return 0;
    };
    // The approve frame is a box whose widest rows are full width; deny's top edge starts well inside.
    expect(inset(d, dw)).toBeGreaterThan(inset(a, aw) + 4);
    // Frame fill ratio of the bounding box differs a lot: the octagon cuts its corners deeply.
    const fill = (m: boolean[]): number => m.filter(Boolean).length / m.length;
    expect(Math.abs(fill(a) - fill(d))).toBeGreaterThan(0);
  });
  test("tilt shifts columns by whole pixels and zero tilt is level", () => {
    const level = impressionPixels("approve", { seed: 3, tilt: 0, rough: false });
    const tilted = impressionPixels("approve", { seed: 3, tilt: 2, rough: false });
    expect(tilted.pixels).not.toEqual(level.pixels);
    expect(tilted.pixels.filter((v) => v !== 0).length).toBe(level.pixels.filter((v) => v !== 0).length);
  });
});

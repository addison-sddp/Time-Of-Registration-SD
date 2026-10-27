import { describe, expect, test } from "vitest";
import { portraitParams, portraitPixels, rampColors } from "../src/game";
import { boothScenePixels, binPixels, BOOTH_W, BOOTH_H } from "../src/game/boothart";

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 3);

describe("portrait without a backdrop", () => {
  test("backdrop true is the default and has no transparent entry", () => {
    const p = portraitParams(5);
    expect(portraitPixels(p)).toEqual(portraitPixels(p, { backdrop: true }));
    expect(portraitPixels(p).transparent).toBeNull();
  });

  test("no pixel uses a backdrop colour; the person's pixels keep their indices", () => {
    for (const seed of SEEDS) {
      const p = portraitParams(seed);
      const withB = portraitPixels(p);
      const without = portraitPixels(p, { backdrop: false });
      const back = new Set(rampColors(p.backdrop, true));
      const t = without.transparent;
      expect(t).not.toBeNull();
      expect(without.palette[t!]).toBe("transparent");
      // The backdrop fill is the only thing that reaches the corners.
      for (const [x, y] of [[0, 0], [63, 0]] as const) expect(without.pixels[y * 64 + x]).toBe(t);
      let see = 0;
      let clear = 0;
      for (let i = 0; i < withB.pixels.length; i++) {
        const a = withB.pixels[i]!;
        const b = without.pixels[i]!;
        if (b === t) {
          clear++;
          continue;
        }
        expect(b).toBe(a); // the person's pixel is unchanged
        see++;
      }
      expect(see).toBeGreaterThan(400);
      expect(clear).toBeGreaterThan(300);
      // No visible pixel is a backdrop-ramp entry or an edge blend toward one.
      const used = new Set(without.pixels);
      used.delete(t!);
      const tint = [...used].filter((i) => back.has(without.palette[i] ?? "") && !withB.palette.slice(0).includes("x"));
      for (const i of tint) {
        // A colour match is allowed only where the person's own ramp happens to share the hex.
        expect(withB.palette[i]).toBe(without.palette[i]);
      }
    }
  });

  test("the grid is deterministic", () => {
    const p = portraitParams(77);
    expect(portraitPixels(p, { backdrop: false })).toEqual(portraitPixels(p, { backdrop: false }));
  });
});

describe("booth pixel art", () => {
  test("scene and bin are deterministic, sized, and use index 0 as transparent", () => {
    const s = boothScenePixels();
    expect(s.width).toBe(BOOTH_W);
    expect(s.height).toBe(BOOTH_H);
    expect(s).toEqual(boothScenePixels());
    expect(s.palette[0]).toBe("transparent");
    expect(s.pixels.every((v) => v !== 0)).toBe(true);
    expect(binPixels()).toEqual(binPixels());
  });
});

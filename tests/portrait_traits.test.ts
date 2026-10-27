import { describe, expect, test } from "vitest";
import type { Document } from "../src/engine/types";
import {
  ageAt, applicantTraits, documentTraits, portraitParams, portraitPixels, rampColors, type HairStyle,
  type PortraitPixels, type PortraitTraits,
} from "../src/game/portrait";
import { fnv1a } from "../src/gen/rng";
import { app, doc, residency } from "./fixtures";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 3);
const GRAY = ["#8E8E8A", "#D8D4CA"];

// fnv1a of JSON.stringify(portraitParams(seed)) for seeds i * 7919 + 3, recorded before traits existed.
const GOLDEN: Record<number, number> = {
  3: 3695795414, 7922: 2915767076, 15841: 2227085536, 23760: 2136884873, 31679: 2700247136, 39598: 2230301463,
  47517: 1103151726, 55436: 2080872140, 63355: 1028783737, 71274: 2872398105, 79193: 1313472116, 87112: 875500967,
  95031: 2792812353, 102950: 872296236, 110869: 1602390235, 118788: 1475674534, 126707: 328838741, 134626: 50799867,
  142545: 996237424, 150464: 2016575956, 158383: 1195445798, 166302: 4207310655, 174221: 367864150, 182140: 3649551557,
  190059: 2844000683, 197978: 3033465310, 205897: 2639330988, 213816: 1396485992, 221735: 2589486411, 229654: 3779477795,
  237573: 1966054414, 245492: 3301567030, 253411: 1241295003, 261330: 465492309, 269249: 3416642902, 277168: 1676416601,
  285087: 2125957448, 293006: 2277062339, 300925: 2001785060, 308844: 4222303241,
};

// Top-most visible row per column (the grid drawn without a backdrop).
function tops(g: PortraitPixels): number[] {
  const out: number[] = [];
  for (let x = 0; x < g.width; x++) {
    let y = 0;
    while (y < g.height && g.pixels[y * g.width + x] === g.transparent) y++;
    out.push(y);
  }
  return out;
}

// Proxy for a thin upward spike: a column that reaches higher than BOTH columns d pixels to either
// side, i.e. a protrusion narrower than 2d + 1 columns. Returns the biggest such height in pixels.
function spikeHeight(g: PortraitPixels, d: number): number {
  const h = tops(g);
  let best = 0;
  for (let x = d; x < h.length - d; x++) best = Math.max(best, Math.min(h[x - d]!, h[x + d]!) - h[x]!);
  return best;
}

const usedHex = (g: PortraitPixels): Set<string> => new Set([...new Set(g.pixels)].map((i) => g.palette[i] ?? ""));
const diff = (a: PortraitPixels, b: PortraitPixels): number => a.pixels.reduce((n, v, i) => n + (v !== b.pixels[i] ? 1 : 0), 0);
const HEAVY: HairStyle[] = ["straight_long", "wavy_long", "bob", "braids"];

describe("seed-only portraits are unchanged", () => {
  test("params for existing seeds are byte-identical, with or without empty traits", () => {
    for (const [seed, hash] of Object.entries(GOLDEN)) {
      expect(fnv1a(JSON.stringify(portraitParams(Number(seed))))).toBe(hash);
      expect(portraitParams(Number(seed), { sex: null, age: null })).toEqual(portraitParams(Number(seed)));
    }
  });
});

describe("hair falls with gravity", () => {
  test("no thin upward spikes on long, bobbed or braided hair", () => {
    let checked = 0;
    const variants: (PortraitTraits | undefined)[] = [undefined, { sex: "F", age: 30 }, { sex: "F", age: 19 }, { sex: "M", age: 40 }];
    for (const seed of SEEDS) {
      for (const traits of variants) {
        const p = portraitParams(seed, traits);
        if (!HEAVY.includes(p.hair_style)) continue;
        const g = portraitPixels(p, { backdrop: false });
        checked++;
        expect(spikeHeight(g, 3), `seed ${seed} ${p.hair_style}`).toBeLessThanOrEqual(2);
        expect(spikeHeight(g, 2), `seed ${seed} ${p.hair_style}`).toBeLessThanOrEqual(2);
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  test("long hair and braids reach below the shoulder line", () => {
    let seen = 0;
    for (const seed of SEEDS.slice(0, 200)) {
      const p = portraitParams(seed, { sex: "F", age: 30 });
      if (p.hair_style !== "braids" && p.hair_style !== "straight_long") continue;
      const g = portraitPixels(p, { backdrop: false });
      // Hair-ramp pixels in the bottom rows beside the neck prove it hangs past the shoulders.
      const hair = new Set(rampColors(p.hair, true));
      let n = 0;
      for (let y = 62; y < 78; y++) for (let x = 0; x < g.width; x++) if ((x < 18 || x > 45) && hair.has(g.palette[g.pixels[y * g.width + x]!] ?? "")) n++;
      expect(n, `seed ${seed}`).toBeGreaterThan(0);
      seen++;
    }
    expect(seen).toBeGreaterThan(10);
  });
});

describe("sex drives presentation", () => {
  test("facial hair only for M; F is never bearded", () => {
    for (const seed of SEEDS) {
      expect(portraitParams(seed, { sex: "F", age: 40 }).facial_hair).toBe("none");
    }
    const m = SEEDS.map((s) => portraitParams(s, { sex: "M", age: 40 }).facial_hair);
    expect(m.some((f) => f === "beard")).toBe(true);
  });

  test("mostly conventional hair, with some variation", () => {
    const longish = (sex: "M" | "F"): number =>
      SEEDS.filter((s) => HEAVY.includes(portraitParams(s, { sex, age: 35 }).hair_style)).length / SEEDS.length;
    expect(longish("F")).toBeGreaterThan(0.55);
    expect(longish("M")).toBeLessThan(0.2);
    expect(longish("M")).toBeGreaterThan(0.01);
  });

  test("deterministic", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const t = { sex: "M", age: 66 } as const;
      expect(portraitParams(seed, t)).toEqual(portraitParams(seed, t));
      expect(portraitPixels(portraitParams(seed, t))).toEqual(portraitPixels(portraitParams(seed, t)));
    }
  });
});

describe("age drives looks", () => {
  test("75 and over: gray or white hair pixels and lines of age, every time", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      for (const age of [75, 83, 91]) {
        for (const sex of ["M", "F", null] as const) {
          const p = portraitParams(seed, { sex, age });
          const g = portraitPixels(p, { backdrop: false });
          expect(GRAY, `seed ${seed}`).toContain(p.hair);
          expect(p.hair_style).not.toBe("bald");
          const ramp = new Set(rampColors(p.hair, true));
          const used = usedHex(g);
          expect([...used].some((c) => ramp.has(c)), `hair pixels seed ${seed}`).toBe(true);
          expect(used.has(p.hair), `base gray tone used, seed ${seed}`).toBe(true);
          expect(p.wrinkles).toBeGreaterThanOrEqual(3);
          expect(diff(g, portraitPixels({ ...p, wrinkles: 0 }, { backdrop: false })), `lines seed ${seed}`).toBeGreaterThanOrEqual(8);
          expect(p.age).toBe("older");
        }
      }
    }
  }, 60000);

  test("the oldest faces carry more lines than the merely old", () => {
    let more = 0;
    for (const seed of SEEDS.slice(0, 60)) {
      const old = portraitParams(seed, { sex: "F", age: 91 });
      const mid = { ...old, wrinkles: 2 };
      if (diff(portraitPixels(old), portraitPixels(mid)) > 0) more++;
    }
    expect(more).toBe(60);
  });

  test("25 and under: no gray hair, no lines", () => {
    for (const seed of SEEDS) {
      for (const age of [18, 21, 25]) {
        const p = portraitParams(seed, { sex: seed % 2 === 0 ? "M" : "F", age });
        expect(GRAY).not.toContain(p.hair);
        expect(p.wrinkles ?? 0).toBe(0);
        expect(p.age).toBe("young");
      }
    }
    for (const seed of SEEDS.slice(0, 80)) {
      const p = portraitParams(seed, { sex: "F", age: 20 });
      const g = portraitPixels(p, { backdrop: false });
      expect(diff(g, portraitPixels({ ...p, wrinkles: 0 }, { backdrop: false }))).toBe(0);
      const used = usedHex(g);
      for (const gray of GRAY) expect(used.has(gray)).toBe(false);
    }
  });
});

describe("traits from the data", () => {
  test("ageAt counts whole years", () => {
    expect(ageAt("1990-06-15", "2026-06-14")).toBe(35);
    expect(ageAt("1990-06-15", "2026-06-15")).toBe(36);
    expect(ageAt("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageAt(null, "2026-01-01")).toBeNull();
    expect(ageAt("not a date", "2026-01-01")).toBeNull();
    expect(ageAt("2030-01-01", "2026-01-01")).toBeNull();
  });

  test("applicantTraits: sex from the id document, else the first document with one", () => {
    expect(applicantTraits(app({ declared_birth_date: "1935-03-01", id_document: doc({ sex: "M" }) }), "2026-06-03")).toEqual({ sex: "M", age: 91 });
    const noId = app({ id_document: null, citizenship_documents: [doc({ sex: null }), doc({ sex: "M" })] });
    expect(applicantTraits(noId, "2026-06-03").sex).toBe("M");
    expect(applicantTraits(app({ id_document: null, citizenship_documents: [] }), "2026-06-03").sex).toBeNull();
    // Scripted data written before the field existed has no sex at all.
    const legacy = { ...doc(), sex: undefined } as unknown as Document;
    expect(applicantTraits(app({ id_document: legacy }), "2026-06-03").sex).toBe("F"); // from the citizenship document
    expect(applicantTraits(app({ id_document: legacy, citizenship_documents: [] }), "2026-06-03").sex).toBeNull();
  });

  test("documentTraits: age at issue, else at as_of; sex from the document", () => {
    const d = doc({ birth_date: "1960-01-01", issue_date: "2010-06-01", sex: "M" });
    expect(documentTraits(d, "2026-06-03")).toEqual({ sex: "M", age: 50 });
    expect(documentTraits(doc({ birth_date: "1960-01-01", issue_date: null, sex: "F" }), "2026-06-03")).toEqual({ sex: "F", age: 66 });
    expect(documentTraits(residency(), "2026-06-03")).toEqual({ sex: null, age: null });
  });
});

describe("facial hair is solid and leaves the mouth alone", () => {
  const mass = (p: ReturnType<typeof portraitParams>): { cells: Set<number>; g: PortraitPixels; none: PortraitPixels } => {
    const g = portraitPixels(p, { backdrop: false });
    const none = portraitPixels({ ...p, facial_hair: "none" }, { backdrop: false });
    const cells = new Set<number>();
    g.pixels.forEach((v, i) => {
      if (g.palette[v] !== none.palette[none.pixels[i]!]) cells.add(i);
    });
    return { cells, g, none };
  };
  const SOLID = ["mustache", "goatee", "beard"];

  test("one or two connected masses, no 1-px strands longer than 2 px", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const p = portraitParams(seed, { sex: "M", age: 47 });
      if (!SOLID.includes(p.facial_hair)) continue;
      checked++;
      const { cells } = mass(p);
      // Connected components (8-neighbour).
      const left = new Set(cells);
      let comps = 0;
      for (const start of cells) {
        if (!left.has(start)) continue;
        let size = 1;
        const stack = [start];
        left.delete(start);
        while (stack.length > 0) {
          const c = stack.pop()!;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const n = c + dy * 64 + dx;
              if (left.delete(n)) {
                stack.push(n);
                size++;
              }
            }
          }
        }
        if (size > 2) comps++; // a stray soft-edge speck is not a mass
      }
      expect(comps, `seed ${seed} ${p.facial_hair}`).toBeLessThanOrEqual(p.facial_hair === "beard" ? 3 : 2); // a beard around the mouth hole can split into mustache and two cheek sides
      // A strand is a pixel with nothing beside it on both sides (1 px wide) or nothing above and below
      // (1 px tall): soft edges and tapered tips have a few, a bristle of hairs would have dozens.
      const strand = [...cells].filter((c) => (!cells.has(c - 1) && !cells.has(c + 1)) || (!cells.has(c - 64) && !cells.has(c + 64)));
      expect(strand.length, `seed ${seed} ${p.facial_hair} strand pixels`).toBeLessThanOrEqual(14);
    }
    expect(checked).toBeGreaterThan(40);
  });

  test("the mouth stays visible: mouth rows are identical with and without facial hair", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const p = portraitParams(seed, { sex: "M", age: 47 });
      if (p.facial_hair === "none") continue;
      checked++;
      const { g, none } = mass(p);
      const my = 28 + p.nose_len + 9;
      const hw = Math.floor(p.mouth_w / 2);
      for (const y of [my, my + 1]) {
        for (let x = 32 - hw + 2; x <= 32 + hw - 3; x++) expect(g.palette[g.pixels[y * 64 + x]!], `seed ${seed} ${p.facial_hair} ${x},${y}`).toBe(none.palette[none.pixels[y * 64 + x]!]);
      }
    }
    expect(checked).toBeGreaterThan(80);
  });
});

describe("hair does not poke out sideways", () => {
  test("above ear level no row sticks out more than 1 px past the rows next to it, for every style", () => {
    const styles = new Set<string>();
    for (const seed of SEEDS) {
      for (const traits of [undefined, { sex: "M", age: 47 }, { sex: "F", age: 30 }] as (PortraitTraits | undefined)[]) {
        const p = portraitParams(seed, traits);
        styles.add(p.hair_style);
        const g = portraitPixels(p, { backdrop: false });
        const edge = (y: number, side: -1 | 1): number => {
          let x = side < 0 ? 0 : 63;
          while (x >= 0 && x < 64 && g.pixels[y * 64 + x] === g.transparent) x -= side;
          return side < 0 ? x : 63 - x;
        };
        for (let y = 8; y <= 30; y++) {
          for (const side of [-1, 1] as const) {
            const out = Math.min(edge(y - 1, side), edge(y + 1, side)) - edge(y, side);
            expect(out, `seed ${seed} ${p.hair_style} row ${y}`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    expect(styles.size).toBe(11);
  }, 60000);
});

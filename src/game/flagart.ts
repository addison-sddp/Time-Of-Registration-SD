import { clampI, painter, type PixelGrid } from "./pixelart";

// A 16-bit desk flag: a thin dark pole with a gold spear tip, a wavy cloth with three shaded
// folds, and a round two-tier gold base. The cloth follows the Sioux Falls flag (a public-domain
// design): blue field with a gold sun at the upper left, a red field below, and the stepped
// white and blue bands between them, simplified to pixels. Hue-shifted 3 to 5 tone ramps, light
// from the upper left, outlines in each material's darkest tone.

export const FLAG_W = 44;
export const FLAG_H = 68;
const CLOTH_W = 32;
const CLOTH_H = 22;
const CLOTH_X = 12;
const CLOTH_Y = 9;
const POLE_X = 10; // pole columns are POLE_X and POLE_X + 1

// Tones are dark to light.
export const FLAG_RAMPS = {
  blue: ["#0B4C86", "#1269B2", "#2A86CF"],
  bar: ["#103F6B", "#1B5E96", "#2F7BB4"],
  white: ["#9AA7C4", "#E9EEF7", "#FFFFFF"],
  red: ["#8C2434", "#C63843", "#D9505B"],
  gold: ["#7A4E10", "#B97F1A", "#EFB71B", "#FFD95A", "#FFF2B0"],
  pole: ["#241C2E", "#3F3549", "#6B5F78"],
} as const;
type RampName = keyof typeof FLAG_RAMPS;

// Red top edge per cloth column: four steps rising to the right, joined by short risers.
const KNOTS: readonly (readonly [number, number])[] = [
  [0, 19], [14, 19], [16, 15], [19, 15], [21, 11], [24, 11], [26, 7], [32, 7],
];
function redTop(x: number): number {
  for (let i = 1; i < KNOTS.length; i++) {
    const a = KNOTS[i - 1]!;
    const b = KNOTS[i]!;
    if (x <= b[0]) return Math.round(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
  }
  return 7;
}

const arg = (x: number): number => x * 0.33 + 0.5;
const wave = (x: number): number => Math.round(Math.sin(arg(x)) * (0.4 + (1.6 * x) / (CLOTH_W - 1)) + x * 0.07);
// Fold tone: 0 shade, 1 mid, 2 lit. The cloth gathers into shade at the pole.
const fold = (x: number): number => {
  if (x < 2) return 0;
  const c = Math.cos(arg(x));
  return c > 0.5 ? 0 : c < -0.5 ? 2 : 1;
};

function sunTone(dx: number, dy: number): number {
  const s = dx + dy;
  return s < -2.2 ? 4 : s < 0.2 ? 3 : s < 2.6 ? 2 : 1;
}
function inSun(dx: number, dy: number): boolean {
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const spike = Math.max(0, Math.cos(8 * a)) ** 2;
  return r <= 3.3 + 1.5 * spike;
}

export function flagPixels(): PixelGrid {
  const p = painter(FLAG_W, FLAG_H);
  const ramps = {} as Record<RampName, number[]>;
  for (const k of Object.keys(FLAG_RAMPS) as RampName[]) ramps[k] = p.ramp(FLAG_RAMPS[k]);
  const idx = (r: RampName, t: number): number => ramps[r][clampI(t, 0, ramps[r].length - 1)] ?? 0;
  const owner = new Map<number, RampName>(); // cloth pixels only, for the outline pass
  const own = (x: number, y: number, r: RampName, t: number): void => {
    p.put(x, y, idx(r, t));
    owner.set(y * FLAG_W + x, r);
  };

  // Pole and finial.
  for (let y = 6; y <= 53; y++) {
    p.put(POLE_X, y, idx("pole", 1));
    p.put(POLE_X + 1, y, idx("pole", 0));
    if (y % 11 < 3) p.put(POLE_X, y, idx("pole", 2));
  }
  const G = (t: number): number => idx("gold", t);
  p.put(10, 0, G(4)); p.put(11, 0, G(2));
  p.put(9, 1, G(3)); p.put(10, 1, G(4)); p.put(11, 1, G(2)); p.put(12, 1, G(1));
  p.put(9, 2, G(3)); p.put(10, 2, G(3)); p.put(11, 2, G(2)); p.put(12, 2, G(0));
  p.put(10, 3, G(3)); p.put(11, 3, G(1));
  p.put(8, 4, G(0)); p.put(9, 4, G(2)); p.put(10, 4, G(4)); p.put(11, 4, G(2)); p.put(12, 4, G(1)); p.put(13, 4, G(0));
  p.put(9, 5, G(1)); p.put(10, 5, G(2)); p.put(11, 5, G(1)); p.put(12, 5, G(0));

  // Cloth, composed flat and then moved by the wave column by column.
  for (let x = 0; x < CLOTH_W; x++) {
    const top = redTop(x);
    const f = fold(x);
    for (let y = 0; y < CLOTH_H; y++) {
      let r: RampName;
      let t = f;
      const d = top - y; // rows above the red edge
      if (d <= 0) r = "red";
      else if (d === 1 || d === 3 || d === 5) r = "white";
      else if (d === 2 || d === 4) r = "bar";
      else r = "blue";
      // The sun sits in the blue field at the upper left.
      const sx = x + 0.5 - 6.5;
      const sy = y + 0.5 - 6.5;
      if (r === "blue" && inSun(sx, sy)) {
        r = "gold";
        t = clampI(sunTone(sx, sy) + (f - 1), 1, 4);
      }
      own(CLOTH_X + x, CLOTH_Y + y + wave(x), r, t);
    }
  }
  // Outline pass: cloth pixels touching empty space take their ramp's darkest tone.
  for (const [key, r] of owner) {
    const x = key % FLAG_W;
    const y = (key - x) / FLAG_W;
    if (p.get(x - 1, y) === 0 || p.get(x + 1, y) === 0 || p.get(x, y - 1) === 0 || p.get(x, y + 1) === 0) {
      p.put(x, y, idx(r, 0));
    }
  }
  // Gold rings where the cloth meets the pole.
  for (const y of [CLOTH_Y + 2, CLOTH_Y + CLOTH_H - 3]) {
    p.put(POLE_X, y, G(3));
    p.put(POLE_X + 1, y, G(1));
  }

  // Base: a domed upper tier and a wide lower tier; half widths from the pole's centre line.
  const tiers: { y0: number; w: number[] }[] = [
    { y0: 52, w: [3, 5, 6, 6, 6, 6, 7] },
    { y0: 59, w: [9, 10, 11, 11, 11, 10, 9, 7] },
  ];
  for (const tier of tiers) {
    tier.w.forEach((w, i) => {
      const y = tier.y0 + i;
      const last = tier.w.length - 1;
      for (let x = 11 - w; x <= 10 + w; x++) {
        const u = (x - 10.5) / w;
        const edge = x === 11 - w || x === 10 + w || i === 0 || i === last;
        let t = u < -0.3 ? 3 : u < 0.35 ? 2 : 1;
        if (i === 1 && u < 0.25) t = 4;
        if (i === last - 1) t = Math.max(0, t - 1);
        p.put(x, y, G(edge ? (i === last || x === 10 + w ? 0 : 1) : t));
      }
    });
  }
  // Highlights on the lower tier and a seam shadow under the upper one.
  for (let x = 4; x <= 7; x++) p.put(x, 61, G(4));
  p.put(3, 62, G(3)); p.put(4, 62, G(4));
  for (let x = 5; x <= 16; x++) p.put(x, 59, G(1));
  return p.grid;
}

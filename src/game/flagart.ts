import { clampI, painter, type PixelGrid } from "./pixelart";

// A 16-bit wall flag for the booth's back wall: a short horizontal rod with a gold ball at each
// end, and a cloth hung from it with soft vertical folds and a hem that sags toward the middle (no
// wind, no animation). The cloth follows the Sioux Falls flag (a public-domain design): blue field
// with a gold sun at the upper left, a red field below, and the stepped white and blue bands
// between them, simplified to pixels. Hue-shifted 3 to 5 tone ramps, light from the upper left,
// outlines in each material's darkest tone.

export const FLAG_W = 22;
export const FLAG_H = 18;
const CLOTH_X = 1;
const CLOTH_W = 20;
const CLOTH_H = 13; // rows before the sag; the middle hangs lower
const ROD_Y = 0;

// Tones are dark to light.
export const FLAG_RAMPS = {
  blue: ["#0B4C86", "#1269B2", "#2A86CF"],
  bar: ["#103F6B", "#1B5E96", "#2F7BB4"],
  white: ["#9AA7C4", "#E9EEF7", "#FFFFFF"],
  red: ["#8C2434", "#C63843", "#D9505B"],
  gold: ["#7A4E10", "#B97F1A", "#EFB71B", "#FFD95A", "#FFF2B0"],
  rod: ["#241C2E", "#3F3549", "#6B5F78"],
} as const;
type RampName = keyof typeof FLAG_RAMPS;

// Red top edge per column of the flat 32 x 22 design: four steps rising to the right.
const KNOTS: readonly (readonly [number, number])[] = [
  [0, 19], [14, 19], [16, 15], [19, 15], [21, 11], [24, 11], [26, 7], [32, 7],
];
const FLAT_W = 32;
const FLAT_H = 22;
function redTop(x: number): number {
  for (let i = 1; i < KNOTS.length; i++) {
    const a = KNOTS[i - 1]!;
    const b = KNOTS[i]!;
    if (x <= b[0]) return Math.round(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
  }
  return 7;
}

// Vertical drape folds: tone 0 shade, 1 mid, 2 lit. The cloth gathers into shade at both ends.
const arg = (x: number): number => x * 0.95 + 0.6;
const fold = (x: number): number => {
  if (x < 1 || x > CLOTH_W - 2) return 0;
  const c = Math.cos(arg(x));
  return c > 0.5 ? 0 : c < -0.5 ? 2 : 1;
};
// The hem sags toward the middle; lit ridges hang a little lower than the shaded valleys.
const hemLength = (x: number): number =>
  CLOTH_H + Math.round(2.4 * Math.sin((Math.PI * (x + 0.5)) / CLOTH_W)) + (Math.cos(arg(x)) < -0.3 ? 1 : 0);

function sunTone(dx: number, dy: number): number {
  const s = dx + dy;
  return s < -1.4 ? 4 : s < 0.2 ? 3 : s < 1.8 ? 2 : 1;
}
function inSun(dx: number, dy: number): boolean {
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const spike = Math.max(0, Math.cos(8 * a)) ** 2;
  return r <= 1.9 + 0.8 * spike;
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

  // Cloth, hung from the rod.
  for (let x = 0; x < CLOTH_W; x++) {
    const top = Math.round((redTop(Math.floor((x * FLAT_W) / CLOTH_W)) * CLOTH_H) / FLAT_H);
    const f = fold(x);
    const len = hemLength(x);
    for (let y = 0; y < len; y++) {
      let r: RampName;
      let t = f;
      const d = top - y; // rows above the red edge
      if (d <= 0) r = "red";
      else if (d === 1 || d === 3 || d === 5) r = "white";
      else if (d === 2 || d === 4) r = "bar";
      else r = "blue";
      const sx = x + 0.5 - 4.5;
      const sy = y + 0.5 - 3.5;
      if (r === "blue" && inSun(sx, sy)) {
        r = "gold";
        t = clampI(sunTone(sx, sy) + (f - 1), 1, 4);
      }
      if (y === 0) t = Math.max(0, t - 1); // gathered under the rod
      if (y >= len - 1 && r !== "gold") t = Math.max(0, t - 1); // the hem turns under, a little darker
      own(CLOTH_X + x, ROD_Y + 1 + y, r, t);
    }
  }
  // Outline pass: cloth pixels touching empty space take their ramp's darkest tone.
  for (const [key, r] of owner) {
    const x = key % FLAG_W;
    const y = (key - x) / FLAG_W;
    if (p.get(x - 1, y) === 0 || p.get(x + 1, y) === 0 || p.get(x, y + 1) === 0) p.put(x, y, idx(r, 0));
  }

  // The rod and its gold end balls, drawn last so the cloth tucks under it.
  for (let x = 1; x < FLAG_W - 1; x++) p.put(x, ROD_Y, idx("rod", x % 7 < 3 ? 2 : 1));
  const G = (t: number): number => idx("gold", t);
  p.put(0, ROD_Y, G(3));
  p.put(FLAG_W - 1, ROD_Y, G(1));
  p.put(0, ROD_Y + 1, G(1));
  p.put(FLAG_W - 1, ROD_Y + 1, G(0));
  return p.grid;
}

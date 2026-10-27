import type { Application } from "../engine/types";
import { createRng, hashSeed, type Rng } from "../gen/rng";

// Procedural pixel-art portraits in a warm, stylized, storybook look. Parameters come from a
// seed; the grid is built from the parameters alone. Pure: no DOM, no clock, no unseeded
// randomness. The ui draws the grid as crisp rects at an integer scale.
//
// Look: 64 x 80 head and shoulders, a large head with big eyes, flat clean face lighting from
// the upper left, saturated hue-shifted colour ramps per material (shadows drift toward rosy
// purple, highlights toward warm yellow), coloured outlines (never gray or black), and hair
// built from separate tapered locks with their own edge, fill and highlight streak. Curves are
// smoothed by mixing colours on partly covered pixels; every pixel stays a hard square.

export type HairStyle =
  | "straight_long" | "wavy_long" | "bob" | "curly" | "coily" | "braids"
  | "cropped" | "buzz" | "side_part" | "bald" | "receding";
export type FacialHair = "none" | "stubble" | "mustache" | "goatee" | "beard";
export type MouthKind = "neutral" | "smile" | "flat";
export type Neckline = "crew" | "collared" | "v_neck" | "sweater" | "jacket";
export type BrowShape = "straight" | "arched" | "angled";
export type Age = "young" | "adult" | "older";

export const HAIR_STYLES: readonly HairStyle[] = [
  "straight_long", "wavy_long", "bob", "curly", "coily", "braids",
  "cropped", "buzz", "side_part", "bald", "receding",
];
export const FACIAL_HAIR: readonly FacialHair[] = ["none", "stubble", "mustache", "goatee", "beard"];

export type FaceShape = "oval" | "heart" | "square" | "long" | "round";
export const FACE_SHAPES: readonly FaceShape[] = ["oval", "heart", "square", "long", "round"];

// Hand-placed silhouettes: [t, w] where t runs -1 (crown) .. 1 (chin) and w is the half width as
// a fraction of the cheekbone half width. The widest point sits at about eye-to-nose height, the
// temples are narrower, and the jaw tapers (heart to a point, square to a flat chin with corners).
type Pt = readonly [number, number];
const FACE_PROFILES: Record<FaceShape, readonly Pt[]> = {
  oval: [[-1, 0], [-0.985, 0.26], [-0.95, 0.42], [-0.9, 0.55], [-0.82, 0.68], [-0.72, 0.78], [-0.6, 0.87], [-0.45, 0.94], [-0.3, 0.98], [-0.15, 1], [0.1, 1], [0.25, 0.97], [0.4, 0.9], [0.55, 0.79], [0.7, 0.65], [0.82, 0.52], [0.9, 0.4], [0.96, 0.27], [1, 0.17]],
  heart: [[-1, 0], [-0.985, 0.3], [-0.95, 0.46], [-0.9, 0.58], [-0.82, 0.71], [-0.72, 0.81], [-0.6, 0.88], [-0.45, 0.94], [-0.3, 0.98], [-0.15, 1], [0.05, 1], [0.2, 0.92], [0.35, 0.8], [0.5, 0.66], [0.65, 0.5], [0.8, 0.33], [0.92, 0.18], [1, 0.07]],
  square: [[-1, 0], [-0.985, 0.3], [-0.95, 0.46], [-0.9, 0.58], [-0.8, 0.72], [-0.7, 0.82], [-0.55, 0.9], [-0.4, 0.95], [-0.2, 0.98], [-0.05, 1], [0.2, 1], [0.5, 0.97], [0.7, 0.93], [0.82, 0.86], [0.9, 0.74], [0.95, 0.6], [1, 0.52]],
  long: [[-1, 0], [-0.99, 0.22], [-0.95, 0.4], [-0.9, 0.52], [-0.8, 0.66], [-0.68, 0.78], [-0.5, 0.88], [-0.3, 0.95], [-0.15, 1], [0.25, 1], [0.4, 0.95], [0.55, 0.86], [0.7, 0.74], [0.82, 0.62], [0.9, 0.5], [0.96, 0.38], [1, 0.28]],
  round: [[-1, 0], [-0.97, 0.34], [-0.92, 0.52], [-0.85, 0.66], [-0.75, 0.78], [-0.6, 0.88], [-0.45, 0.95], [-0.3, 0.99], [-0.1, 1], [0.15, 1], [0.3, 0.96], [0.45, 0.89], [0.6, 0.8], [0.75, 0.67], [0.87, 0.52], [0.95, 0.38], [1, 0.28]],
};
// Per shape [width, height] scale on the base half sizes.
const FACE_SCALE: Record<FaceShape, readonly [number, number]> = {
  oval: [1, 1], heart: [1, 1], square: [0.98, 0.97], long: [0.93, 1.04], round: [1.03, 0.97],
};

export interface FaceMetrics {
  rx: number; // cheekbone half width
  ry: number; // half height, crown to chin
  halfW(t: number): number; // half width at t in -1..1
  cheekWidth: number;
  height: number;
}

export function faceMetrics(p: { head_rx: number; head_ry: number; jaw: number; face_shape: FaceShape }): FaceMetrics {
  const [wm, hm] = FACE_SCALE[p.face_shape];
  const rx = p.head_rx * wm;
  const ry = p.head_ry * hm;
  const pts = FACE_PROFILES[p.face_shape];
  const jawAdj = 1 + (p.jaw - 1) * 0.04;
  const halfW = (t: number): number => {
    if (t <= -1) return 0;
    if (t >= 1) return (pts[pts.length - 1]?.[1] ?? 0) * rx * jawAdj;
    for (let i = 1; i < pts.length; i++) {
      const b = pts[i]!;
      if (t <= b[0]) {
        const a = pts[i - 1]!;
        const f = (t - a[0]) / (b[0] - a[0]);
        const w = a[1] + (b[1] - a[1]) * f;
        return w * rx * (t > 0.35 ? jawAdj : 1);
      }
    }
    return 0;
  };
  let wide = 0;
  for (let k = 0; k <= 8; k++) wide = Math.max(wide, halfW(-0.2 + k * 0.05));
  return { rx, ry, halfW, cheekWidth: wide * 2, height: ry * 2 };
}

export interface PortraitParams {
  skin: string; // base (mid) tone of the skin ramp
  skin_shade: string; // paired shade tone from the tone list
  hair: string; // base tone of the hair ramp
  hair_style: HairStyle;
  facial_hair: FacialHair;
  age: Age;
  eye_color: string;
  head_rx: number;
  head_ry: number;
  jaw: number; // 0..2, how much the jaw tapers
  eye_gap: number;
  eye_h: number; // rows of eye: 4 or 5
  brow: BrowShape;
  brow_thick: number; // 1 or 2
  nose_len: number;
  mouth: MouthKind;
  mouth_w: number;
  glasses: boolean;
  glasses_color: string;
  glasses_round: boolean;
  earrings: boolean;
  earring_color: string;
  clip: boolean;
  clip_color: string;
  blush: boolean;
  freckles: boolean;
  mole: number; // 0 none, -1 left cheek, 1 right cheek
  neckline: Neckline;
  shirt: string;
  shirt2: string; // inner shirt (collared, jacket)
  part_side: number; // -1 or 1
  backdrop: string;
  detail_seed: number;
  face_shape: FaceShape;
}

// Limited palettes: a wide range of skin and hair tones.
export const SKIN_TONES: readonly (readonly [string, string])[] = [
  ["#F1D3B8", "#D9B293"],
  ["#E8BE98", "#C99C77"],
  ["#D8A57A", "#B78558"],
  ["#C08A5E", "#9C6B43"],
  ["#A5704A", "#80532F"],
  ["#8A5A3B", "#6A4126"],
  ["#6B4429", "#4F3019"],
  ["#4F3322", "#382314"],
];
export const HAIR_TONES: readonly string[] = [
  "#1C1612", "#3A2A1E", "#5A3D26", "#8A5E34", "#B58A4C", "#8E8E8A", "#D8D4CA", "#6E3A2A",
];
const GRAY_HAIR: readonly string[] = ["#8E8E8A", "#D8D4CA"];
const EYE_COLORS: readonly string[] = ["#7A4A22", "#4A2A18", "#9A7428", "#3F8F5A", "#3A78C4", "#6E8CA8"];
const SHIRTS: readonly string[] = ["#2A4F9A", "#3F7A5A", "#B83A3A", "#1F8A78", "#8A6A9A", "#C9892E", "#6A4AA8", "#D4683A"];
const INNER_SHIRTS: readonly string[] = ["#F2EEE2", "#CFE0EE", "#F4DFC4", "#D8EAD6"];
const BACKDROPS: readonly string[] = ["#E8CFA4", "#B8D4C2", "#F0C8B0", "#B4C8E0"];
const FRAME_COLORS: readonly string[] = ["#3E3A58", "#7A3F2A", "#B83A3A", "#2F6A8A", "#8A6A2A"];
const METALS: readonly string[] = ["#D9A82A", "#B8BCC8"];
const CLIP_COLORS: readonly string[] = ["#C23A4A", "#1F9A82", "#E0A82A", "#3A78C4"];
const MOUTHS: readonly MouthKind[] = ["neutral", "smile", "flat"];
const NECKLINES: readonly Neckline[] = ["crew", "collared", "v_neck", "sweater", "jacket"];
const BROWS: readonly BrowShape[] = ["straight", "arched", "angled"];

export function portraitParams(seed: number): PortraitParams {
  const rng = createRng(hashSeed("portrait", seed));
  const [skin, skin_shade] = rng.pick(SKIN_TONES);
  const age = rng.weighted<Age>([["young", 3], ["adult", 4], ["older", 2]]);
  const hair_style = rng.pick(HAIR_STYLES);
  // Hair colour and texture are drawn independently of skin tone. Older people are often gray.
  const hair = age === "older" && rng.chance(0.7) ? rng.pick(GRAY_HAIR) : rng.pick(HAIR_TONES);
  const facial_hair = rng.weighted<FacialHair>([
    ["none", 55], ["stubble", 12], ["mustache", 10], ["goatee", 8], ["beard", 15],
  ]);
  return {
    skin,
    skin_shade,
    hair,
    hair_style,
    facial_hair,
    age,
    eye_color: rng.pick(EYE_COLORS),
    head_rx: rng.int(19, 20),
    head_ry: rng.int(25, 26),
    jaw: rng.int(0, 2),
    eye_gap: rng.int(8, 9),
    eye_h: rng.int(4, 5),
    brow: rng.pick(BROWS),
    brow_thick: rng.int(1, 2),
    nose_len: rng.int(6, 8),
    mouth: rng.weighted<MouthKind>([["smile", 70], ["neutral", 20], ["flat", 10]]),
    mouth_w: rng.int(6, 8),
    glasses: rng.chance(0.25),
    glasses_color: rng.pick(FRAME_COLORS),
    glasses_round: rng.chance(0.5),
    earrings: rng.chance(0.18),
    earring_color: rng.pick(METALS),
    clip: rng.chance(0.12),
    clip_color: rng.pick(CLIP_COLORS),
    blush: rng.chance(0.65),
    freckles: rng.chance(0.18),
    mole: rng.weighted([[0, 80], [-1, 10], [1, 10]] as const),
    neckline: rng.pick(NECKLINES),
    shirt: rng.pick(SHIRTS),
    shirt2: rng.pick(INNER_SHIRTS),
    part_side: rng.chance(0.5) ? -1 : 1,
    backdrop: rng.pick(BACKDROPS),
    detail_seed: rng.int(0, 0x7fffffff),
    face_shape: rng.pick(FACE_SHAPES),
  };
}

// The seed shown in the booth: the identity document's, else any document's, else a hash
// of the application id so every applicant still has a face.
export function applicantPortraitSeed(app: Application): number {
  const docs = [app.id_document, ...app.citizenship_documents];
  for (const d of docs) if (d !== null && d.portrait_seed !== null) return d.portrait_seed;
  return hashSeed(app.application_id);
}

// ---- Colour helpers (integer HSL) ----------------------------------------------------------

const clampI = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = lig - c / 2;
  const hex = (v: number): string => clampI(Math.round((v + m) * 255), 0, 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

// Moves hue h toward target by at most amt degrees, the short way round.
function hueToward(h: number, target: number, amt: number): number {
  const diff = ((target - h + 540) % 360) - 180;
  return (h + clampI(diff, -amt, amt) + 360) % 360;
}

// Five tones, darkest to lightest. The base colour is the middle tone, unchanged.
// Shadows drift toward a rosy purple and darker; highlights toward warm yellow and lighter.
// `rich` lifts saturation (and keeps the darkest tones tinted, never gray) for hair, clothes and props.
export function rampColors(base: string, rich = false): string[] {
  const [h, s, l] = hexToHsl(base);
  const mk = (dl: number, toward: number, amt: number, ds: number, minS = 0): string =>
    hslToHex(hueToward(h, toward, amt), clampI(Math.max(s + ds, minS), 0, 100), clampI(l + dl, 4, 96));
  return rich
    ? [mk(-26, 335, 26, 6, 26), mk(-13, 345, 14, 4, 16), base.toUpperCase(), mk(10, 48, 9, 10), mk(20, 52, 14, 16)]
    : [mk(-24, 350, 14, 4), mk(-12, 352, 8, 3), base.toUpperCase(), mk(9, 48, 6, 2), mk(17, 50, 9, 0)];
}

function mixHex(a: string, b: string, num: number, den: number): string {
  const ch = (i: number): string =>
    Math.floor((parseInt(a.slice(i, i + 2), 16) * (den - num) + parseInt(b.slice(i, i + 2), 16) * num) / den)
      .toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`.toUpperCase();
}

// ---- Pixel grid -----------------------------------------------------------------------------

export const PX_W = 64;
export const PX_H = 80;

export interface PortraitPixels {
  width: number;
  height: number;
  palette: string[];
  pixels: Uint8Array; // row-major palette indices
  transparent: number | null; // palette index of the see-through pixels (backdrop false); else null
}

export interface PortraitOpts {
  backdrop?: boolean; // default true; false leaves the person on a transparent background
}

// Edge pixels that blend toward the backdrop use this mid-tone instead when there is no backdrop.
const NEUTRAL_EDGE = "#7C8892";

interface Ramp {
  idx: number[];
}

interface LockOpts {
  w: number; // root half-width in pixels
  amp?: number; // S-curve amount
  bulge?: number; // outward bow
  bias?: number; // tone shift (negative = deeper, behind)
  ramp?: Ramp;
  blunt?: boolean; // keep a wide tip (deliberate blunt bangs)
  flat?: number; // thin strand: fill with this tone, no rim
}

const W = PX_W;
const H = PX_H;
const CX = 32; // centre line, between pixel columns 31 and 32
const CY = 32; // head centre row
const LASH = "#241622"; // deep purple-black, used only for lashes and pupils
const CATCHLIGHT = "#FFF8EC";
const GLINT = "#F6FAFC";

type Inside = (fx: number, fy: number) => boolean;
type Shade = (x: number, y: number) => number;

export function portraitPixels(p: PortraitParams, opts: PortraitOpts = {}): PortraitPixels {
  const withBackdrop = opts.backdrop !== false;
  const rng: Rng = createRng(hashSeed("portrait-px", p.detail_seed));
  // Blended palette entries, so those that start from the backdrop can be recoloured afterwards.
  const mixes = new Map<number, { a: number; b: number | null; hex: string | null; num: number; den: number }>();
  const bdSet = new Set<number>();
  const fromBackdrop = (i: number): boolean => bdSet.has(i) || mixes.get(i) !== undefined && fromBackdrop(mixes.get(i)!.a);
  const grid = new Uint8Array(W * H);
  const palette: string[] = [];
  const owner = new Map<number, { r: Ramp; l: number }>();
  const cache = new Map<string, number>();

  const addColor = (hex: string): number => {
    if (palette.length >= 255) return 0;
    palette.push(hex);
    return palette.length - 1;
  };
  const rampFrom = (hexes: string[]): Ramp => {
    const r: Ramp = { idx: hexes.map(addColor) };
    r.idx.forEach((i, l) => owner.set(i, { r, l }));
    return r;
  };
  const ramp = (base: string, rich = true): Ramp => rampFrom(rampColors(base, rich));
  const tone = (r: Ramp, l: number): number => r.idx[clampI(l, 0, r.idx.length - 1)] ?? 0;

  const set = (x: number, y: number, v: number): void => {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = v;
  };
  const get = (x: number, y: number): number => (x < 0 || x >= W || y < 0 || y >= H ? 0 : (grid[y * W + x] ?? 0));
  // Shifts a pixel along its own ramp (negative = shadow).
  const adj = (x: number, y: number, d: number): void => {
    const o = owner.get(get(x, y));
    if (o !== undefined) set(x, y, tone(o.r, o.l + d));
  };
  const mixIdx = (a: number, b: number, num: number, den: number): number => {
    const key = `${a}|${b}|${num}|${den}`;
    let v = cache.get(key);
    if (v === undefined) {
      v = addColor(mixHex(palette[a] ?? "#000000", palette[b] ?? "#000000", num, den));
      mixes.set(v, { a, b, hex: null, num, den });
      cache.set(key, v);
    }
    return v;
  };
  const mixHexIdx = (a: number, hex: string, num: number, den: number): number => {
    const key = `${a}|${hex}|${num}|${den}`;
    let v = cache.get(key);
    if (v === undefined) {
      v = addColor(mixHex(palette[a] ?? "#000000", hex, num, den));
      mixes.set(v, { a, b: null, hex, num, den });
      cache.set(key, v);
    }
    return v;
  };
  const single = (hex: string): number => {
    const key = `c|${hex}`;
    let v = cache.get(key);
    if (v === undefined) {
      v = addColor(hex);
      cache.set(key, v);
    }
    return v;
  };

  // Coverage 0..9 of a pixel by a shape: corner and centre tests, then 3 x 3 samples on edges.
  const coverage = (inside: Inside, x: number, y: number): number => {
    const a = inside(x + 0.5, y + 0.5);
    const b = inside(x, y);
    const c = inside(x + 1, y);
    const d = inside(x, y + 1);
    const e = inside(x + 1, y + 1);
    if (a && b && c && d && e) return 9;
    if (!a && !b && !c && !d && !e) return 0;
    let n = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (inside(x + (i + 0.5) / 3, y + (j + 0.5) / 3)) n++;
    return n;
  };

  // Paints a shape: interior by `shade`, a one-pixel rim in `edge`, and mixed pixels just
  // outside the rim for smooth curves.
  const paint = (inside: Inside, shade: Shade, edge: number, y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1): void => {
    y0 = clampI(y0, 0, H - 1);
    y1 = clampI(y1, 0, H - 1);
    x0 = clampI(x0, 0, W - 1);
    x1 = clampI(x1, 0, W - 1);
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    const cv = new Uint8Array(cols * rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cv[(y - y0) * cols + (x - x0)] = coverage(inside, x, y);
    const c = (x: number, y: number): number => {
      if (x < 0 || x >= W || y < 0 || y >= H) return 9;
      if (y < y0 || y > y1 || x < x0 || x > x1) return 0;
      return cv[(y - y0) * cols + (x - x0)] ?? 0;
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = c(x, y);
        if (k < 2) continue;
        if (k >= 5) {
          const rim = c(x - 1, y) < 5 || c(x + 1, y) < 5 || c(x, y - 1) < 5 || c(x, y + 1) < 5;
          set(x, y, rim ? edge : shade(x, y));
        } else {
          set(x, y, mixIdx(get(x, y), edge, 1, k >= 4 ? 2 : 3));
        }
      }
    }
  };

  // Lighting: one source from the upper left.
  const lum = (nx: number, ny: number): number => {
    const nz = Math.sqrt(Math.max(0.04, 1 - nx * nx - ny * ny));
    return -0.46 * nx - 0.5 * ny + 0.7 * nz;
  };

  // ---- Ramps ----
  const skin = ramp(p.skin, false);
  const hairR = ramp(p.hair);
  const iris = ramp(p.eye_color);
  const white = ramp("#F1E9DE");
  const cloth = ramp(p.shirt);
  const inner = ramp(p.shirt2);
  const frame = ramp(p.glasses_color);
  const metal = ramp(p.earring_color);
  const [sh, ss, sl] = hexToHsl(p.skin);
  const lips = ramp(hslToHex(hueToward(sh, 352, 16), clampI(ss + 18, 0, 100), clampI(sl - 8, 26, 72)));
  const bd = ramp(p.backdrop);
  for (const i of bd.idx) bdSet.add(i);
  const lash = single(LASH);

  // ---- Backdrop: flat warm tone, a darker stepped band along the bottom ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const band = y >= 58 || (y >= 56 && (x + y) % 2 === 0);
      set(x, y, tone(bd, band ? 1 : 2));
    }
  }

  // ---- Geometry ----
  const fm = faceMetrics(p);
  const rx = fm.rx;
  const ry = fm.ry;
  const headInside = (ex: number): Inside => (fx, fy) => {
    const dy = fy - CY;
    const t = dy / (ry + (dy > 0 ? ex : 0));
    if (t < -1 || t > 1) return false;
    return Math.abs(fx - CX) <= fm.halfW(t) + ex;
  };
  const head = headInside(0);
  const headLum = (fx: number, fy: number): number => lum((fx - CX) / rx, (fy - CY) / ry);
  const topY = (fx: number): number => {
    const dx = Math.abs(fx - CX);
    for (let fy = CY - ry; fy <= CY; fy += 0.25) if (fm.halfW((fy - CY) / ry) >= dx) return fy;
    return CY;
  };
  const earY = CY + 1.5; // ears sit between eye and nose height
  const earW = fm.halfW((earY - CY) / ry);
  const hairStyle = p.hair_style;

  // ---- Hair helpers ----
  // Hairline height at a column, per style (used for the scalp layer and for spilling curls).
  const sideY: Record<HairStyle, number> = {
    straight_long: 8, wavy_long: 8, bob: 7, curly: 8, coily: 8, braids: 4, cropped: -1, buzz: -2, side_part: 1, bald: -99, receding: -1,
  };
  const hairline = (fx: number): number => {
    const dx = Math.abs(fx - CX);
    const t = Math.min(1.2, dx / rx);
    let y: number;
    if (hairStyle === "coily") y = CY - 13 + 8 * t * t;
    else if (hairStyle === "curly") y = CY - 11 + 8 * t * t;
    else if (hairStyle === "bob") y = CY - 9 + 4 * t * t;
    else if (hairStyle === "receding") y = dx < 9 ? CY - ry + 3 : CY - 10 + 9 * t * t;
    else y = CY - 11 + 9 * t * t;
    if (dx >= rx - 3) y = Math.max(y, CY + sideY[hairStyle]);
    return y;
  };

  // A lock: a curved, tapered band with its own edge, fill and a bright streak along its length.
  // Rasterised by stamping discs along an S-curved centre line, then painting by distance.
  const lock = (x0: number, y0: number, x1: number, y1: number, o: LockOpts): void => {
    const lr = o.ramp ?? hairR;
    const bias = o.bias ?? 0;
    const bulge = o.bulge ?? 0;
    const amp = o.amp ?? 0;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    let nx = -ty;
    let ny = tx;
    if (nx * ((x0 + x1) / 2 - CX) + ny * ((y0 + y1) / 2 - (CY - 4)) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const pad = Math.ceil(o.w + Math.abs(bulge) + Math.abs(amp) * 2 + 3);
    const bx0 = clampI(Math.floor(Math.min(x0, x1)) - pad, 0, W - 1);
    const bx1 = clampI(Math.ceil(Math.max(x0, x1)) + pad, 0, W - 1);
    const by0 = clampI(Math.floor(Math.min(y0, y1)) - pad, 0, H - 1);
    const by1 = clampI(Math.ceil(Math.max(y0, y1)) + pad, 0, H - 1);
    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    const dn = new Float32Array(bw * bh).fill(9);
    const tt = new Float32Array(bw * bh);
    const sd = new Float32Array(bw * bh);
    const steps = Math.max(8, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = bulge * 4 * t * (1 - t) + amp * 10 * t * (1 - t) * (2 * t - 1);
      const cx = x0 + dx * t + nx * off;
      const cy = y0 + dy * t + ny * off;
      const r = Math.max(o.blunt ? 1.7 : 0.55, o.w * (1 - (o.blunt ? 0.4 : 0.92) * t * t));
      for (let py = Math.max(by0, Math.floor(cy - r - 1)); py <= Math.min(by1, Math.ceil(cy + r + 1)); py++) {
        for (let px = Math.max(bx0, Math.floor(cx - r - 1)); px <= Math.min(bx1, Math.ceil(cx + r + 1)); px++) {
          const rxp = px + 0.5 - cx;
          const ryp = py + 0.5 - cy;
          const v = Math.sqrt(rxp * rxp + ryp * ryp) / r;
          const k = (py - by0) * bw + (px - bx0);
          if (v < (dn[k] ?? 9)) {
            dn[k] = v;
            tt[k] = t;
            sd[k] = (tx * ryp - ty * rxp) / r;
          }
        }
      }
    }
    const lightSide = -ty * -0.5 + tx * -0.6 > 0 ? 1 : -1;
    const rim = tone(lr, 0);
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const k = (y - by0) * bw + (x - bx0);
        const v = dn[k] ?? 9;
        if (v > 1.25) continue;
        if (o.flat !== undefined) {
          if (v <= 0.95) set(x, y, tone(lr, o.flat));
          else set(x, y, mixIdx(get(x, y), tone(lr, o.flat), 1, 3));
          continue;
        }
        if (v > 1) {
          set(x, y, mixIdx(get(x, y), rim, 1, 3));
        } else if (v > 0.7) {
          set(x, y, rim);
        } else {
          const hs = -((sd[k] ?? 0) * lightSide);
          const t = tt[k] ?? 0;
          let l = hs < -0.55 ? 3 : hs < -0.2 ? (t < 0.88 ? 4 : 3) : hs < 0.3 ? 2 : 1;
          if (t < 0.1) l -= 1;
          set(x, y, tone(lr, l + bias));
        }
      }
    }
  };

  // A rounded clump (curls and coils) with a highlight, lit side and shadow side.
  const clump = (cx: number, cy: number, r: number): void => {
    paint(
      (fx, fy) => (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r,
      (x, y) => {
        const hx = x + 0.5 - (cx - r * 0.38);
        const hy = y + 0.5 - (cy - r * 0.38);
        if (hx * hx + hy * hy <= (r * 0.38) ** 2) return tone(hairR, 4);
        const side = x + 0.5 - cx + (y + 0.5 - cy);
        return tone(hairR, side < -r * 0.5 ? 3 : side > r * 0.5 ? 1 : 2);
      },
      tone(hairR, 0),
      Math.floor(cy - r) - 1,
      Math.ceil(cy + r) + 1,
      Math.floor(cx - r) - 1,
      Math.ceil(cx + r) + 1,
    );
  };

  const longStyle = hairStyle === "straight_long" || hairStyle === "wavy_long" || hairStyle === "bob";
  const endY = hairStyle === "bob" ? CY + ry + 3 : hairStyle === "wavy_long" ? 77 : 75;
  const wavy = hairStyle === "wavy_long";
  const partOff = hairStyle === "side_part" ? -p.part_side * 8 : 0;
  const crownY = topY(CX + partOff) + 1;
  const jit = (n: number): number => rng.int(-n, n);

  // Locks that fall behind the shoulders, in deeper tones, with gaps between them.
  if (longStyle) {
    for (const side of [-1, 1]) {
      const n = hairStyle === "bob" ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        lock(CX + side * (rx * 0.4), crownY + 2, CX + side * (rx + 2 + u * 9 + jit(1)), endY - 2 - rng.int(0, 5) - (hairStyle === "bob" ? 0 : i * 2), {
          w: 4.6, bulge: 3.2, amp: wavy ? 2 * (rng.chance(0.5) ? 1 : -1) : 0.5 * jit(1), bias: -1,
        });
      }
    }
  }

  // ---- Neck ----
  const chinY = CY + ry;
  paint(
    (fx, fy) => fy >= chinY - 8 && fy <= 68 && Math.abs(fx - CX) <= 6,
    (x, y) => tone(skin, y < chinY + 5 ? 1 : x >= CX + 3 ? 1 : 2),
    tone(skin, 0),
  );

  // ---- Clothing ----
  const shoulderTop = (fx: number): number => 62 + 14 * Math.pow(Math.abs(fx - CX) / 32, 2);
  const foldXs = [rng.int(-18, -8), rng.int(6, 14), rng.int(16, 24)];
  const sweater = p.neckline === "sweater";
  const jacket = p.neckline === "jacket";
  paint(
    (fx, fy) => fy >= shoulderTop(fx),
    (x, y) => {
      const dx = x + 0.5 - CX;
      let l = dx < -10 ? 3 : dx < 8 ? 2 : dx < 20 ? 1 : 0;
      if (y <= shoulderTop(x + 0.5) + 1.2 && dx < 6) l += 1;
      for (const fxo of foldXs) {
        const off = x - (CX + fxo) - (y - 66) * 0.55;
        if (y > 67 && Math.abs(off) < 0.8) l -= 1;
        else if (y > 67 && off >= 0.8 && off < 1.8) l += 1;
      }
      if (sweater && (x + (y % 2) * 2) % 4 === 0) l -= 1;
      return tone(cloth, l);
    },
    tone(cloth, 0),
    59,
  );

  // Neckline: an opening showing skin (or the inner shirt), then collar details.
  const vWidth = (fy: number, top: number, tip: number, wide: number): number =>
    fy < top ? wide : fy > tip ? -1 : ((tip - fy) * wide) / (tip - top);
  const NT = 62;
  const openInside: Inside = (fx, fy) => {
    const dx = Math.abs(fx - CX);
    switch (p.neckline) {
      case "crew": {
        const nx = dx / 10;
        const ny = (fy - (NT + 1)) / 8;
        return fy >= NT && nx * nx + ny * ny <= 1;
      }
      case "sweater": {
        const nx = dx / 9;
        const ny = (fy - (NT + 1)) / 6;
        return fy >= NT && nx * nx + ny * ny <= 1;
      }
      case "v_neck":
        return fy >= NT && dx <= vWidth(fy, NT, NT + 15, 11);
      case "collared":
        return fy >= NT && dx <= vWidth(fy, NT, NT + 11, 7);
      case "jacket":
        return fy >= NT && dx <= vWidth(fy, NT, 79, 11);
    }
  };
  const showsShirt = p.neckline === "jacket";
  paint(
    (fx, fy) => openInside(fx, fy) && fy >= shoulderTop(fx) - 1,
    (x, y) => {
      if (showsShirt) return tone(inner, x + 0.5 < CX ? 3 : 2);
      return tone(skin, y < chinY + 5 ? 1 : x >= CX + 3 ? 1 : 2);
    },
    showsShirt ? tone(inner, 1) : tone(skin, 0),
    59,
  );
  if (p.neckline === "collared" || jacket) {
    const w = jacket ? 11 : 7;
    const tip = jacket ? 79 : NT + 11;
    const band: Inside = (fx, fy) => {
      const dx = Math.abs(fx - CX);
      const edge = vWidth(fy, NT, tip, w);
      return fy >= NT - 1 && edge >= 0 && dx > edge && dx <= edge + (jacket ? 5 : 6) && fy <= tip + 4;
    };
    paint(
      band,
      (x, y) => (jacket ? tone(cloth, x + 0.5 < CX ? 4 : 3) : tone(inner, (x + 0.5 < CX ? 3 : 2) + (y < NT + 4 ? 1 : 0))),
      jacket ? tone(cloth, 0) : tone(inner, 1),
      59,
    );
  }
  if (sweater) {
    const rim: Inside = (fx, fy) => {
      const nx = Math.abs(fx - CX) / 12;
      const ny = (fy - (NT + 1)) / 8.5;
      return fy >= NT && nx * nx + ny * ny <= 1 && !openInside(fx, fy);
    };
    paint(rim, (x, y) => tone(cloth, (x + (y % 2) * 2) % 4 === 0 ? 2 : 3), tone(cloth, 0), 59);
  }

  // ---- Ears, then head ----
  for (const side of [-1, 1]) {
    const ecx = CX + side * (earW + 0.3);
    paint(
      (fx, fy) => ((fx - ecx) / 2.4) ** 2 + ((fy - earY) / 4.2) ** 2 <= 1,
      (x, y) => {
        const core = Math.abs(x + 0.5 - ecx) < 1 && y > CY - 1 && y < CY + 4;
        return tone(skin, core ? 1 : side < 0 ? 2 : 1);
      },
      tone(skin, 0),
      CY - 4,
      CY + 8,
    );
  }
  // Flat, clean face lighting: a lit midtone, a shadow side on the right, a soft highlight
  // patch on the forehead and left cheek.
  paint(
    head,
    (x, y) => {
      const l = headLum(x + 0.5, y + 0.5);
      return tone(skin, l > 0.95 ? 3 : l > 0.3 ? 2 : 1);
    },
    tone(skin, 0),
  );

  // ---- Face ----
  const gx = p.eye_gap;
  const lx0 = CX - gx - 4; // left eye, outer corner column (the eye is 8 columns wide)
  const eh = p.eye_h;
  const ey = CY - 4; // first row of the eye (top of the iris)
  const eyeCols = (outer: -1 | 1): ((u: number) => number) =>
    outer < 0 ? (u) => lx0 + u : (u) => W - 1 - (lx0 + u);

  for (const outer of [-1, 1] as const) {
    const X = eyeCols(outer);
    // Big eye: whites at the ends, a large saturated iris, a dark pupil, a bold catchlight.
    for (let r = 0; r < eh; r++) {
      for (let u = 1; u <= 6; u++) set(X(u), ey + r, tone(white, u === 1 || u === 6 ? 1 : r === 0 ? 2 : 3));
      for (let u = 2; u <= 5; u++) {
        const corner = (r === 0 || r === eh - 1) && (u === 2 || u === 5);
        if (corner) continue;
        set(X(u), ey + r, tone(iris, r === 0 ? 1 : r >= eh - 2 ? 3 : 2));
      }
    }
    const pr = ey + Math.floor((eh - 2) / 2) + 1;
    for (const u of [3, 4]) for (const r of [pr, pr + 1]) set(X(u), r, lash);
    const cl = Math.min(X(2), X(5));
    const cr = Math.max(X(2), X(5));
    set(cl + (outer < 0 ? 0 : 0), ey + 1, single(CATCHLIGHT));
    set(cl + 1, ey + 1, single(CATCHLIGHT));
    set(cl, ey + 2, single(CATCHLIGHT));
    set(cr, ey + eh - 2, tone(iris, 4));
    // Thick upper lash line with an outward flick; a lighter lower line.
    for (let u = 0; u <= 7; u++) set(X(u), ey - 1, lash);
    for (let u = 0; u <= 3; u++) set(X(u), ey - 2, lash);
    set(X(-1), ey - 2, lash);
    set(X(-2), ey - 3, lash);
    for (let u = 1; u <= 6; u++) set(X(u), ey + eh, tone(skin, 0));
    for (let u = 1; u <= 6; u++) adj(X(u), ey - 3, -1);
    // Brow: a simple stroke in the hair's dark tone.
    const offs: number[] =
      p.brow === "straight" ? [0, 0, 0, 0, 0, 0, 0, 0, 0]
        : p.brow === "arched" ? [1, 0, -1, -1, -1, -1, 0, 0, 1]
          : [-1, -1, -1, -1, 0, 0, 0, 1, 1];
    const by = ey - 6;
    for (let u = -1; u <= 7; u++) {
      const yy = by + (offs[u + 1] ?? 0);
      set(X(u), yy, tone(hairR, 1));
      if (p.brow_thick === 2 && u >= 0 && u <= 6) set(X(u), yy + 1, tone(hairR, 0));
    }
  }
  // Nose: a small shaded wedge on the shadow side and a highlight pixel.
  const nb = ey + p.nose_len + 2;
  adj(31, nb - 2, 1);
  set(32, nb - 1, tone(skin, 1));
  set(32, nb, tone(skin, 1));
  set(33, nb, tone(skin, 1));
  adj(31, nb, 1);

  // ---- Facial hair (built from tapered clumps, drawn before the mouth) ----
  const my = nb + 7;
  const hw = Math.floor(p.mouth_w / 2);
  const fhOpts = (w: number): LockOpts => ({ w, bulge: 0.4, amp: 0.3 });
  if (p.facial_hair === "mustache" || p.facial_hair === "goatee" || p.facial_hair === "beard") {
    for (const side of [-1, 1]) {
      lock(CX + side * 0.6, my - 3.6, CX + side * 8, my - 0.6 + jit(1), { w: 2.4, bulge: 0.8, amp: side * 0.4 });
    }
  }
  if (p.facial_hair === "goatee") {
    for (const dxo of [-3, 0, 3]) lock(CX + dxo, my + 3, CX + dxo * 1.2, my + 10 + jit(1), fhOpts(2.1));
  }
  if (p.facial_hair === "beard") {
    const beardTop = (dx: number): number => (dx > rx - 4 ? CY - 3 : CY + 4 + (rx - 4 - dx) * 0.5);
    const holeLip: Inside = (fx, fy) => Math.abs(fx - CX) <= hw + 1.5 && fy >= my - 1.5 && fy <= my + 3.5;
    paint(
      (fx, fy) => headInside(0.5)(fx, fy) && fy >= beardTop(Math.abs(fx - CX)) && !holeLip(fx, fy),
      (x, y) => tone(hairR, headLum(x + 0.5, y + 0.5) > 0.5 ? 2 : 1),
      tone(hairR, 1),
    );
    for (let k = 0; k <= 6; k++) {
      const jf = Math.min(1, Math.max(0.4, fm.halfW(0.7) / (rx * 0.8)));
      const xo = (-rx + 5 + k * ((2 * rx - 10) / 6)) * jf;
      if (Math.abs(xo) < 3) continue;
      lock(CX + xo, CY + ry - 8, CX + xo * 1.05, chinY + 2 + rng.int(0, 4), { w: 2.8, bulge: 0.6, amp: 0.3, bias: Math.abs(xo) > 9 ? -1 : 0 });
    }
    for (const side of [-1, 1]) lock(CX + side * (rx - 3), CY - 2, CX + side * (fm.halfW(0.5) - 2), CY + ry - 6, { w: 2.2, bulge: 0.2 });
  }
  if (p.facial_hair === "stubble") {
    for (let y = my - 4; y <= chinY; y++) {
      for (let x = 0; x < W; x++) {
        const fx = x + 0.5;
        const fy = y + 0.5;
        if (!headInside(0)(fx, fy) || fy < CY + 5 || Math.abs(fx - CX) <= hw + 1 && fy > my - 1.5 && fy < my + 3.5) continue;
        if (((x * 73856093) ^ (y * 19349663)) % 3 !== 0) continue;
        if (owner.get(get(x, y))?.r === skin) set(x, y, mixIdx(get(x, y), tone(hairR, 0), 1, 2));
      }
    }
  }

  // ---- Mouth: small, soft lip colour with one darker line; a gentle smile on most ----
  if (p.mouth === "smile") {
    for (let x = CX - hw + 1; x <= CX + hw - 2; x++) set(x, my, tone(lips, 0));
    set(CX - hw, my - 1, tone(lips, 0));
    set(CX + hw - 1, my - 1, tone(lips, 0));
    for (let x = CX - hw + 2; x <= CX + hw - 3; x++) set(x, my + 1, tone(lips, 3));
    adj(CX - hw - 1, my - 1, -1);
    adj(CX + hw, my - 1, -1);
  } else if (p.mouth === "neutral") {
    for (let x = CX - hw + 1; x <= CX + hw - 2; x++) set(x, my, tone(lips, 0));
    for (let x = CX - hw + 2; x <= CX + hw - 3; x++) set(x, my + 1, tone(lips, 3));
    set(31, my - 1, tone(lips, 2));
    set(32, my - 1, tone(lips, 2));
  } else {
    for (let x = CX - hw + 1; x <= CX + hw - 2; x++) set(x, my, tone(lips, 0));
    for (let x = CX - 1; x <= CX; x++) set(x, my + 1, tone(lips, 2));
  }
  for (let x = CX - 2; x <= CX + 1; x++) adj(x, my + 3, -1);

  // ---- Blush, freckles, mole ----
  if (p.blush) {
    for (const side of [-1, 1]) {
      const bx = CX + side * (gx + 4);
      const by = ey + eh + 2;
      for (const [dx2, dy2] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]] as const) {
        if (rng.chance(0.8) && owner.get(get(bx + dx2, by + dy2))?.r === skin) {
          set(bx + dx2, by + dy2, mixHexIdx(get(bx + dx2, by + dy2), "#F4849A", 2, 5));
        }
      }
    }
  }
  if (p.freckles) {
    for (let k = 0; k < 10; k++) {
      const x = rng.int(CX - 13, CX + 12);
      const y = rng.int(ey + eh + 1, ey + eh + 5);
      if (Math.abs(x - CX + 0.5) > 2 && owner.get(get(x, y))?.r === skin) adj(x, y, -2);
    }
  }
  if (p.mole !== 0) adj(p.mole < 0 ? CX - 12 : CX + 11, my - 3, -3);

  // ---- Front hair: a scalp layer, then separate locks ----
  if (hairStyle !== "bald") {
    const vx = hairStyle === "coily" ? 7 : hairStyle === "curly" ? 6 : 2;
    const vy = hairStyle === "coily" ? 7 : hairStyle === "curly" ? 5 : 2;
    const cyH = CY - 4;
    // The scalp follows the skull profile (a taller copy above the centre line, the real
    // temples and cheeks below it), so hair hugs the new head shape.
    const under: Inside = (fx, fy) => {
      const tt = fy <= cyH ? (fy - cyH) / (ry + vy - 1) : Math.max(-0.15, (fy - CY) / ry);
      if (tt < -1 || tt > 1 || Math.abs(fx - CX) > fm.halfW(tt) + vx - 1 || fy >= hairline(fx) + 1) return false;
      return hairStyle !== "receding" || Math.abs(fx - CX) >= 11 || fy < CY - ry + 4;
    };
    paint(under, (x, y) => tone(hairR, hairStyle === "buzz" ? ((x + y) % 3 === 0 ? 2 : 1) : 1), tone(hairR, 0));

    const crown = (spread = 3): [number, number] => [CX + partOff + jit(spread), crownY + rng.int(0, 2)];
    const bangs = (n: number, side: number, drop: number, o: LockOpts): void => {
      for (let i = 0; i < n; i++) {
        const xb = CX + side * ((i + 0.5) / n) * (rx + (hairStyle === "side_part" ? 2 : -1));
        const yb = o.blunt ? CY - 9 : hairline(xb) + drop + rng.int(-1, 1) + (hairStyle === "side_part" ? (i / n) * 3 : 0);
        const [rxp, ryp] = crown();
        lock(rxp, ryp, xb, yb, { ...o, amp: (o.amp ?? 0) + jit(1) * 0.4 });
      }
    };
    const sides = (n: number, side: number, dropEnd: number, ext: number, w: number): void => {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const [rxp, ryp] = crown(2);
        lock(rxp, ryp, CX + side * (rx + ext * (0.3 + 0.7 * u)), CY - 6 + (dropEnd + 6) * u, { w, bulge: 2.4, amp: jit(1) * 0.5 });
      }
    };
    const tufts = (n: number, side: number): void => {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + rng.next() * 0.4) / n;
        const xr = CX + side * u * rx * 0.85;
        const ty = topY(xr);
        lock(CX + side * u * rx * 0.55, ty + 6, xr + side * rng.int(1, 3), ty - rng.int(1, 3), { w: 3.6, bulge: 0.8, amp: side * 0.4 });
      }
    };

    switch (hairStyle) {
      case "cropped":
      case "braids":
        for (const s of [-1, 1]) {
          sides(2, s, hairStyle === "braids" ? 3 : -1, 2, 4.2);
          bangs(3, s, -1, { w: 4, bulge: 0.6 });
          tufts(3, s);
        }
        break;
      case "buzz":
        break;
      case "side_part": {
        const heavy = -Math.sign(partOff || 1);
        sides(2, -heavy, 1, 2, 4.2);
        sides(2, heavy, 1, 3, 4.2);
        bangs(2, -heavy, -1, { w: 4, bulge: 0.6 });
        bangs(4, heavy, 0, { w: 4.2, bulge: 1.2, amp: 0.8 * -heavy });
        tufts(2, -heavy);
        tufts(3, heavy);
        break;
      }
      case "receding":
        for (const s of [-1, 1]) {
          sides(3, s, 3, 3, 4);
          tufts(2, s);
        }
        break;
      case "straight_long":
      case "wavy_long":
      case "bob":
        for (const s of [-1, 1]) {
          const n = hairStyle === "bob" ? 2 : 3;
          for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            const rxp = CX + s * rx * 0.7;
            const ryp = crownY + 3;
            const ex = hairStyle === "bob" ? rx - 1 - 3 * u : rx + 1 + u * 8;
            lock(rxp, ryp, CX + s * ex + jit(1), endY - rng.int(0, 4) - i * 2, {
              w: 4.4, bulge: 3.2, amp: wavy ? 2 * (i % 2 === 0 ? 1 : -1) : 0.4 * jit(1),
            });
          }
          bangs(hairStyle === "bob" ? 4 : 3, s, hairStyle === "bob" ? 0 : 2, hairStyle === "bob" ? { w: 3.6, blunt: true } : { w: 4, bulge: 0.8 });
          tufts(2, s);
        }
        break;
      case "curly":
      case "coily": {
        const coily = hairStyle === "coily";
        const count = coily ? 80 : 46;
        const pts: [number, number, number][] = [];
        for (let k = 0; k < count; k++) {
          const m = rng.next() * 2.1;
          const sa = (2 * m) / (1 + m * m);
          const ca = (1 - m * m) / (1 + m * m);
          const f = 0.62 + rng.next() * 0.55;
          const side = rng.chance(0.5) ? -1 : 1;
          const x = CX + side * (rx + vx) * f * sa;
          const y = cyH - (ry + vy) * f * ca;
          if (y > hairline(x) + 2 && Math.abs(x - CX) < rx - 1) continue;
          pts.push([x, y, (coily ? 2.3 : 3.2) + rng.next() * (coily ? 1 : 1.5)]);
        }
        pts.sort((a, b) => Math.hypot(b[0] - CX, b[1] - cyH) - Math.hypot(a[0] - CX, a[1] - cyH));
        for (const [x, y, r] of pts) clump(x, y, r);
        // Curls over the forehead.
        for (let k = 0; k < 4; k++) clump(CX + (k - 1.5) * 7 + jit(1), hairline(CX + (k - 1.5) * 7) - 1, coily ? 2.4 : 3);
        break;
      }
    }
    if (hairStyle === "braids") {
      const clipR = ramp(p.clip_color);
      for (const side of [-1, 1]) {
        const bx = CX + side * (rx + 1);
        paint(
          (fx, fy) => fy >= CY + 4 && fy <= 77 && Math.abs(fx - bx) <= 3.4 - (fy > 73 ? (fy - 73) * 0.4 : 0),
          (x, y) => {
            const seg = (y + (x < bx ? 0 : 2)) % 6 < 3;
            return y >= 74 ? tone(clipR, 2) : tone(hairR, (seg ? 3 : 1) + (x + 0.5 < bx ? 0 : -1));
          },
          tone(hairR, 0),
        );
      }
    }
    // Loose wisps and strands past the outline.
    if (hairStyle !== "buzz") {
      for (let k = 0; k < 4; k++) {
        const side = rng.chance(0.5) ? -1 : 1;
        const x = CX + side * rng.int(3, Math.floor(rx) - 3);
        const ty = topY(x);
        lock(x, ty + 3, x + side * rng.int(4, 8), ty - rng.int(4, 8), { w: 1.1, amp: side * 0.8, flat: 3 });
      }
    }
  }

  // ---- Glasses ----
  if (p.glasses) {
    const lensHalfW = 6.3;
    const lensHalfH = 5.4;
    const cyl = ey + eh / 2 - 0.6;
    for (const cxl of [lx0 + 4, W - (lx0 + 4)]) {
      const lens = (grow: number): Inside => (fx, fy) => {
        const nx = Math.abs(fx - cxl) / (lensHalfW + grow);
        const ny = Math.abs(fy - cyl) / (lensHalfH + grow);
        return p.glasses_round ? nx * nx + ny * ny <= 1 : nx <= 1 && ny <= 1 && !(nx > 0.82 && ny > 0.82);
      };
      const outerLens = lens(0.55);
      const innerLens = lens(-0.45);
      paint(
        (fx, fy) => outerLens(fx, fy) && !innerLens(fx, fy),
        (x, y) => tone(frame, y + 0.5 < cyl - 1 || x + 0.5 < cxl - 2 ? 3 : 1),
        tone(frame, 1),
        ey - 8,
        ey + eh + 4,
      );
      const gl = single(GLINT);
      set(Math.floor(cxl) - 4, Math.floor(cyl) - 3, gl);
      set(Math.floor(cxl) - 3, Math.floor(cyl) - 2, gl);
    }
    for (let x = Math.ceil(lx0 + 4 + lensHalfW); x <= Math.floor(W - (lx0 + 4) - lensHalfW); x++) set(x, ey + 1, tone(frame, 2));
    for (let x = CX - rx - 1; x < lx0 - 2; x++) set(x, ey + 1, tone(frame, 1));
    for (let x = W - 1 - (lx0 - 3); x <= CX + rx; x++) set(x, ey + 1, tone(frame, 1));
  }

  // ---- Accessories ----
  if (p.earrings) {
    for (const side of [-1, 1]) {
      const x = side < 0 ? CX - Math.round(earW) - 3 : CX + Math.round(earW) + 2;
      set(x, CY + 6, tone(metal, 3));
      set(x + 1, CY + 6, tone(metal, 2));
      set(x, CY + 7, tone(metal, 2));
      set(x + 1, CY + 7, tone(metal, 1));
    }
  }
  if (p.clip && hairStyle !== "bald" && hairStyle !== "buzz") {
    const cr = rampColors(p.clip_color, true);
    const x0 = CX + p.part_side * (rx - 4) - 1;
    const yc = CY - 12;
    set(x0, yc, single(cr[4] ?? p.clip_color));
    set(x0 + 1, yc, single(cr[2] ?? p.clip_color));
    set(x0 + 2, yc, single(cr[1] ?? p.clip_color));
  }

  if (withBackdrop) return { width: W, height: H, palette, pixels: grid, transparent: null };

  // No backdrop: blends that started from the backdrop now start from a neutral mid-tone, and the
  // backdrop pixels themselves become transparent. Every other pixel keeps its index.
  const colorOf = (i: number): string => {
    if (bdSet.has(i)) return NEUTRAL_EDGE;
    const m = mixes.get(i);
    if (m === undefined || !fromBackdrop(i)) return palette[i] ?? "#000000";
    return mixHex(colorOf(m.a), m.b !== null ? colorOf(m.b) : (m.hex ?? "#000000"), m.num, m.den);
  };
  for (const [i] of mixes) if (fromBackdrop(i)) palette[i] = colorOf(i);
  palette.push("transparent");
  const clear = palette.length - 1;
  for (let i = 0; i < grid.length; i++) if (bdSet.has(grid[i] ?? 0)) grid[i] = clear;
  return { width: W, height: H, palette, pixels: grid, transparent: clear };
}

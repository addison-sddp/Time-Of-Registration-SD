import { clampI, hash3, painter, type PixelGrid } from "./pixelart";

// Pixel-art self-inking office stamps (original art, no brands). Two bodies and two ink
// impressions that differ by SHAPE as well as colour and label:
//   approve: a taller body, rounded ink box under the word, green-teal.
//   deny: a squatter, wider body, octagonal frame around the word, brick red.
// The body shows a small lens on top with a miniature of the label in ink, a clear plastic base
// frame with the ink plate inside, and a side button dot.

export type StampKind = "approve" | "deny";

const PLASTIC = ["#1B1826", "#2A2638", "#3A3550", "#5A547E"] as const;
const CLEAR = ["#5E7F8E", "#A9CAD3", "#CFE6EA", "#F2FBFC"] as const;
const PAPER = ["#D8CBA8", "#EFE4C8", "#FFF9E8"] as const;
export const INK: Record<StampKind, readonly string[]> = {
  approve: ["#1C4036", "#2F6B5E", "#4C8E7F", "#86BFB0"],
  deny: ["#5E1E1C", "#8C2F2B", "#B24A44", "#D98A82"],
};

export const STAMP_BODY_SIZE: Record<StampKind, readonly [number, number]> = { approve: [32, 40], deny: [40, 36] };

interface Body {
  x0: number; x1: number; // body columns
  y0: number; y1: number; // body rows (top row y0)
  cut: readonly number[]; // rounded top corner: columns cut on the first rows
  lens: { x0: number; y0: number; x1: number; y1: number; chamfer: number };
  base: { y0: number; y1: number };
  dot: [number, number];
}

const BODIES: Record<StampKind, Body> = {
  approve: {
    x0: 2, x1: 29, y0: 1, y1: 29, cut: [3, 1, 0],
    lens: { x0: 7, y0: 6, x1: 24, y1: 14, chamfer: 0 },
    base: { y0: 32, y1: 38 }, dot: [26, 20],
  },
  deny: {
    x0: 2, x1: 37, y0: 1, y1: 24, cut: [2, 1, 0],
    lens: { x0: 8, y0: 5, x1: 31, y1: 12, chamfer: 2 },
    base: { y0: 27, y1: 33 }, dot: [34, 15],
  },
};

function drawBody(kind: StampKind): PixelGrid {
  const [w, h] = STAMP_BODY_SIZE[kind];
  const b = BODIES[kind];
  const p = painter(w, h);
  const pl = p.ramp(PLASTIC);
  const cl = p.ramp(CLEAR);
  const pa = p.ramp(PAPER);
  const ink = p.ramp(INK[kind]);
  const t = (r: number[], i: number): number => r[clampI(i, 0, r.length - 1)] ?? 0;

  // Plastic body: rounded top corners, lit from the upper left, shaded on the right.
  for (let y = b.y0; y <= b.y1; y++) {
    const off = b.cut[y - b.y0] ?? 0;
    for (let x = b.x0 + off; x <= b.x1 - off; x++) {
      const edge = x === b.x0 + off || x === b.x1 - off || y === b.y0 || y === b.y1;
      let tone = x >= b.x1 - 2 ? 1 : x <= b.x0 + 2 ? 3 : 2;
      if (y === b.y0 + 1 && x < b.x1 - 4) tone = 3;
      if (y >= b.y1 - 2) tone = Math.max(1, tone - 1);
      p.put(x, y, t(pl, edge ? 0 : tone));
    }
  }
  // Collar: a slightly wider lip where the body meets the clear frame.
  for (const [dy, tone] of [[1, 1], [2, 0]] as const) {
    for (let x = b.x0 - 1; x <= b.x1 + 1; x++) p.put(x, b.y1 + dy, t(pl, x === b.x0 - 1 ? 3 : tone));
  }
  // Lens: a frame, then the ink preview of the label on cream, with a glint.
  const L = b.lens;
  for (let y = L.y0; y <= L.y1; y++) {
    for (let x = L.x0; x <= L.x1; x++) {
      const c = Math.min(x - L.x0, L.x1 - x, y - L.y0, L.y1 - y);
      const corner = L.chamfer > 0 && Math.min(x - L.x0, L.x1 - x) + Math.min(y - L.y0, L.y1 - y) < L.chamfer;
      if (corner) continue;
      const diag = L.chamfer > 0 && Math.min(x - L.x0, L.x1 - x) + Math.min(y - L.y0, L.y1 - y) === L.chamfer;
      p.put(x, y, c === 0 || diag ? t(pl, 0) : t(pa, 1));
    }
  }
  const cx0 = L.x0 + 1;
  const cx1 = L.x1 - 1;
  p.put(cx0, L.y0 + 1, t(pa, 2));
  p.put(cx0, L.y0 + 2, t(pa, 2));
  const inkPx = (x: number, y: number, tone = 1): void => p.put(x, y, t(ink, tone));
  if (kind === "approve") {
    for (let i = 0; i < 8; i++) inkPx(cx0 + 2 + i * 2, L.y0 + 3); // eight letters
    for (let x = cx0 + 3; x <= cx1 - 3; x++) { inkPx(x, L.y0 + 5); inkPx(x, L.y0 + 7); } // rounded box
    inkPx(cx0 + 2, L.y0 + 6); inkPx(cx1 - 2, L.y0 + 6);
  } else {
    for (let x = cx0 + 4; x <= cx1 - 4; x++) { inkPx(x, L.y0 + 1); inkPx(x, L.y1 - 1); } // octagon top and bottom
    for (const [dx, y] of [[3, 2], [2, 3], [2, 4], [3, 5]] as const) { inkPx(cx0 + dx, L.y0 + y); inkPx(cx1 - dx, L.y0 + y); }
    for (let i = 0; i < 6; i++) { inkPx(cx0 + 7 + i * 2, L.y0 + 3); inkPx(cx0 + 7 + i * 2, L.y0 + 4); } // six letters
  }
  // Side button dot.
  const [dx, dy] = b.dot;
  inkPx(dx, dy - 1, 3); inkPx(dx - 1, dy, 1); inkPx(dx, dy, 2); inkPx(dx + 1, dy, 1); inkPx(dx, dy + 1, 1);
  // Clear plastic base frame with the ink plate showing through.
  const bx0 = b.x0;
  const bx1 = b.x1;
  for (let y = b.base.y0; y <= b.base.y1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const edge = x === bx0 || x === bx1 || y === b.base.y0 || y === b.base.y1;
      const post = x <= bx0 + 1 || x >= bx1 - 1;
      let tone = edge ? 0 : post ? (x <= bx0 + 1 ? 3 : 1) : 3;
      if (!edge && !post && (x + y) % 5 === 0) tone = 2;
      p.put(x, y, t(cl, tone));
    }
  }
  const py0 = b.base.y0 + 2;
  for (let y = py0; y <= py0 + 2; y++) for (let x = bx0 + 3; x <= bx1 - 3; x++) p.put(x, y, t(ink, y === py0 ? 2 : 1));
  return p.grid;
}

const bodyCache = new Map<StampKind, PixelGrid>();
export function stampBodyPixels(kind: StampKind): PixelGrid {
  let g = bodyCache.get(kind);
  if (g === undefined) {
    g = drawBody(kind);
    bodyCache.set(kind, g);
  }
  return g;
}

// ---- Impressions ---------------------------------------------------------------------------

// 7 x 9 one-pixel-stroke letters. Dilating each by one pixel and keeping only the boundary gives
// outlined block letters with a hollow centre.
const GLYPHS: Record<string, readonly string[]> = {
  A: ["...#...", "..#.#..", "..#.#..", ".#...#.", ".#...#.", ".#####.", "#.....#", "#.....#", "#.....#"],
  P: ["######.", "#.....#", "#.....#", "#.....#", "######.", "#......", "#......", "#......", "#......"],
  R: ["######.", "#.....#", "#.....#", "#.....#", "######.", "#...#..", "#....#.", "#.....#", "#.....#"],
  O: [".#####.", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", ".#####."],
  V: ["#.....#", "#.....#", "#.....#", ".#...#.", ".#...#.", ".#...#.", "..#.#..", "..#.#..", "...#..."],
  E: ["#######", "#......", "#......", "#......", "#####..", "#......", "#......", "#......", "#######"],
  D: ["#####..", "#....#.", "#.....#", "#.....#", "#.....#", "#.....#", "#.....#", "#....#.", "#####.."],
  N: ["#.....#", "##....#", "#.#...#", "#.#...#", "#..#..#", "#...#.#", "#...#.#", "#....##", "#.....#"],
  I: ["#######", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "...#...", "#######"],
};
const PITCH = 10;
type Mask = (x: number, y: number) => boolean;

function wordMask(word: string, ox: number, oy: number): Mask {
  const fill = new Set<number>();
  const key = (x: number, y: number): number => y * 1024 + x;
  [...word].forEach((ch, n) => {
    const g = GLYPHS[ch];
    if (g === undefined) return;
    g.forEach((row, gy) => {
      [...row].forEach((c, gx) => {
        if (c !== "#") return;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) fill.add(key(ox + n * PITCH + gx + 1 + dx, oy + gy + 1 + dy));
      });
    });
  });
  return (x, y) => fill.has(key(x, y)) && !(fill.has(key(x - 1, y)) && fill.has(key(x + 1, y)) && fill.has(key(x, y - 1)) && fill.has(key(x, y + 1)));
}

export const IMPRESSION_SIZE: Record<StampKind, readonly [number, number]> = { approve: [83, 44], deny: [84, 54] };
const wordWidth = (n: number): number => n * PITCH - 1;

// Frame masks. A frame is a ring: the shape minus the same shape inset by the stroke.
function roundedBox(w: number, h: number, ox: number, oy: number, r: number, stroke: number): Mask {
  const inside = (x: number, y: number, s: number): boolean => {
    const lx = x - ox - s;
    const ly = y - oy - s;
    const iw = w - 2 * s;
    const ih = h - 2 * s;
    if (lx < 0 || ly < 0 || lx >= iw || ly >= ih) return false;
    const rr = Math.max(0, r - s);
    const cx = lx < rr ? rr - lx : lx >= iw - rr ? lx - (iw - rr - 1) : 0;
    const cy = ly < rr ? rr - ly : ly >= ih - rr ? ly - (ih - rr - 1) : 0;
    return cx === 0 || cy === 0 || Math.hypot(cx - 0.5, cy - 0.5) <= rr;
  };
  return (x, y) => inside(x, y, 0) && !inside(x, y, stroke);
}

function octagon(w: number, h: number, ox: number, oy: number, chamfer: number, stroke: number): Mask {
  const inside = (x: number, y: number, s: number): boolean => {
    const lx = x - ox - s;
    const ly = y - oy - s;
    const iw = w - 2 * s;
    const ih = h - 2 * s;
    if (lx < 0 || ly < 0 || lx >= iw || ly >= ih) return false;
    const c = Math.max(0, chamfer - Math.round(s * 0.41));
    const nx = Math.min(lx, iw - 1 - lx);
    const ny = Math.min(ly, ih - 1 - ly);
    return nx + ny >= c;
  };
  return (x, y) => inside(x, y, 0) && !inside(x, y, stroke);
}

function impressionMask(kind: StampKind): { w: number; h: number; mask: Mask } {
  const [w, h] = IMPRESSION_SIZE[kind];
  if (kind === "approve") {
    const word = wordMask("APPROVED", 2, 2);
    const box = roundedBox(wordWidth(8), 22, 2, 17, 7, 2);
    return { w, h, mask: (x, y) => word(x, y) || box(x, y) };
  }
  const word = wordMask("DENIED", 12, 9);
  const frame = octagon(80, 46, 2, 3, 16, 2);
  return { w, h, mask: (x, y) => word(x, y) || frame(x, y) };
}

// The bare silhouette (no unevenness, no tilt), for tests and for reduced motion.
export function impressionShape(kind: StampKind): boolean[] {
  const { w, h, mask } = impressionMask(kind);
  const out: boolean[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(mask(x, y));
  return out;
}

export interface ImpressionOpts {
  seed: number; // picks which few pixels are missing or light
  tilt: number; // whole-pixel rotation: columns shift up to +/- tilt rows from end to end
  rough: boolean; // false draws it clean
}

export function impressionPixels(kind: StampKind, o: ImpressionOpts): PixelGrid {
  const { w, h, mask } = impressionMask(kind);
  const p = painter(w, h);
  const ink = p.ramp(INK[kind]);
  const dark = ink[1] ?? 0;
  const light = ink[3] ?? 0;
  const tilt = clampI(Math.round(o.tilt), -3, 3);
  for (let x = 0; x < w; x++) {
    const dy = Math.round(((x + 0.5) / w - 0.5) * 2 * tilt);
    for (let y = 0; y < h; y++) {
      if (!mask(x, y)) continue;
      let v = dark;
      if (o.rough) {
        const r = hash3(x, y, o.seed) % 100;
        if (r < 4) continue; // a missing pixel
        if (r < 14) v = light; // lightly inked
      }
      p.put(x, y + dy + 1, v);
    }
  }
  return p.grid;
}

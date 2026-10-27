// Shared pieces for the small pixel-art sprites (desk flag, stamps). Pure: no DOM, no clock, no
// unseeded randomness. A sprite is an indexed grid; index 0 is always transparent. The ui draws
// it as crisp rects at an integer scale.

export interface PixelGrid {
  width: number;
  height: number;
  palette: string[]; // palette[0] is the transparent entry; the rest are #RRGGBB
  pixels: Uint8Array; // row-major palette indices
}

export interface Painter {
  grid: PixelGrid;
  color(hex: string): number;
  ramp(hexes: readonly string[]): number[];
  put(x: number, y: number, i: number): void;
  get(x: number, y: number): number;
  rect(x0: number, y0: number, x1: number, y1: number, i: number): void;
}

export function painter(width: number, height: number): Painter {
  const palette: string[] = ["transparent"];
  const pixels = new Uint8Array(width * height);
  const cache = new Map<string, number>();
  const color = (hex: string): number => {
    const key = hex.toUpperCase();
    let v = cache.get(key);
    if (v === undefined) {
      palette.push(key);
      v = palette.length - 1;
      cache.set(key, v);
    }
    return v;
  };
  const put = (x: number, y: number, i: number): void => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = i;
  };
  const get = (x: number, y: number): number => (x < 0 || x >= width || y < 0 || y >= height ? 0 : (pixels[y * width + x] ?? 0));
  return {
    grid: { width, height, palette, pixels },
    color,
    ramp: (hexes) => hexes.map(color),
    put,
    get,
    rect: (x0, y0, x1, y1, i) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, i);
    },
  };
}

export const clampI = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

// Small integer hash for deterministic per-pixel decisions (ink unevenness).
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

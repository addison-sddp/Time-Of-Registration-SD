// Simplified original state silhouettes for the emblem on licenses and ID cards. Each outline is a
// short list of [longitude, latitude] corner points taken from general geographic facts (state
// borders are straight lines and rivers); they are projected to a flat shape here. Nothing is
// traced from a map or a real card design. A state without an outline gets the generic emblem.

type Pt = readonly [number, number];

const SHAPES: Record<string, readonly Pt[]> = {
  SD: [[-104.05, 45.94], [-96.45, 45.94], [-96.45, 43.5], [-96.5, 42.5], [-97.05, 42.75], [-97.5, 42.87], [-98.1, 42.98], [-98.5, 43.0], [-104.05, 43.0]],
  ND: [[-104.05, 49.0], [-97.2, 49.0], [-97.15, 48.5], [-96.8, 47.5], [-96.8, 46.6], [-96.55, 45.93], [-104.05, 45.93]],
  NE: [[-104.05, 43.0], [-98.5, 43.0], [-97.5, 42.85], [-96.5, 42.5], [-96.1, 41.5], [-95.85, 41.0], [-95.3, 40.0], [-102.05, 40.0], [-102.05, 41.0], [-104.05, 41.0]],
  KS: [[-102.05, 40.0], [-95.3, 40.0], [-94.95, 39.9], [-94.6, 39.15], [-94.62, 37.0], [-102.05, 37.0]],
  CO: [[-109.05, 41.0], [-102.05, 41.0], [-102.05, 37.0], [-109.05, 37.0]],
  WY: [[-111.05, 45.0], [-104.05, 45.0], [-104.05, 41.0], [-111.05, 41.0]],
  MT: [[-116.05, 49.0], [-104.05, 49.0], [-104.05, 45.0], [-111.05, 45.0], [-111.05, 44.5], [-112.4, 44.45], [-113.1, 44.8], [-113.5, 45.7], [-114.5, 46.6], [-114.35, 47.0], [-115.7, 47.7], [-116.05, 48.0]],
  MN: [[-97.2, 49.0], [-95.15, 49.0], [-95.15, 49.38], [-94.8, 49.38], [-94.6, 48.72], [-93.5, 48.52], [-92.0, 48.3], [-90.8, 48.2], [-89.6, 48.0], [-90.7, 47.6], [-92.1, 46.78], [-92.3, 46.1], [-92.8, 45.6], [-92.75, 44.75], [-91.22, 43.5], [-96.45, 43.5], [-96.45, 45.3], [-96.8, 46.6], [-97.15, 48.5]],
  IA: [[-96.6, 42.5], [-96.45, 43.5], [-91.22, 43.5], [-91.2, 42.7], [-90.65, 42.5], [-90.2, 41.8], [-91.1, 41.2], [-91.4, 40.38], [-95.77, 40.58], [-95.85, 41.0], [-96.1, 41.5], [-96.4, 42.0]],
  WI: [[-92.1, 46.75], [-90.8, 46.9], [-90.4, 46.55], [-89.1, 46.1], [-87.8, 45.35], [-87.0, 45.3], [-87.55, 44.5], [-87.7, 43.0], [-87.8, 42.5], [-90.64, 42.5], [-91.2, 43.3], [-91.3, 44.0], [-92.75, 44.75], [-92.8, 45.6], [-92.3, 46.1]],
  IL: [[-87.8, 42.5], [-90.64, 42.5], [-90.4, 41.55], [-91.1, 40.8], [-91.4, 40.1], [-90.7, 39.0], [-90.2, 38.8], [-89.5, 37.3], [-89.15, 37.0], [-88.5, 37.1], [-88.1, 37.8], [-87.5, 38.3], [-87.5, 40.0], [-87.5, 41.7], [-87.8, 42.0]],
};

export interface StateShape {
  viewBox: string;
  d: string;
}

export const STATES_WITH_SHAPE: readonly string[] = Object.keys(SHAPES);

// Project to a plane (scale longitude by the cosine of the mean latitude), fit into a box with a
// 1-unit margin and a height of at most 40 units.
export function stateShape(code: string | null): StateShape | null {
  const pts = code === null ? undefined : SHAPES[code.toUpperCase()];
  if (pts === undefined) return null;
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => -p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const hgt = Math.max(...ys) - minY;
  const scale = 40 / Math.max(w, hgt);
  const f = (n: number): string => (Math.round(n * 10) / 10).toString();
  const d =
    pts.map((_, i) => `${i === 0 ? "M" : "L"}${f(((xs[i] ?? 0) - minX) * scale + 1)},${f(((ys[i] ?? 0) - minY) * scale + 1)}`).join(" ") + " Z";
  return { viewBox: `0 0 ${f(w * scale + 2)} ${f(hgt * scale + 2)}`, d };
}

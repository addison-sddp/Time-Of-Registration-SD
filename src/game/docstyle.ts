import type { Document } from "../engine/types";
import { createRng, hashSeed } from "../gen/rng";

// Pure helpers for the look of the printed items: per-state accent colors, deterministic wear,
// and original procedural line geometry (sine bands, rosettes, scallops, stars). No DOM, no
// randomness beyond the seeded generator; everything here is derived from ids and codes.

const r1 = (n: number): number => Math.round(n * 10) / 10;
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- state accents

// Two-letter USPS codes in a fixed order. The order only decides which hue a state gets.
export const STATE_CODES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const GOLDEN_ANGLE = 137.50776405;

export interface StateStyle {
  hue: number; // 0..359
  accent: string; // dark, for header bands and text on light stock
  mid: string; // mid tone for rules and patterns
  tint: string; // very light stock tint
  lobes: number; // rosette lobe count, 5..9
}

// The same code always gives the same style; unlisted codes fall back to a hash.
export function stateStyle(code: string | null): StateStyle {
  const key = (code ?? "").trim().toUpperCase();
  const idx = STATE_CODES.indexOf(key);
  const hue = idx >= 0 ? Math.round((idx * GOLDEN_ANGLE) % 360) : hashSeed("state-hue", key) % 360;
  const lobes = 5 + (idx >= 0 ? idx : hashSeed("state-lobes", key)) % 5;
  return {
    hue,
    accent: `hsl(${hue} 46% 27%)`,
    mid: `hsl(${hue} 38% 50%)`,
    tint: `hsl(${hue} 42% 91%)`,
    lobes,
  };
}

// ---------------------------------------------------------------- wear

export type Crease = "none" | "horizontal" | "vertical" | "diagonal";
export type FoldCorner = "none" | "tl" | "tr" | "bl" | "br";

export interface Wear {
  crease: Crease;
  crease_pos: number; // percent along the item, 30..70
  fold: FoldCorner;
  fold_size: number; // px, 14..22
  shift_x: number; // print offset in px, within +-0.6
  shift_y: number;
  tilt: number; // print tilt in degrees, within +-0.4
  ink: number; // ink strength, 0.84..1
}

// Deterministic wear for a paper item, from its doc_id only.
export function wearFor(doc_id: string): Wear {
  const rng = createRng(hashSeed("wear", doc_id));
  const crease = rng.weighted<Crease>([["none", 3], ["horizontal", 3], ["vertical", 2], ["diagonal", 2]]);
  const crease_pos = rng.int(30, 70);
  const fold = rng.chance(0.4) ? rng.pick<FoldCorner>(["tl", "tr", "bl", "br"]) : "none";
  const fold_size = rng.int(14, 22);
  const shift_x = r1((rng.next() - 0.5) * 1.2);
  const shift_y = r1((rng.next() - 0.5) * 1.2);
  const tilt = r2((rng.next() - 0.5) * 0.8);
  const ink = r2(0.84 + rng.next() * 0.16);
  return { crease, crease_pos, fold, fold_size, shift_x, shift_y, tilt, ink };
}

// ---------------------------------------------------------------- card kinds, serials, MRZ

export type CardKind = "library" | "staff" | "member";

export function cardKind(doc_id: string): CardKind {
  return createRng(hashSeed("card-kind", doc_id)).pick<CardKind>(["library", "staff", "member"]);
}

// A run of digits for printed serial numbers; tag keeps different uses of one id apart.
export function serialDigits(doc_id: string, tag: string, length: number): string {
  const rng = createRng(hashSeed("serial", tag, doc_id));
  return Array.from({ length }, () => String(rng.int(0, 9))).join("");
}

const mrzName = (name: string | null): string => {
  const parts = (name ?? "").toUpperCase().replace(/[^A-Z ]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const surname = parts[parts.length - 1] ?? "";
  const given = parts.slice(0, -1).join("<");
  return given === "" ? surname : `${surname}<<${given}`;
};

const yymmdd = (iso: string | null): string => (iso === null ? "<<<<<<" : iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10));

// Two 44-character lines in the machine-readable style, built only from this item's own fields.
export function mrzLines(d: Document): [string, string] {
  const fit = (s: string): string => s.padEnd(44, "<").slice(0, 44);
  const one = fit(`P<USA${mrzName(d.name)}`);
  const two = fit(`${serialDigits(d.doc_id, "passport", 9)}<USA${yymmdd(d.birth_date)}<${yymmdd(d.expiry_date)}`);
  return [one, two];
}

// ---------------------------------------------------------------- line geometry

// A sine line across [0, width] at height y, as a polyline path.
export function sineBandPath(width: number, y: number, amp: number, wavelength: number, phase = 0, step = 2): string {
  const out: string[] = [];
  for (let x = 0; x <= width; x += step) {
    const yy = y + amp * Math.sin((2 * Math.PI * x) / wavelength + phase);
    out.push(`${x === 0 ? "M" : "L"}${r1(x)},${r1(yy)}`);
  }
  return out.join(" ");
}

// Several interlaced sine lines sharing a center line, phase-spread so they weave.
export function guillocheBands(width: number, y: number, count: number, amp: number, wavelength: number): string[] {
  return Array.from({ length: count }, (_, i) => sineBandPath(width, y, amp, wavelength, (2 * Math.PI * i) / count));
}

// A closed rosette: a hypotrochoid with `lobes` petals and outer radius about R.
export function rosettePath(cx: number, cy: number, R: number, lobes: number, depth = 0.6, steps = 180): string {
  const k = Math.max(3, Math.round(lobes));
  const r = R / k;
  const d = r * depth * 1.4;
  const scale = R / (R - r + d);
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = (R - r) * Math.cos(t) + d * Math.cos((k - 1) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin((k - 1) * t);
    out.push(`${i === 0 ? "M" : "L"}${r1(cx + x * scale)},${r1(cy + y * scale)}`);
  }
  return `${out.join(" ")} Z`;
}

// A rectangle path whose edges are a row of half-circle scallops bulging inward.
export function scallopPath(width: number, height: number, radius: number): string {
  const nx = Math.max(1, Math.round(width / (2 * radius)));
  const ny = Math.max(1, Math.round(height / (2 * radius)));
  const dx = r2(width / nx);
  const dy = r2(height / ny);
  const parts: string[] = ["M0,0"];
  for (let i = 0; i < nx; i++) parts.push(`a${r2(dx / 2)},${r2(dx / 2)} 0 0 0 ${dx},0`);
  for (let i = 0; i < ny; i++) parts.push(`a${r2(dy / 2)},${r2(dy / 2)} 0 0 0 0,${dy}`);
  for (let i = 0; i < nx; i++) parts.push(`a${r2(dx / 2)},${r2(dx / 2)} 0 0 0 ${-dx},0`);
  for (let i = 0; i < ny; i++) parts.push(`a${r2(dy / 2)},${r2(dy / 2)} 0 0 0 0,${-dy}`);
  parts.push("Z");
  return parts.join(" ");
}

// Points string for an n-pointed star polygon.
export function starPoints(cx: number, cy: number, outer: number, inner: number, n = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${r1(cx + rad * Math.cos(a))},${r1(cy + rad * Math.sin(a))}`);
  }
  return pts.join(" ");
}

// ---------------------------------------------------------------- which back a card shows

export type BackKind = "sd" | "generic";

// An SD license always shows the SD back layout (barcode and tiny digit box, class, endorsements,
// restrictions, revision line, birth date over a small SD outline). The choice depends only on the
// document type, never on the issuing jurisdiction text or on is_photocopy. Every other flippable
// card shows the generic back.
export function backKind(d: Pick<Document, "type">): BackKind {
  return d.type === "sd_drivers_license" ? "sd" : "generic";
}

// A real passport is shown as a closed book that the player opens. A photocopy is a flat copy of
// the data page only, so it never is a book.
export const isBookPassport = (d: Pick<Document, "type" | "is_photocopy">): boolean => d.type === "us_passport" && !d.is_photocopy;

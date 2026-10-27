import type { Application } from "../engine/types";
import { createRng, hashSeed } from "../gen/rng";

// Parameters for a stylized face. Drawing lives in ui; this only derives numbers and
// palette picks from a seed, so the same seed always gives the same face.

export type HairStyle = "short" | "side_part" | "long" | "curly" | "bun" | "receding";
export type MouthKind = "flat" | "soft" | "wide";

export interface PortraitParams {
  skin: string;
  skin_shade: string;
  hair: string;
  hair_style: HairStyle;
  head_rx: number;
  head_ry: number;
  eye_gap: number;
  eye_r: number;
  brow_tilt: number;
  nose_len: number;
  mouth: MouthKind;
  mouth_w: number;
  glasses: boolean;
  shirt: string;
  backdrop: string;
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
const SHIRTS: readonly string[] = ["#1F3A5F", "#4A5A4E", "#8C2F2B", "#2F6B5E", "#6B6355", "#7A6A3A"];
const BACKDROPS: readonly string[] = ["#B9B29C", "#A9B0A4", "#B4AE9E", "#9FA8AE"];
const HAIR_STYLES: readonly HairStyle[] = ["short", "side_part", "long", "curly", "bun", "receding"];
const MOUTHS: readonly MouthKind[] = ["flat", "soft", "wide"];

export function portraitParams(seed: number): PortraitParams {
  const rng = createRng(hashSeed("portrait", seed));
  const [skin, skin_shade] = rng.pick(SKIN_TONES);
  return {
    skin,
    skin_shade,
    hair: rng.pick(HAIR_TONES),
    hair_style: rng.pick(HAIR_STYLES),
    head_rx: rng.int(34, 42),
    head_ry: rng.int(42, 50),
    eye_gap: rng.int(13, 19),
    eye_r: rng.int(3, 5),
    brow_tilt: rng.int(-2, 2),
    nose_len: rng.int(6, 12),
    mouth: rng.pick(MOUTHS),
    mouth_w: rng.int(10, 18),
    glasses: rng.chance(0.25),
    shirt: rng.pick(SHIRTS),
    backdrop: rng.pick(BACKDROPS),
  };
}

// The seed shown in the booth: the identity document's, else any document's, else a hash
// of the application id so every applicant still has a face.
export function applicantPortraitSeed(app: Application): number {
  const docs = [app.id_document, ...app.citizenship_documents];
  for (const d of docs) if (d !== null && d.portrait_seed !== null) return d.portrait_seed;
  return hashSeed(app.application_id);
}

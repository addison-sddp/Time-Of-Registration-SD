import { impressionPixels, stampBodyPixels } from "../game/stampart";
import type { Decision } from "../save/schema";
import { drawGrid } from "./pixels";
import { s } from "./dom";

// Stamps differ by shape and label, not by colour alone:
//   APPROVE: taller body, rounded ink box under the word, label "APPROVED", green-teal ink.
//   DENY: squatter, wider body, octagonal frame around the word, label "DENIED", brick-red ink.

const BODY_SCALE = 3;
const IMPRESSION_SCALE = 3;

// The pixel-art self-inking stamp shown on the button.
export function stampFace(kind: Decision): SVGElement {
  return drawGrid(stampBodyPixels(kind), BODY_SCALE, `stamp-face stamp-${kind}`);
}

// The ink impression left on the desk: outlined block letters with a little unevenness. Under
// reduced motion it is drawn level (no tilt); the unevenness is fixed, not animated.
export function stampImpression(kind: Decision, reducedMotion: boolean, scale: number = IMPRESSION_SCALE): SVGElement {
  const seed = reducedMotion ? 7 : Math.floor(Math.random() * 0x7fffffff);
  const tilt = reducedMotion ? 0 : Math.floor(Math.random() * 5) - 2;
  return drawGrid(impressionPixels(kind, { seed, tilt, rough: true }), scale, `impression-art stamp-${kind}`);
}

// Kept for the page shell: an empty, hidden defs block.
export function inkDefs(): SVGElement {
  const svg = s("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
  svg.append(s("defs"));
  return svg;
}

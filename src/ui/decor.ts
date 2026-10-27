import { guillocheBands, rosettePath, scallopPath, starPoints } from "../game/docstyle";
import { h, s } from "./dom";

// Original abstract decoration, drawn from geometric shapes and sine curves. No eagle, flag,
// state outline, seal or insignia of any real body appears here. Colors come from CSS (currentColor).

const FACE_W = 226;
const FACE_H = 168;

function svg(viewBox: string, cls: string, ...kids: SVGElement[]): SVGElement {
  return s("svg", { viewBox, class: cls, "aria-hidden": "true", focusable: "false", preserveAspectRatio: "none" }, ...kids);
}

const stroke = (d: string, width = 0.6, extra: Record<string, string | number> = {}): SVGElement =>
  s("path", { d, fill: "none", stroke: "currentColor", "stroke-width": width, "vector-effect": "non-scaling-stroke", ...extra });

// A full-face layer of interlaced wavy lines across the lower area.
export function waveLayer(y: number, count = 5, amp = 5, wavelength = 34, cls = "decor wave"): SVGElement {
  return svg(`0 0 ${FACE_W} ${FACE_H}`, cls, ...guillocheBands(FACE_W, y, count, amp, wavelength).map((d) => stroke(d)));
}

// A short horizontal band of wavy lines, for header flourishes.
export function waveBand(width: number, height: number, count = 4, cls = "wave-band"): SVGElement {
  return svg(`0 0 ${width} ${height}`, cls, ...guillocheBands(width, height / 2, count, height / 2.6, width / 9).map((d) => stroke(d, 0.7)));
}

// A square rosette, three nested hypotrochoids and a ring.
export function rosetteSvg(lobes: number, cls = "rosette"): SVGElement {
  return s(
    "svg",
    { viewBox: "0 0 100 100", class: cls, "aria-hidden": "true", focusable: "false" },
    s("circle", { cx: 50, cy: 50, r: 48, fill: "none", stroke: "currentColor", "stroke-width": 0.8 }),
    s("path", { d: rosettePath(50, 50, 45, lobes, 0.35), fill: "none", stroke: "currentColor", "stroke-width": 0.6 }),
    s("path", { d: rosettePath(50, 50, 38, lobes, 0.6), fill: "none", stroke: "currentColor", "stroke-width": 0.6 }),
    s("path", { d: rosettePath(50, 50, 28, lobes + 2, 0.8), fill: "none", stroke: "currentColor", "stroke-width": 0.6 }),
    s("circle", { cx: 50, cy: 50, r: 6, fill: "currentColor" }),
  );
}

// A pyramid of bars: four stacked rectangles, each narrower than the one below.
export function barsEmblem(cls = "emblem bars"): SVGElement {
  const widths = [36, 28, 20, 12];
  return s(
    "svg",
    { viewBox: "0 0 40 28", class: cls, "aria-hidden": "true", focusable: "false" },
    ...widths.map((w, i) => s("rect", { x: (40 - w) / 2, y: 22 - i * 7, width: w, height: 5, rx: 0.6, fill: "currentColor" })),
  );
}

// A ring of small stars.
export function starRing(n = 9, cls = "emblem stars"): SVGElement {
  const stars: SVGElement[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    stars.push(s("polygon", { points: starPoints(30 + 22 * Math.cos(a), 30 + 22 * Math.sin(a), 4.2, 1.8), fill: "currentColor" }));
  }
  return s("svg", { viewBox: "0 0 60 60", class: cls, "aria-hidden": "true", focusable: "false" }, ...stars);
}

// Three-line bar row used as a plain mark on cards.
export function stripeMark(cls = "emblem stripes"): SVGElement {
  return s(
    "svg",
    { viewBox: "0 0 30 20", class: cls, "aria-hidden": "true", focusable: "false" },
    s("rect", { x: 0, y: 2, width: 30, height: 3, fill: "currentColor" }),
    s("rect", { x: 0, y: 8.5, width: 22, height: 3, fill: "currentColor" }),
    s("rect", { x: 0, y: 15, width: 12, height: 3, fill: "currentColor" }),
  );
}

// Scalloped frame with an inner rule, stretched over the face.
export function scallopFrame(cls = "decor frame scallop"): SVGElement {
  return svg(
    `0 0 ${FACE_W} ${FACE_H}`,
    cls,
    s("path", { d: scallopPath(FACE_W - 10, FACE_H - 10, 7), transform: "translate(5 5)", fill: "none", stroke: "currentColor", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }),
    s("rect", { x: 11, y: 11, width: FACE_W - 22, height: FACE_H - 22, fill: "none", stroke: "currentColor", "stroke-width": 0.6, "vector-effect": "non-scaling-stroke" }),
  );
}

// Ornate border: double rules with wavy bands along the top and bottom edges.
export function ropeFrame(cls = "decor frame rope"): SVGElement {
  const kids: SVGElement[] = [
    s("rect", { x: 4, y: 4, width: FACE_W - 8, height: FACE_H - 8, fill: "none", stroke: "currentColor", "stroke-width": 1.2, "vector-effect": "non-scaling-stroke" }),
    s("rect", { x: 9, y: 9, width: FACE_W - 18, height: FACE_H - 18, fill: "none", stroke: "currentColor", "stroke-width": 0.6, "vector-effect": "non-scaling-stroke" }),
  ];
  for (const y of [14, FACE_H - 14]) {
    for (const d of guillocheBands(FACE_W - 28, 0, 3, 2.4, 14)) {
      kids.push(stroke(d, 0.6, { transform: `translate(14 ${y})` }));
    }
  }
  return svg(`0 0 ${FACE_W} ${FACE_H}`, cls, ...kids);
}

// Corner-notched rectangular frame, with tick marks.
export function notchFrame(cls = "decor frame notch"): SVGElement {
  const n = 9;
  const w = FACE_W;
  const hh = FACE_H;
  const d = `M${n + 3},3 H${w - n - 3} L${w - 3},${n + 3} V${hh - n - 3} L${w - n - 3},${hh - 3} H${n + 3} L3,${hh - n - 3} V${n + 3} Z`;
  return svg(
    `0 0 ${w} ${hh}`,
    cls,
    s("path", { d, fill: "none", stroke: "currentColor", "stroke-width": 1.2, "vector-effect": "non-scaling-stroke" }),
    s("path", { d, transform: `translate(4 4) scale(${(w - 8) / w} ${(hh - 8) / hh})`, fill: "none", stroke: "currentColor", "stroke-width": 0.6, "vector-effect": "non-scaling-stroke" }),
  );
}

// Seal for certificates: concentric rings, a rosette and a ring of stars. Embossed by CSS.
export function sealSvg(lobes = 8): SVGElement {
  const stars: SVGElement[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (2 * Math.PI * i) / 12 - Math.PI / 2;
    stars.push(s("polygon", { points: starPoints(50 + 41 * Math.cos(a), 50 + 41 * Math.sin(a), 3.6, 1.5), fill: "currentColor" }));
  }
  return s(
    "svg",
    { viewBox: "0 0 100 100", class: "seal-art", "aria-hidden": "true", focusable: "false" },
    s("circle", { cx: 50, cy: 50, r: 48, fill: "none", stroke: "currentColor", "stroke-width": 2 }),
    s("circle", { cx: 50, cy: 50, r: 34, fill: "none", stroke: "currentColor", "stroke-width": 1 }),
    ...stars,
    s("path", { d: rosettePath(50, 50, 31, lobes, 0.7), fill: "none", stroke: "currentColor", "stroke-width": 0.9 }),
    s("path", { d: rosettePath(50, 50, 20, lobes + 1, 0.8), fill: "none", stroke: "currentColor", "stroke-width": 0.9 }),
    s("rect", { x: 40, y: 56, width: 20, height: 4, fill: "currentColor" }),
    s("rect", { x: 44, y: 50, width: 12, height: 4, fill: "currentColor" }),
    s("rect", { x: 47, y: 44, width: 6, height: 4, fill: "currentColor" }),
  );
}

export const embossedSeal = (lobes = 8): HTMLElement => h("div", { class: "emboss", "aria-hidden": "true" }, sealSvg(lobes));
export const sheen = (): HTMLElement => h("span", { class: "sheen", "aria-hidden": "true" });
export const foil = (): HTMLElement => h("span", { class: "foil", "aria-hidden": "true" });

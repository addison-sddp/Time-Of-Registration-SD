import { portraitParams, portraitPixels, type PortraitTraits } from "../game/portrait";
import { s } from "./dom";

// Draws the pixel grid as <rect>s (horizontal runs of one colour) with crisp edges. The
// view box is the grid itself, so the CSS box must be an integer multiple of 32 x 40.
export function drawPortrait(seed: number, label: string, backdrop = true, traits?: PortraitTraits): SVGElement {
  const g = portraitPixels(portraitParams(seed, traits), { backdrop });
  const svg = s("svg", {
    viewBox: `0 0 ${g.width} ${g.height}`,
    role: "img",
    "aria-label": label,
    class: "portrait",
    "shape-rendering": "crispEdges",
    preserveAspectRatio: "none",
  });
  for (let y = 0; y < g.height; y++) {
    let x = 0;
    while (x < g.width) {
      const v = g.pixels[y * g.width + x] ?? 0;
      let end = x + 1;
      while (end < g.width && g.pixels[y * g.width + end] === v) end++;
      if (v !== g.transparent) svg.append(s("rect", { x, y, width: end - x, height: 1, fill: g.palette[v] ?? "#000" }));
      x = end;
    }
  }
  return svg;
}
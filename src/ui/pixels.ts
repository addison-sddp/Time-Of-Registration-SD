import type { PixelGrid } from "../game/pixelart";
import { s } from "./dom";

// Draws an indexed sprite as <rect> runs with crisp edges at an integer scale.
export function drawGrid(g: PixelGrid, scale: number, cls: string): SVGElement {
  const svg = s("svg", {
    viewBox: `0 0 ${g.width} ${g.height}`,
    width: g.width * scale,
    height: g.height * scale,
    class: cls,
    "aria-hidden": "true",
    focusable: "false",
    "shape-rendering": "crispEdges",
  });
  for (let y = 0; y < g.height; y++) {
    let x = 0;
    while (x < g.width) {
      const v = g.pixels[y * g.width + x] ?? 0;
      let end = x + 1;
      while (end < g.width && g.pixels[y * g.width + end] === v) end++;
      if (v !== 0) svg.append(s("rect", { x, y, width: end - x, height: 1, fill: g.palette[v] ?? "#000000" }));
      x = end;
    }
  }
  return svg;
}

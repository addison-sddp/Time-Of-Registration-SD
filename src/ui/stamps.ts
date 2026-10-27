import { narrative } from "../data";
import type { Decision } from "../save/schema";
import { s } from "./dom";

// Stamps differ by shape and label, not by colour alone:
//   APPROVE: rounded rectangle, label "APPROVED", green-teal.
//   DENY: octagon, label "DENIED", brick red.

const OCTAGON = "M 30 4 L 90 4 L 116 30 L 116 90 L 90 116 L 30 116 L 4 90 L 4 30 Z";

export function stampFace(kind: Decision, rotation = 0, rough = false): SVGElement {
  const approve = kind === "approve";
  const color = approve ? "var(--approve-teal)" : "var(--brick-red)";
  const label = approve ? narrative.desk["approve_stamp"] : narrative.desk["deny_stamp"];
  const svg = s("svg", {
    viewBox: "0 0 120 120",
    class: `stamp-face stamp-${kind}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  const g = s("g", {
    transform: `rotate(${rotation} 60 60)`,
    filter: rough ? "url(#ink-rough)" : null,
    fill: "none",
    stroke: color,
  });
  if (approve) {
    g.append(
      s("rect", { x: 4, y: 24, width: 112, height: 72, rx: 18, "stroke-width": 5 }),
      s("rect", { x: 11, y: 31, width: 98, height: 58, rx: 12, "stroke-width": 2 }),
    );
  } else {
    g.append(
      s("path", { d: OCTAGON, "stroke-width": 5 }),
      s("path", { d: OCTAGON, "stroke-width": 2, transform: "translate(60 60) scale(0.86) translate(-60 -60)" }),
    );
  }
  g.append(
    s(
      "text",
      {
        x: 60, y: 67, "text-anchor": "middle", "font-size": 19, "font-weight": "bold",
        "letter-spacing": 1.5, fill: color, stroke: "none", "font-family": "var(--font-type)",
      },
      label ?? "",
    ),
  );
  svg.append(g);
  return svg;
}

// The ink filter used by stamps; added once to the page.
export function inkDefs(): SVGElement {
  const svg = s("svg", { width: 0, height: 0, "aria-hidden": "true", style: "position:absolute" });
  svg.append(
    s(
      "defs",
      {},
      s(
        "filter",
        { id: "ink-rough", x: "-5%", y: "-5%", width: "110%", height: "110%" },
        s("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", seed: "3", result: "n" }),
        s("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "2.2" }),
      ),
    ),
  );
  return svg;
}

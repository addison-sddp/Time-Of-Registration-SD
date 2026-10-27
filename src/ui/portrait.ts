import { portraitParams, type PortraitParams } from "../game/portrait";
import { s } from "./dom";

// Draws a stylized face from derived parameters. 100 x 120 view box.
export function drawPortrait(seed: number, label: string): SVGElement {
  const p = portraitParams(seed);
  const svg = s("svg", {
    viewBox: "0 0 100 120",
    role: "img",
    "aria-label": label,
    class: "portrait",
    preserveAspectRatio: "xMidYMid slice",
  });
  svg.append(
    s("rect", { width: 100, height: 120, fill: p.backdrop }),
    s("path", { d: "M 6 120 Q 8 92 36 88 L 64 88 Q 92 92 94 120 Z", fill: p.shirt }),
    s("rect", { x: 42, y: 74, width: 16, height: 18, fill: p.skin_shade }),
    ...face(p),
  );
  return svg;
}

function hair(p: PortraitParams, cy: number): SVGElement[] {
  const top = cy - p.head_ry;
  const rx = p.head_rx;
  switch (p.hair_style) {
    case "short":
      return [s("path", { d: `M ${50 - rx} ${cy - 10} Q ${50 - rx} ${top - 8} 50 ${top - 6} Q ${50 + rx} ${top - 8} ${50 + rx} ${cy - 10} Q 50 ${top + 10} ${50 - rx} ${cy - 10} Z`, fill: p.hair })];
    case "side_part":
      return [s("path", { d: `M ${50 - rx} ${cy - 6} Q ${50 - rx - 2} ${top - 8} 46 ${top - 6} Q ${50 + rx + 2} ${top - 8} ${50 + rx} ${cy - 6} Q ${50 + 6} ${top + 6} 36 ${top + 14} Q ${50 - rx + 4} ${top + 16} ${50 - rx} ${cy - 6} Z`, fill: p.hair })];
    case "long":
      return [s("path", { d: `M ${50 - rx - 4} ${cy + 34} L ${50 - rx - 4} ${cy - 10} Q ${50 - rx - 4} ${top - 10} 50 ${top - 8} Q ${50 + rx + 4} ${top - 10} ${50 + rx + 4} ${cy - 10} L ${50 + rx + 4} ${cy + 34} L ${50 + rx - 4} ${cy + 34} L ${50 + rx - 4} ${cy - 8} Q 50 ${top + 6} ${50 - rx + 4} ${cy - 8} L ${50 - rx + 4} ${cy + 34} Z`, fill: p.hair })];
    case "curly":
      return [0, 1, 2, 3, 4, 5, 6].map((i) =>
        s("circle", { cx: 50 - rx + 2 + (i * (2 * rx - 4)) / 6, cy: top + 6 + Math.abs(3 - i) * 4, r: 9, fill: p.hair }),
      );
    case "bun":
      return [
        s("circle", { cx: 50, cy: top - 10, r: 9, fill: p.hair }),
        s("path", { d: `M ${50 - rx} ${cy - 8} Q ${50 - rx} ${top - 4} 50 ${top - 3} Q ${50 + rx} ${top - 4} ${50 + rx} ${cy - 8} Q 50 ${top + 8} ${50 - rx} ${cy - 8} Z`, fill: p.hair }),
      ];
    case "receding":
      return [
        s("path", { d: `M ${50 - rx} ${cy - 4} Q ${50 - rx - 2} ${top + 6} ${50 - rx + 8} ${top + 10} L ${50 - rx + 8} ${cy - 4} Z`, fill: p.hair }),
        s("path", { d: `M ${50 + rx} ${cy - 4} Q ${50 + rx + 2} ${top + 6} ${50 + rx - 8} ${top + 10} L ${50 + rx - 8} ${cy - 4} Z`, fill: p.hair }),
      ];
  }
}

function face(p: PortraitParams): SVGElement[] {
  const cy = 52;
  const eyeY = cy - 2;
  const mouthY = cy + 26;
  const mw = p.mouth_w / 2;
  const mouthD =
    p.mouth === "flat"
      ? `M ${50 - mw} ${mouthY} L ${50 + mw} ${mouthY}`
      : p.mouth === "soft"
        ? `M ${50 - mw} ${mouthY} Q 50 ${mouthY + 4} ${50 + mw} ${mouthY}`
        : `M ${50 - mw} ${mouthY - 1} Q 50 ${mouthY + 7} ${50 + mw} ${mouthY - 1}`;
  const out: SVGElement[] = [
    ...(p.hair_style === "long" ? hair(p, cy) : []),
    s("ellipse", { cx: 50 - p.head_rx, cy: cy + 4, rx: 4, ry: 7, fill: p.skin_shade }),
    s("ellipse", { cx: 50 + p.head_rx, cy: cy + 4, rx: 4, ry: 7, fill: p.skin_shade }),
    s("ellipse", { cx: 50, cy, rx: p.head_rx, ry: p.head_ry, fill: p.skin }),
    ...(p.hair_style === "long" ? [] : hair(p, cy)),
  ];
  for (const side of [-1, 1]) {
    const ex = 50 + side * p.eye_gap;
    out.push(
      s("ellipse", { cx: ex, cy: eyeY, rx: p.eye_r + 2, ry: p.eye_r, fill: "#F4F0E6" }),
      s("circle", { cx: ex, cy: eyeY, r: p.eye_r - 1, fill: "#2A211B" }),
      s("line", { x1: ex - 6, y1: eyeY - 8 + side * p.brow_tilt, x2: ex + 6, y2: eyeY - 8 - side * p.brow_tilt, stroke: p.hair, "stroke-width": 2, "stroke-linecap": "round" }),
    );
  }
  out.push(
    s("path", { d: `M 50 ${eyeY + 2} L 48 ${eyeY + 2 + p.nose_len} L 53 ${eyeY + 2 + p.nose_len}`, fill: "none", stroke: p.skin_shade, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    s("path", { d: mouthD, fill: "none", stroke: "#4A2C26", "stroke-width": 2, "stroke-linecap": "round" }),
  );
  if (p.glasses) {
    for (const side of [-1, 1]) {
      out.push(s("circle", { cx: 50 + side * p.eye_gap, cy: eyeY, r: p.eye_r + 6, fill: "none", stroke: "#1B1B1B", "stroke-width": 1.4 }));
    }
    out.push(s("line", { x1: 50 - p.eye_gap + p.eye_r + 6, y1: eyeY, x2: 50 + p.eye_gap - p.eye_r - 6, y2: eyeY, stroke: "#1B1B1B", "stroke-width": 1.4 }));
  }
  return out;
}

import { narrative } from "../data";
import { fill } from "../game/format";
import { s } from "./dom";

// A decorative analog wall clock showing the player's real local time. This is the only place
// the UI reads the system clock; game logic never does. It stops its interval on destroy.

const CX = 60;
const CY = 60;

export interface WallClock {
  el: SVGElement;
  destroy(): void;
}

export const handAngles = (h: number, m: number, sec: number): { hour: number; minute: number; second: number } => ({
  hour: ((h % 12) + m / 60) * 30,
  minute: (m + sec / 60) * 6,
  second: sec * 6,
});

export function createWallClock(withSeconds: boolean): WallClock {
  const svg = s("svg", {
    viewBox: "0 0 120 120", width: 112, height: 112, class: "wall-clock", role: "img",
    focusable: "false", "shape-rendering": "crispEdges",
  });
  svg.append(
    s("circle", { cx: CX, cy: CY, r: 58, class: "wc-rim" }),
    s("circle", { cx: CX, cy: CY, r: 52, class: "wc-face" }),
  );
  for (let i = 0; i < 60; i++) {
    if (i % 5 === 0) continue;
    const a = (i * 6 * Math.PI) / 180;
    svg.append(s("line", {
      x1: CX + Math.sin(a) * 48, y1: CY - Math.cos(a) * 48, x2: CX + Math.sin(a) * 51, y2: CY - Math.cos(a) * 51, class: "wc-tick",
    }));
  }
  for (let n = 1; n <= 12; n++) {
    const a = (n * 30 * Math.PI) / 180;
    const t = s("text", {
      x: Math.round(CX + Math.sin(a) * 39), y: Math.round(CY - Math.cos(a) * 39 + 4), "text-anchor": "middle", class: "wc-num",
    });
    t.textContent = String(n);
    svg.append(t);
  }
  const hand = (cls: string, len: number): SVGElement => {
    const l = s("line", { x1: CX, y1: CY + 5, x2: CX, y2: CY - len, class: cls, "stroke-linecap": "butt" });
    svg.append(l);
    return l;
  };
  const hourHand = hand("wc-hour", 26);
  const minuteHand = hand("wc-minute", 38);
  const secondHand = withSeconds ? hand("wc-second", 42) : null;
  svg.append(s("circle", { cx: CX, cy: CY, r: 3, class: "wc-pin" }));

  let lastLabel = "";
  const draw = (): void => {
    const now = new Date();
    const a = handAngles(now.getHours(), now.getMinutes(), now.getSeconds());
    hourHand.setAttribute("transform", `rotate(${a.hour} ${CX} ${CY})`);
    minuteHand.setAttribute("transform", `rotate(${a.minute} ${CX} ${CY})`);
    secondHand?.setAttribute("transform", `rotate(${a.second} ${CX} ${CY})`);
    const label = fill(narrative.desk["wall_clock"] ?? "", {
      time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
    if (label !== lastLabel) {
      lastLabel = label;
      svg.setAttribute("aria-label", label);
    }
  };
  draw();
  const id = window.setInterval(draw, withSeconds ? 1000 : 15000);
  return { el: svg, destroy: () => window.clearInterval(id) };
}

import { toggleFlip } from "./documents";

// Movable desk items: pointer drag plus arrow keys (Shift for bigger steps). F flips a
// focused card that has a back. Positions are stored in save.desk_layout by item key.

export interface DeskContext {
  layout: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  scale: () => number;
  changed: () => void;
}

const STEP = 8;
const BIG_STEP = 40;
const KEEP = 40; // pixels of an item that must stay on the desk
let topZ = 10;

export function placeItem(el: HTMLElement, key: string, def: { x: number; y: number }, ctx: DeskContext): void {
  el.dataset["key"] = key;
  const pos = ctx.layout[key] ?? def;
  move(el, pos.x, pos.y, ctx, false);

  const raise = (): void => {
    topZ += 1;
    el.style.zIndex = String(topZ);
  };

  el.addEventListener("focus", raise);

  el.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button, input, select, a")) return;
    if (e.button !== 0) return;
    raise();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const onMove = (ev: PointerEvent): void => {
      const k = ctx.scale() || 1;
      move(el, origin.x + (ev.clientX - startX) / k, origin.y + (ev.clientY - startY) / k, ctx, false);
    };
    const onUp = (): void => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      commit(el, key, ctx);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });

  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (e.key === "f" || e.key === "F") {
      toggleFlip(el);
      e.preventDefault();
      return;
    }
    const step = e.shiftKey ? BIG_STEP : STEP;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (d === undefined) return;
    e.preventDefault();
    move(el, (parseFloat(el.style.left) || 0) + d[0], (parseFloat(el.style.top) || 0) + d[1], ctx, false);
    commit(el, key, ctx);
  });
}

function move(el: HTMLElement, x: number, y: number, ctx: DeskContext, _persist: boolean): void {
  const w = el.offsetWidth || 200;
  const h = el.offsetHeight || 120;
  const cx = Math.min(ctx.width - KEEP, Math.max(KEEP - w, x));
  const cy = Math.min(ctx.height - KEEP, Math.max(KEEP - h, y));
  el.style.left = `${Math.round(cx)}px`;
  el.style.top = `${Math.round(cy)}px`;
}

function commit(el: HTMLElement, key: string, ctx: DeskContext): void {
  ctx.layout[key] = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
  ctx.changed();
}

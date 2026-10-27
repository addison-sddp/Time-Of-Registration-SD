import { toggleFlip } from "./documents";

// Movable desk items: pointer drag plus arrow keys (Shift for bigger steps). F flips a
// focused card that has a back. Positions are stored in save.desk_layout by item key.

export interface DeskContext {
  layout: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
  scale: () => number;
  changed: () => void;
  // Optional hooks for the play screen. `cue` plays the pickup and drop sounds, `moved` fires while
  // an item is dragged, and `released` fires after a drag; it returns true when it handled the
  // drop itself (so no generic drop sound is played).
  cue?: (el: HTMLElement, what: "pickup" | "drop") => void;
  moved?: (el: HTMLElement, key: string) => void;
  released?: (el: HTMLElement, key: string) => boolean;
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
  // Dragging must never highlight text. selectstart is cancelled rather than pointerdown, so focus
  // and clicks are unaffected; text entry controls keep normal selection.
  el.addEventListener("selectstart", (e) => {
    if (!(e.target as HTMLElement | null)?.closest?.("textarea, input")) e.preventDefault();
  });
  el.addEventListener("dragstart", (e) => e.preventDefault());

  el.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button, input, select, a, .src-target")) return;
    if (e.button !== 0) return;
    raise();
    ctx.cue?.(el, "pickup");
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 };
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const onMove = (ev: PointerEvent): void => {
      const k = ctx.scale() || 1;
      move(el, origin.x + (ev.clientX - startX) / k, origin.y + (ev.clientY - startY) / k, ctx, false);
      ctx.moved?.(el, key);
    };
    const onUp = (): void => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      commit(el, key, ctx);
      const handled = ctx.released?.(el, key) ?? false;
      if (!handled) ctx.cue?.(el, "drop");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });

  // Keyboard moves: one pickup sound at the first arrow, one drop sound when focus leaves.
  let held = false;
  el.addEventListener("blur", () => {
    if (!held) return;
    held = false;
    ctx.cue?.(el, "drop");
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
    if (!held) {
      held = true;
      ctx.cue?.(el, "pickup");
    }
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

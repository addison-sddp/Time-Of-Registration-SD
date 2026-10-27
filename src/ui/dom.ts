// Tiny element builders. No framework; the UI is plain DOM.

type AttrValue = string | number | boolean | null | undefined | EventListener;
export type Attrs = Record<string, AttrValue>;
export type Child = Node | string | null | undefined | false;

function apply(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === "function") {
      el.addEventListener(k.replace(/^on/, "").toLowerCase(), v);
    } else if (k === "class") {
      el.setAttribute("class", String(v));
    } else {
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function s(tag: string, attrs: Attrs = {}, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el as SVGElement;
}

export const clear = (el: Element): void => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

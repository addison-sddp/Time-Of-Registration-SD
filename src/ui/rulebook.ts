import sealUrl from "../../assets/seal_minnehaha_fictional.svg";
import { rulebookCopy as C, rulebookEntries } from "../game/ruletext";
import { h } from "./dom";
import "./rulebook.css";

export interface RulebookOptions {
  activeRuleIds: readonly string[];
  notes: string;
  onNotesChange: (text: string) => void;
  sfx?: (name: string) => void;
  reducedMotion?: () => boolean;
}

// Whether a click on the rulebook element should open it. A click that starts inside the open
// book (the close button, the page buttons) bubbles up to the element after its own handler has
// already run; without the "inside" check, the close button's click would reopen the book at once.
const CLICK_SLOP = 5;
export function shouldOpenOnClick(isOpen: boolean, insideBook: boolean, movedPx: number): boolean {
  return !isOpen && !insideBook && movedPx <= CLICK_SLOP;
}

export const NOTES_MAX = 4000;
const DEBOUNCE_MS = 400;


// A desk item: closed it is a cover with the seal, open it shows one rule per page and then a
// ruled notes page. It always starts closed.
export function createRulebook(opts: RulebookOptions): { el: HTMLElement; close(): void; isOpen(): boolean } {
  const entries = rulebookEntries(opts.activeRuleIds);
  const total = entries.length + 1; // rules pages, then notes
  let open = false;
  let page = 0;

  const cover = h(
    "div",
    { class: "rb-cover" },
    h("img", { class: "rb-seal", src: sealUrl, alt: "" }),
    h("div", { class: "rb-cover-title" }, C.cover_title),
    h("div", { class: "rb-cover-sub" }, C.cover_subtitle),
  );

  const pageHost = h("div", { class: "rb-page", role: "region" });
  const counter = h("span", { class: "rb-counter", "aria-live": "polite" });
  const prev = h("button", { type: "button", class: "rb-btn", "aria-label": C.prev_label, onclick: () => turn(-1) }, "‹");
  const next = h("button", { type: "button", class: "rb-btn", "aria-label": C.next_label, onclick: () => turn(1) }, "›");
  const closeBtn = h("button", { type: "button", class: "rb-btn rb-close", "aria-label": C.close_label, onclick: () => close(true) }, "×");
  const bar = h("div", { class: "rb-bar" }, prev, counter, next, closeBtn);
  const book = h("div", { class: "rb-book", hidden: true }, pageHost, bar);

  const el = h(
    "div",
    {
      class: "item rulebook is-closed",
      tabindex: 0,
      role: "group",
      "aria-roledescription": "movable",
      "aria-label": C.cover_title,
      "aria-expanded": "false",
      "data-material": "paper",
    },
    cover,
    book,
  );

  // ---- notes ----
  let timer: number | undefined;
  let lastSent = opts.notes;
  let current = opts.notes.slice(0, NOTES_MAX);

  const flush = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
    if (current !== lastSent) {
      lastSent = current;
      opts.onNotesChange(current);
    }
  };

  function notesPage(): HTMLElement {
    const ta = h("textarea", {
      class: "rb-notes",
      maxlength: NOTES_MAX,
      spellcheck: "false",
      "aria-label": C.notes_label,
      placeholder: C.notes_placeholder,
    });
    ta.value = current;
    ta.addEventListener("input", () => {
      current = ta.value.slice(0, NOTES_MAX);
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(flush, DEBOUNCE_MS);
    });
    ta.addEventListener("blur", flush);
    // Typing must not reach the game's shortcuts or start a desk drag.
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    ta.addEventListener("keyup", (e) => e.stopPropagation());
    ta.addEventListener("pointerdown", (e) => e.stopPropagation());
    return h("div", { class: "rb-sheet rb-notes-sheet" }, h("h3", { class: "rb-title" }, C.notes_heading), ta);
  }

  function render(): void {
    flush();
    pageHost.replaceChildren();
    const entry = entries[page];
    if (entry !== undefined) {
      const sheet = h("div", { class: "rb-sheet rb-rule-sheet", tabindex: 0 }, h("h3", { class: "rb-title" }, entry.title));
      for (const line of entry.body) {
        const bullet = line.startsWith("• ");
        sheet.append(h("p", { class: bullet ? "rb-line rb-bullet" : "rb-line" }, bullet ? line.slice(2) : line));
      }
      pageHost.append(sheet);
      pageHost.setAttribute("aria-label", entry.title);
    } else {
      pageHost.append(notesPage());
      pageHost.setAttribute("aria-label", C.notes_heading);
    }
    counter.textContent = C.page_label.replace("{n}", String(page + 1)).replace("{total}", String(total));
    prev.disabled = page === 0;
    next.disabled = page === total - 1;
    if (!(opts.reducedMotion?.() ?? false)) {
      pageHost.classList.remove("rb-turn");
      void pageHost.offsetWidth;
      pageHost.classList.add("rb-turn");
    }
  }

  function turn(d: number): void {
    const n = Math.min(total - 1, Math.max(0, page + d));
    if (n === page) return;
    page = n;
    opts.sfx?.("ui_click");
    render();
  }

  function openBook(): void {
    if (open) return;
    open = true;
    el.classList.remove("is-closed");
    el.classList.add("is-open");
    el.setAttribute("aria-expanded", "true");
    cover.hidden = true;
    book.hidden = false;
    opts.sfx?.("paper_pickup");
    render();
    el.querySelector<HTMLElement>(".rb-close")?.focus();
  }

  function close(refocus: boolean): void {
    if (!open) return;
    flush();
    open = false;
    el.classList.remove("is-open");
    el.classList.add("is-closed");
    el.setAttribute("aria-expanded", "false");
    book.hidden = true;
    cover.hidden = false;
    opts.sfx?.("paper_drop");
    if (refocus) el.focus();
  }

  // A click (not a drag) or Enter/Space on the focused closed cover opens it.
  let down: { x: number; y: number } | null = null;
  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener("click", (e) => {
    const inside = (e.target as Element | null)?.closest(".rb-book") !== null;
    const moved = down === null ? 0 : Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (shouldOpenOnClick(open, inside, moved)) openBook();
  });
  el.addEventListener("keydown", (e) => {
    if (e.target !== el) return;
    if (!open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openBook();
    }
  });
  book.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      close(true);
    }
  });
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget as Node | null)) flush();
  });

  return { el, close: () => close(false), isOpen: () => open };
}

import sealUrl from "../../assets/seal_minnehaha_fictional.svg";
import { calendar, narrative } from "../data";
import { lookupElection } from "../engine/calendar";
import { binPixels, boothScenePixels } from "../game/boothart";
import { fill, formatMoney, monthYear } from "../game/format";
import { bulletinEntries, NO_NEW_RULES_LINE } from "../game/ruletext";
import { applicantPortraitSeed, applicantTraits } from "../game/portrait";
import { findReason, reasonCatalog, type DocSource } from "../game/reasons";
import {
  acknowledgeNotice, activeRules, backToReasons, callNext, canCallNext, cancelDenial, chooseReason, chooseSource,
  currentApplicant, deliverBulletin, fileForm, startDenial, stampApprove, stampDenied, type GameState,
} from "../game/state";
import type { GeneratedApplicant } from "../gen/types";
import type { Decision } from "../save/schema";
import type { Audio, Sfx } from "./audio";
import { clear, h } from "./dom";
import { placeItem, type DeskContext } from "./desk";
import { materialOf, renderCard, renderForm } from "./documents";
import { drawPortrait } from "./portrait";
import { drawGrid } from "./pixels";
import { stampFace, stampImpression } from "./stamps";
import { createRulebook } from "./rulebook";
import { buildSigns } from "./signs";
import { createWallClock } from "./wallclock";
import "./flow.css";

export const STAGE_W = 1280;
export const STAGE_H = 800;
const BOOTH_H = 300;
const DESK_H = STAGE_H - BOOTH_H;

export interface PlayEnv {
  audio: Audio;
  layout: Record<string, { x: number; y: number }>;
  layoutChanged(): void;
  notes: string;
  onNotesChange(text: string): void;
  scale(): number;
  reducedMotion(): boolean;
  onState(s: GameState): void;
  onComplete(s: GameState): void;
  openSettings(): void;
  exit(): void;
  exitLabel: string;
}

export interface PlayView {
  el: HTMLElement;
  destroy(): void;
}

const N = narrative;
const T = (group: Record<string, string>, k: string): string => group[k] ?? "";

// Desk fixtures on the right edge (desk coordinates).
const SLIP_POS = { x: 1040, y: 138 };
const RULEBOOK_POS = { x: 1040, y: 330 };
const RULEBOOK_OPEN_W = 460;
const RULEBOOK_OPEN_H = 320;

const COLS = [345, 575, 805];
// Two rows of three; cards are at most about 235 tall.
const ROWS = [6, 254];

// Timings (ms). Everything here is skipped under reduced motion.
const BULLETIN_MS = 2200; // at most 2.5 s
const WALK_MS = 1200;
const WALK_STEP_MS = 100;
const WALK_OFFSET = 284; // portrait x when it is fully out of the glass
const PRESS_MS = 140; // stamp travel before the impression lands
const DOC_STAGGER_MS = 90;

type Phase = "bulletin" | "idle" | "walking_in" | "present" | "walking_out";

export function createPlay(initial: GameState, env: PlayEnv): PlayView {
  let state = initial;
  let phase: Phase = "bulletin";
  let destroyed = false;
  let completeSent = false;
  let sourceOn = false;
  let evalNote = ""; // procedural note when a form could not be evaluated
  const timers = new Set<number>();
  const rm = (): boolean => env.reducedMotion();
  const sfx = (name: Sfx): void => env.audio.sfx(name);

  const later = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
  };
  const wait = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      if (ms <= 0) resolve();
      else later(resolve, ms);
    });

  // Polite announcements for screen readers.
  const announcer = h("div", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const announce = (text: string): void => {
    announcer.textContent = "";
    later(() => { announcer.textContent = text; }, 30);
  };

  const desk = h("section", { class: "desk", "aria-label": T(N.desk, "desk_label") });
  const docEls = new Map<string, HTMLElement>();
  const deskCtx: DeskContext = {
    layout: env.layout, width: STAGE_W, height: DESK_H, scale: env.scale, changed: env.layoutChanged,
    cue(el, what) {
      const m = el.dataset["material"];
      if (m === "paper") sfx(what === "pickup" ? "paper_pickup" : "paper_drop");
      else if (m === "card") sfx(what === "pickup" ? "card_pickup" : "card_drop");
    },
    moved(el, key) {
      if (key === "form" && state.pending !== null) bin.classList.toggle("over", overBin(el));
    },
    released(el, key) {
      bin.classList.remove("over");
      if (key === "form" && state.pending !== null && phase === "present" && overBin(el)) {
        fileCurrent();
        return true;
      }
      return false;
    },
  };

  // ---- Booth ----
  const portraitLayer = h("div", { class: "portrait-layer" });
  const glass = h("div", { class: "booth-glass" }, drawGrid(boothScenePixels(), 4, "booth-scene"), portraitLayer);
  const speech = h("div", { class: "speech", hidden: true });
  const hudDate = h("div", { class: "hud-date" });
  const hudCount = h("div", { class: "hud-count" });
  const incomeVal = h("span", { class: "val" });
  const errorsVal = h("span", { class: "val" });
  const note = h("p", { class: "note" });
  const wallClock = createWallClock(!rm());
  const hud = h(
    "aside",
    { class: "hud", "aria-label": T(N.ledger, "heading") },
    h("div", { class: "wall-clock-wrap" }, wallClock.el),
    h(
      "div",
      { class: "ledger-panel" },
      state.mode === "sandbox" ? h("div", { class: "badge", role: "note" }, T(N.sandbox, "badge")) : null,
      hudDate,
      hudCount,
      h("div", { class: "counter", role: "status" }, h("span", {}, `${T(N.ledger, "income")}: `), incomeVal),
      h("div", { class: "counter", role: "status" }, h("span", {}, `${T(N.ledger, "errors")}: `), errorsVal),
      note,
    ),
  );

  const nextBtn = h(
    "button",
    {
      type: "button",
      class: "push-button away",
      disabled: true,
      "aria-keyshortcuts": "N",
      onclick: () => { void callApplicant(); },
    },
    h("span", { class: "push-cap" }, T(N.flow, "next_applicant")),
  );
  const nextWrap = h("div", { class: "next-wrap" }, nextBtn);

  const found = lookupElection(calendar, state.as_of);
  const signs = buildSigns(found.ok ? found.entry : null, T(N.notes, "no_election"));
  const booth = h(
    "section",
    { class: "booth", "aria-label": T(N.desk, "booth_label") },
    h("img", { class: "seal", src: sealUrl, alt: T(N.desk, "wall_seal") }),
    h("div", { class: "booth-frame" }, glass, h("div", { class: "ledge" })),
    speech,
    signs.election,
    signs.bornBefore,
    nextWrap,
    h(
      "div",
      { class: "booth-controls" },
      h("button", { type: "button", class: "small", onclick: () => { sfx("ui_click"); env.exit(); } }, env.exitLabel),
      h("button", { type: "button", class: "small", onclick: () => { sfx("ui_click"); env.openSettings(); } }, T(N.desk, "settings_button")),
    ),
    hud,
  );

  // ---- Persistent desk items ----
  const items: HTMLElement[] = [];
  const addItem = (el: HTMLElement, key: string, def: { x: number; y: number }): void => {
    desk.append(el);
    placeItem(el, key, def, deskCtx);
    items.push(el);
  };
  desk.append(h("div", { class: "bulletin-slot", "aria-hidden": "true", title: T(N.desk, "bulletin_slot") }));
  const letter = buildLetter(state);
  letter.classList.toggle("unprinted", !state.bulletin_delivered);
  addItem(letter, "letter", { x: 10, y: 10 });

  // The rulebook: a desk item, closed at the start of every shift. Opening it near the desk edge
  // slides it back inside for as long as it is open (the saved closed position is not changed).
  const rulebook = createRulebook({
    activeRuleIds: activeRules(state),
    notes: env.notes,
    onNotesChange: env.onNotesChange,
    sfx: (name) => sfx(name as Sfx),
    reducedMotion: rm,
  });
  addItem(rulebook.el, "rulebook", RULEBOOK_POS);
  let rulebookHome: { left: string; top: string } | null = null;
  new MutationObserver(() => {
    const el = rulebook.el;
    if (el.classList.contains("is-open") && rulebookHome === null) {
      rulebookHome = { left: el.style.left, top: el.style.top };
      el.style.left = `${Math.max(0, Math.min(parseFloat(el.style.left) || 0, STAGE_W - RULEBOOK_OPEN_W))}px`;
      el.style.top = `${Math.max(0, Math.min(parseFloat(el.style.top) || 0, DESK_H - RULEBOOK_OPEN_H))}px`;
    } else if (el.classList.contains("is-closed") && rulebookHome !== null) {
      const home = rulebookHome;
      rulebookHome = null;
      const moved = env.layout["rulebook"];
      if (moved === undefined || `${moved.x}px` === home.left) {
        el.style.left = home.left;
        el.style.top = home.top;
      }
    }
  }).observe(rulebook.el, { attributes: true, attributeFilter: ["class"] });

  // Stamps
  const stampButton = (kind: Decision): HTMLButtonElement => {
    const approveKind = kind === "approve";
    return h(
      "button",
      {
        type: "button",
        class: `stamp ${approveKind ? "stamp-approve" : "stamp-deny"}`,
        "aria-label": T(N.desk, approveKind ? "approve_label" : "deny_label"),
        "aria-keyshortcuts": approveKind ? "A" : "D",
        onclick: () => (approveKind ? doApprove() : doDeny()),
      },
      stampFace(kind),
    );
  };
  const approveBtn = stampButton("approve");
  const denyBtn = stampButton("deny");
  desk.append(h("div", { class: "stamps", role: "group", "aria-label": T(N.desk, "stamp_pad") }, approveBtn, denyBtn));

  // The completed-forms bin: a wooden tray; the stack inside grows 1 px per filed form.
  const binStack = h("div", { class: "bin-stack", "aria-hidden": "true" });
  const binCount = h("span", { class: "sr-only", role: "status" });
  const bin = h(
    "div",
    { class: "bin", role: "group", "aria-label": T(N.bin, "region") },
    drawGrid(binPixels(), 3, "bin-art"),
    binStack,
    h("span", { class: "bin-label" }, T(N.bin, "label")),
    binCount,
  );
  desk.append(bin);

  const docLayer: HTMLElement[] = [];
  const overlay = h("div", { class: "overlay", hidden: true });
  const root = h("div", { class: "play" }, booth, desk, overlay, announcer);

  // ---- Helpers ----
  function overBin(el: HTMLElement): boolean {
    const a = el.getBoundingClientRect();
    const b = bin.getBoundingClientRect();
    const cx = a.left + a.width / 2;
    const cy = a.top + a.height / 2;
    return cx >= b.left && cx <= b.right && cy >= b.top - 20 && cy <= b.bottom;
  }

  function setBinCount(n: number): void {
    binStack.style.height = `${Math.min(n, 40)}px`;
    binStack.hidden = n === 0;
    binCount.textContent = fill(T(N.bin, "count"), { n });
  }

  const docTitle = (card: HTMLElement | undefined): string => card?.getAttribute("aria-label") ?? "";
  const fieldLabel = (field: string): string => T(N.fields, field);
  const sourceText = (src: DocSource): string =>
    fill(T(N.denial, "source_name"), {
      doc: src.doc_type === "residency_declaration" ? T(N.doc_types, "application_form") : docTitle(docLayer.find((c) => c.dataset["docId"] === src.doc_id)),
      field: src.doc_type === "residency_declaration" && src.field === "address" ? T(N.fields, "residence_address") : fieldLabel(src.field),
    });

  // ---- Rendering ----
  function renderHud(): void {
    hudDate.textContent = fill(T(N.desk, "shift_date"), { month_year: monthYear(state.as_of) });
    hudCount.textContent = state.present
      ? fill(T(N.desk, "applicant_counter"), { n: state.index + 1, total: state.applicants.length })
      : T(N.desk, "no_applicant");
    incomeVal.textContent = formatMoney(state.balance);
    errorsVal.textContent = String(state.errors);
    note.textContent = evalNote;
  }

  function syncControls(): void {
    const ready = phase === "present" && state.status === "in_progress" && state.pending === null;
    approveBtn.disabled = !ready || state.draft !== null;
    denyBtn.disabled = !ready || (state.draft !== null && state.draft.step !== "ready");
    const showNext = phase === "idle" && canCallNext(state);
    nextBtn.disabled = !showNext;
    nextBtn.classList.toggle("away", !showNext);
    nextBtn.tabIndex = showNext ? 0 : -1;
  }

  function refresh(): void {
    renderHud();
    syncControls();
  }

  function renderOverlay(): void {
    clear(overlay);
    if (state.restart_notice === null || phase === "walking_out") {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    const btn = h("button", {
      type: "button",
      class: "primary",
      onclick: () => {
        sfx("ui_click");
        state = acknowledgeNotice(state);
        renderOverlay();
        refresh();
        announce(T(N.flow, "announce_empty"));
        nextBtn.focus();
      },
    }, T(N.summary, "restart"));
    overlay.append(
      h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-label": T(N.summary, "heading") },
        h("p", { class: "dialog-text" }, state.restart_notice), btn),
    );
    btn.focus();
  }

  // ---- Bulletin ----
  async function deliverLetter(): Promise<void> {
    if (state.bulletin_delivered) {
      phase = "idle";
      refresh();
      return;
    }
    await wait(rm() ? 0 : 450);
    sfx("bulletin_print");
    letter.classList.remove("unprinted");
    if (!rm()) {
      letter.classList.add("printing");
      await wait(BULLETIN_MS);
      letter.classList.remove("printing");
    }
    state = deliverBulletin(state);
    phase = "idle";
    refresh();
    announce(T(N.flow, "announce_bulletin"));
    nextBtn.focus();
  }

  // ---- Walking ----
  function mountPortrait(a: GeneratedApplicant): HTMLElement {
    clear(portraitLayer);
    const box = h(
      "div",
      { class: "booth-portrait" },
      drawPortrait(applicantPortraitSeed(a.application), T(N.desk, "applicant_portrait"), false, applicantTraits(a.application, state.as_of)),
    );
    portraitLayer.append(box);
    return box;
  }

  // Whole-pixel steps; a 2 px bob on every other step. Reduced motion: the final position at once.
  // Frames come from requestAnimationFrame, measured against the clock, after the start position
  // has been committed with a forced layout. (The earlier version chained setTimeout calls from
  // the same tick that created the portrait, which Firefox could collapse into one paint, so the
  // portrait seemed to appear and vanish.) A timer backstop finishes the walk in a hidden tab.
  function walk(box: HTMLElement, dir: "in" | "out"): Promise<void> {
    const place = (x: number, y: number): void => { box.style.transform = `translate(${x}px, ${y}px)`; };
    if (rm()) {
      place(dir === "in" ? 0 : WALK_OFFSET, 0);
      return Promise.resolve();
    }
    const steps = Math.round(WALK_MS / WALK_STEP_MS);
    return new Promise<void>((resolve) => {
      let finished = false;
      let last = -1;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        place(dir === "in" ? 0 : WALK_OFFSET, 0);
        resolve();
      };
      place(dir === "in" ? -WALK_OFFSET : 0, 0);
      void box.offsetWidth; // commit the start position before the first frame
      later(finish, WALK_MS + 400);
      let t0 = -1;
      const frame = (now: number): void => {
        if (finished || destroyed) return;
        if (t0 < 0) t0 = now;
        const i = Math.min(steps, Math.floor((now - t0) / WALK_STEP_MS));
        if (i !== last) {
          last = i;
          const raw = dir === "in" ? -WALK_OFFSET * (1 - i / steps) : WALK_OFFSET * (i / steps);
          place(Math.round(raw / 4) * 4, i > 0 && i < steps && i % 2 === 1 ? -2 : 0);
        }
        if (i >= steps) finish();
        else rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
    });
  }

  let portraitBox: HTMLElement | null = null;
  let rafId = 0;

  async function callApplicant(): Promise<void> {
    if (phase !== "idle" || !canCallNext(state)) return;
    sfx("button_press");
    state = callNext(state);
    phase = "walking_in";
    refresh();
    const a = currentApplicant(state);
    if (a === null) return;
    const n = state.index + 1;
    const total = state.applicants.length;
    announce(fill(T(N.flow, "announce_arriving"), { n, total }));
    portraitBox = mountPortrait(a);
    sfx("footsteps_in");
    await walk(portraitBox, "in");
    buildDocs(a);
    showSpeech(a);
    phase = "present";
    refresh();
    announce(fill(T(N.flow, "announce_arrived"), { n, total }));
  }

  function showSpeech(a: GeneratedApplicant): void {
    if (a.dialogue_key === undefined) {
      speech.hidden = true;
      env.audio.type(40);
      return;
    }
    const line = N.dialogue[a.dialogue_key];
    const text = typeof line === "string" ? line : fill(T(N.booth, "dialogue_pending"), { key: a.dialogue_key });
    clear(speech);
    speech.append(h("span", { class: "sr-only" }, `${T(N.booth, "dialogue_label")}: `), text);
    speech.hidden = false;
    env.audio.type(text.length);
  }

  function buildDocs(a: GeneratedApplicant): void {
    for (const el of docLayer) el.remove();
    docLayer.length = 0;
    docEls.clear();
    const app = a.application;
    // The residency declaration is shown inside the form (section 5), not as a separate paper.
    const cards: [string, HTMLElement][] = [["form", renderForm(app)]];
    if (app.id_document !== null) cards.push(["id", renderCard(app.id_document, state.as_of)]);
    const shownIds = new Set([app.id_document?.doc_id]);
    app.citizenship_documents.forEach((d, i) => {
      if (shownIds.has(d.doc_id)) return;
      shownIds.add(d.doc_id);
      cards.push([`cit-${i}`, renderCard(d, state.as_of)]);
    });
    cards.forEach(([key, el], i) => {
      desk.append(el);
      placeItem(
        el,
        key,
        { x: (COLS[i % 3] ?? 345) + 12 * Math.floor(i / 6), y: (ROWS[Math.floor(i / 3) % 2] ?? 6) + 14 * Math.floor(i / 6) },
        deskCtx,
      );
      docLayer.push(el);
      docEls.set(key, el);
      if (!rm()) {
        el.style.animationDelay = `${i * DOC_STAGGER_MS}ms`;
        el.classList.add("landing");
      }
      const sound: Sfx = materialOf(el.dataset["type"] ?? "") === "paper" ? "paper_drop" : "card_drop";
      later(() => sfx(sound), rm() ? 0 : i * DOC_STAGGER_MS);
    });
  }

  // ---- Stamping ----
  function pressStamp(kind: Decision, then: () => void): void {
    const btn = kind === "approve" ? approveBtn : denyBtn;
    btn.classList.add("pressed");
    later(() => btn.classList.remove("pressed"), 240);
    if (rm()) then();
    else later(then, PRESS_MS);
  }

  // The ink impression on the voter registration form. It stays with the form.
  function impress(kind: Decision): void {
    const form = docEls.get("form");
    if (form === undefined) return;
    const mark = h(
      "div",
      { class: `form-impression ${rm() ? "" : "landing-ink"}`.trim(), "aria-hidden": "true" },
      stampImpression(kind, rm(), 2),
    );
    form.append(mark);
    sfx(kind === "approve" ? "stamp_approve" : "stamp_deny");
    announce(fill(T(N.flow, kind === "approve" ? "announce_stamped_approve" : "announce_stamped_deny"), { n: state.index + 1 }));
    form.focus();
  }

  function doApprove(): void {
    if (phase !== "present") return;
    const next = stampApprove(state);
    if (next === state) return;
    state = next;
    syncControls();
    pressStamp("approve", () => impress("approve"));
  }

  function doDeny(): void {
    if (phase !== "present") return;
    if (state.draft === null) {
      const next = startDenial(state);
      if (next === state) return;
      state = next;
      openSheet();
      syncControls();
      return;
    }
    if (state.draft.step !== "ready") return;
    const next = stampDenied(state);
    if (next === state) return;
    state = next;
    closeSheet();
    syncControls();
    pressStamp("deny", () => impress("deny"));
  }

  // ---- Denial reasons sheet ----
  let sheet: HTMLElement | null = null;

  function openSheet(): void {
    if (sheet !== null) return;
    sheet = h("div", {
      class: "item sheet",
      tabindex: 0,
      role: "group",
      "data-material": "paper",
      "aria-roledescription": T(N.desk, "movable"),
      "aria-label": T(N.denial, "heading"),
    });
    sheet.addEventListener("keydown", onSheetKey);
    desk.append(sheet);
    placeItem(sheet, "denial_sheet", { x: 10, y: 10 }, deskCtx);
    sfx("paper_drop");
    renderSheet();
    announce(T(N.denial, "announce_open"));
    focusReason(0);
  }

  function closeSheet(): void {
    exitSourceMode();
    sheet?.remove();
    sheet = null;
  }

  function reasonButtons(): HTMLButtonElement[] {
    return sheet === null ? [] : Array.from(sheet.querySelectorAll<HTMLButtonElement>("button.reason"));
  }

  function focusReason(i: number): void {
    const list = reasonButtons();
    list[Math.max(0, Math.min(list.length - 1, i))]?.focus();
  }

  function onSheetKey(e: KeyboardEvent): void {
    if (state.draft?.step !== "reasons") return;
    const list = reasonButtons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") focusReason(at + 1);
    else if (e.key === "ArrowUp") focusReason(at < 0 ? 0 : at - 1);
    else if (e.key === "Home") focusReason(0);
    else if (e.key === "End") focusReason(list.length - 1);
    else return;
    e.preventDefault();
  }

  function renderSheet(): void {
    const d = state.draft;
    if (sheet === null || d === null) return;
    clear(sheet);
    sheet.classList.toggle("sourcing", d.step !== "reasons");
    const reason = d.reason_id === null ? null : findReason(d.reason_id);
    const instr =
      d.step === "reasons" ? "instruction_reasons" : d.step === "source" ? "instruction_source" : "instruction_ready";
    sheet.append(h("h2", {}, T(N.denial, "heading")), h("p", { class: "sheet-instr" }, T(N.denial, instr)));

    if (d.step === "reasons") {
      const groups = h("div", { class: "sheet-groups", role: "radiogroup", "aria-label": T(N.denial, "heading") });
      for (const g of reasonCatalog(activeRules(state))) {
        groups.append(h("h3", {}, g.heading));
        for (const r of g.reasons) {
          groups.append(
            h("button", {
              type: "button", class: "reason", role: "radio", "aria-checked": "false", onclick: () => pickReason(r.id),
            }, h("span", { class: "box", "aria-hidden": "true" }), r.text),
          );
        }
      }
      sheet.append(groups);
    } else if (reason !== null) {
      sheet.append(
        h("p", { class: "sheet-picked" }, h("span", { class: "box on", "aria-hidden": "true" }), fill(T(N.denial, "selected_reason"), { reason: reason.text })),
      );
      if (d.source !== null) {
        sheet.append(h("p", { class: "sheet-picked" }, fill(T(N.denial, "selected_source"), { source: sourceText(d.source) })));
      }
    }

    const actions = h("div", { class: "sheet-actions" });
    if (d.step !== "reasons") actions.append(h("button", { type: "button", class: "small", onclick: () => backFromSheet() }, T(N.denial, "back")));
    actions.append(h("button", { type: "button", class: "small", onclick: () => cancelSheet() }, T(N.denial, "cancel")));
    if (d.step === "ready") {
      actions.append(h("button", { type: "button", class: "stamp-denied", onclick: () => doDeny() }, T(N.denial, "stamp")));
    }
    sheet.append(actions);
  }

  function pickReason(id: string): void {
    const next = chooseReason(state, id);
    if (next === state) return;
    sfx("ui_click");
    state = next;
    const reason = findReason(id);
    if (reason === null) return;
    renderSheet();
    const said = fill(T(N.denial, "announce_reason"), { reason: reason.text });
    if (reason.needs_source) {
      enterSourceMode();
      announce(`${said} ${T(N.denial, "announce_source_needed")}`);
      focusFirstTarget();
    } else {
      announce(said);
      sheet?.querySelector<HTMLElement>("button.stamp-denied")?.focus();
    }
    syncControls();
  }

  function backFromSheet(): void {
    const next = backToReasons(state);
    if (next === state) return;
    sfx("ui_click");
    state = next;
    exitSourceMode();
    renderSheet();
    focusReason(0);
    announce(T(N.denial, "announce_back"));
    syncControls();
  }

  function cancelSheet(): void {
    if (state.draft === null) return;
    sfx("ui_click");
    state = cancelDenial(state);
    closeSheet();
    announce(T(N.denial, "announce_cancel"));
    syncControls();
  }

  // ---- Choosing the source on a document ----
  function targetsVisible(): HTMLElement[] {
    return Array.from(desk.querySelectorAll<HTMLElement>(".src-target")).filter((el) => el.offsetParent !== null);
  }

  function enterSourceMode(): void {
    exitSourceMode();
    const d = state.draft;
    const reason = d?.reason_id == null ? null : findReason(d.reason_id);
    if (reason === null) return;
    sourceOn = true;
    desk.classList.add("sourcing");
    const whole = reason.source === "photocopy";
    for (const card of docLayer) {
      if (whole) {
        card.classList.add("src-target");
        card.dataset["srcField"] = "photocopy";
        continue;
      }
      for (const el of Array.from(card.querySelectorAll<HTMLElement>("[data-field]"))) {
        const field = el.dataset["field"] ?? "";
        el.classList.add("src-target");
        el.dataset["srcField"] = field;
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        const own = el.dataset["srcType"];
        el.setAttribute("aria-label", `${own === undefined ? docTitle(card) : T(N.doc_types, "application_form")}: ${own === undefined ? fieldLabel(field) : T(N.fields, "residence_address")}`);
      }
    }
  }

  function exitSourceMode(): void {
    sourceOn = false;
    desk.classList.remove("sourcing");
    for (const el of Array.from(desk.querySelectorAll<HTMLElement>(".src-target, .src-picked"))) {
      el.classList.remove("src-target", "src-picked");
      delete el.dataset["srcField"];
      if (!el.classList.contains("doc")) {
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-label");
      }
    }
  }

  function focusFirstTarget(): void {
    targetsVisible()[0]?.focus();
  }

  function cycleTargets(back: boolean): void {
    const list: HTMLElement[] = [...targetsVisible(), ...(sheet === null ? [] : Array.from(sheet.querySelectorAll<HTMLElement>("button")))];
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (back ? list.length - 1 : 0) : (at + (back ? -1 : 1) + list.length) % list.length;
    list[next]?.focus();
  }

  function pickTarget(t: HTMLElement): void {
    const card = t.closest<HTMLElement>(".doc");
    if (card === null || !sourceOn) return;
    const src: DocSource = {
      doc_id: t.dataset["srcDocId"] ?? card.dataset["docId"] ?? "",
      doc_type: t.dataset["srcType"] ?? card.dataset["type"] ?? "",
      field: t.dataset["srcField"] ?? "",
    };
    const next = chooseSource(state, src);
    if (next === state) return;
    state = next;
    sfx("select_field");
    for (const el of Array.from(desk.querySelectorAll(".src-picked"))) el.classList.remove("src-picked");
    t.classList.add("src-picked");
    renderSheet();
    announce(fill(T(N.denial, "announce_source"), { source: sourceText(src) }));
    sheet?.querySelector<HTMLElement>("button.stamp-denied")?.focus();
    syncControls();
  }

  desk.addEventListener("click", (e) => {
    if (!sourceOn) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const t = target.closest<HTMLElement>(".src-target");
    if (t !== null) pickTarget(t);
  });
  desk.addEventListener("cardflip", () => sfx("card_flip"));

  // ---- Filing ----
  function fileCurrent(): void {
    if (phase !== "present" || state.pending === null) return;
    const before = state;
    const next = fileForm(before);
    if (next === before) return;
    state = next;
    if (next.pending !== null) {
      // The engine could not evaluate: the note shows, the form stays on the desk.
      evalNote = next.note ?? "";
      refresh();
      return;
    }
    phase = "walking_out";
    evalNote = "";
    if (next.restart_notice !== null) rulebook.close(); // a restart begins with the book closed
    const n = before.index + 1;
    sfx("paper_drop");
    if (next.errors > before.errors || next.restart_notice !== null) sfx("error_tone");

    const form = docEls.get("form");
    if (form !== undefined) {
      delete env.layout["form"]; // the next form starts at its usual place, not in the bin
      env.layoutChanged();
      if (rm()) form.remove();
      else {
        form.classList.add("filing");
        later(() => form.remove(), 280);
      }
    }
    setBinCount(next.ledger.length);
    env.onState(next);
    refresh();
    const slipText = printSlip(before, next, n);
    announce(`${fill(T(N.flow, "announce_filed"), { n })} ${slipText}`);
    void leave(n);
  }

  // ---- Decision slip: printed from the bulletin printer, replaced by the next one ----
  let slip: HTMLElement | null = null;

  function printSlip(before: GameState, next: GameState, n: number): string {
    const mistake = next.errors > before.errors || next.restart_notice !== null;
    const decision = before.pending?.decision ?? "approve";
    const text =
      next.restart_notice !== null
        ? fill(T(N.ledger, "slip_restart"), { n })
        : next.note ?? fill(T(N.ledger, decision === "approve" ? "slip_approved" : "slip_denied"), { n });
    slip?.remove();
    const el = h("div", {
      class: `item slip ${mistake ? "slip-bad" : "slip-good"}`, tabindex: 0, role: "group", "data-material": "paper",
      "aria-roledescription": T(N.desk, "movable"), "aria-label": T(N.desk, "decision_slip"),
    }, h("p", { class: "slip-text" }, text));
    desk.append(el);
    placeItem(el, "slip", SLIP_POS, deskCtx);
    slip = el;
    sfx("bulletin_print");
    if (!rm()) {
      el.classList.add("printing-slip");
      later(() => el.classList.remove("printing-slip"), 950);
    }
    return text;
  }

  async function leave(n: number): Promise<void> {
    for (const [key, el] of docEls) {
      if (key === "form") continue;
      if (!rm()) el.classList.add("returning");
    }
    speech.hidden = true;
    await wait(rm() ? 0 : 320);
    for (const el of docLayer) el.remove();
    docLayer.length = 0;
    docEls.clear();
    announce(fill(T(N.flow, "announce_leaving"), { n }));
    if (portraitBox !== null) {
      sfx("footsteps_out");
      await walk(portraitBox, "out");
      clear(portraitLayer);
      portraitBox = null;
    }
    phase = "idle";
    refresh();
    if (state.restart_notice !== null) {
      renderOverlay();
      return;
    }
    if (state.status === "complete") {
      if (!completeSent) {
        completeSent = true;
        env.onComplete(state);
      }
      return;
    }
    announce(T(N.flow, "announce_empty"));
    nextBtn.focus();
  }

  // ---- Keys ----
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t !== null && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    if (document.querySelector(".settings-panel") !== null) return;
    if (state.restart_notice !== null) return;

    if (e.key === "Escape" && state.draft !== null) {
      e.preventDefault();
      if (state.draft.step === "reasons") cancelSheet();
      else backFromSheet();
      return;
    }
    if (sourceOn && e.key === "Tab") {
      e.preventDefault();
      cycleTargets(e.shiftKey);
      return;
    }
    if (sourceOn && (e.key === "Enter" || e.key === " ") && t !== null && t.classList.contains("src-target")) {
      e.preventDefault();
      pickTarget(t);
      return;
    }
    if (e.repeat) return;
    if (e.key === "n" || e.key === "N") {
      void callApplicant();
      e.preventDefault();
    } else if (e.key === "a" || e.key === "A") {
      doApprove();
      e.preventDefault();
    } else if (e.key === "d" || e.key === "D") {
      doDeny();
      e.preventDefault();
    } else if ((e.key === "b" || e.key === "B") && state.pending !== null) {
      // The stamp moves focus to the form, so B normally arrives from it; any focus works.
      fileCurrent();
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", onKey);

  setBinCount(state.ledger.length);
  refresh();
  void deliverLetter();

  return {
    el: root,
    destroy: () => {
      destroyed = true;
      wallClock.destroy();
      rulebook.close();
      cancelAnimationFrame(rafId);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      document.removeEventListener("keydown", onKey);
    },
  };
}

function buildLetter(state: GameState): HTMLElement {
  const b = N.briefing;
  const entries = bulletinEntries(state.shift.shift_id, activeRules(state), state.mode);
  const body = h("div", { class: "letter-body" },
    h("h2", { class: "letter-office" }, b.header),
    h("p", { class: "letter-subject" }, b.subject),
    h("p", {}, fill(b.date_line, { month_year: monthYear(state.as_of) })),
    h("p", {}, entries.length > 0 ? b.intro : NO_NEW_RULES_LINE),
  );
  for (const entry of entries) {
    body.append(h("h3", {}, entry.title));
    for (const line of entry.body) {
      const bullet = line.startsWith("• ");
      body.append(h("p", { class: bullet ? "bullet" : "" }, line));
    }
  }
  body.append(h("p", { class: "closing" }, b.closing));
  return h("div", {
    class: "item letter", tabindex: 0, role: "group", "data-material": "paper",
    "aria-roledescription": T(N.desk, "movable"), "aria-label": T(N.desk, "briefing_letter"),
  }, body);
}

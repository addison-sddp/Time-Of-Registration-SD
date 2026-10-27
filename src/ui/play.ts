import flagUrl from "../../assets/flag_sioux_falls.svg";
import sealUrl from "../../assets/seal_minnehaha_fictional.svg";
import { calendar, narrative } from "../data";
import { lookupElection } from "../engine/calendar";
import { fill, formatDate, formatMoney, monthYear } from "../game/format";
import { applicantPortraitSeed } from "../game/portrait";
import {
  acknowledgeNotice, activeRules, currentApplicant, decide, type GameState,
} from "../game/state";
import { r3Citizenship } from "../rules";
import type { Decision } from "../save/schema";
import type { Audio } from "./audio";
import { clear, h } from "./dom";
import { placeItem, type DeskContext } from "./desk";
import { renderCard, renderForm, renderResidency } from "./documents";
import { drawPortrait } from "./portrait";
import { stampFace } from "./stamps";

export const STAGE_W = 1280;
export const STAGE_H = 800;
const BOOTH_H = 300;
const DESK_H = STAGE_H - BOOTH_H;

export interface PlayEnv {
  audio: Audio;
  layout: Record<string, { x: number; y: number }>;
  layoutChanged(): void;
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

const COLS = [345, 575, 805];
const ROWS = [10, 175, 340];

export function createPlay(initial: GameState, env: PlayEnv): PlayView {
  let state = initial;
  let shownKey = "";
  let completeSent = false;

  const desk = h("section", { class: "desk", "aria-label": "Desk" });
  const deskCtx: DeskContext = {
    layout: env.layout, width: STAGE_W, height: DESK_H, scale: env.scale, changed: env.layoutChanged,
  };

  // Booth
  const glass = h("div", { class: "booth-glass" });
  const speech = h("div", { class: "speech", hidden: true });
  const hudDate = h("div", { class: "hud-date" });
  const hudCount = h("div", { class: "hud-count" });
  const incomeVal = h("span", { class: "val" });
  const errorsVal = h("span", { class: "val" });
  const ledgerList = h("ol", { class: "ledger-list" });
  const note = h("p", { class: "note", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const hud = h(
    "aside",
    { class: "hud", "aria-label": T(N.ledger, "heading") },
    state.mode === "sandbox" ? h("div", { class: "badge", role: "note" }, T(N.sandbox, "badge")) : null,
    hudDate,
    hudCount,
    h("div", { class: "counter", role: "status" }, h("span", {}, `${T(N.ledger, "income")}: `), incomeVal),
    h("div", { class: "counter", role: "status" }, h("span", {}, `${T(N.ledger, "errors")}: `), errorsVal),
    h("h2", {}, T(N.ledger, "heading")),
    ledgerList,
    note,
  );
  const booth = h(
    "section",
    { class: "booth", "aria-label": "Booth" },
    h("img", { class: "seal", src: sealUrl, alt: T(N.desk, "wall_seal") }),
    h("div", { class: "booth-frame" }, glass, h("div", { class: "ledge" })),
    speech,
    h(
      "div",
      { class: "booth-controls" },
      h("button", { type: "button", class: "small", onclick: () => env.exit() }, env.exitLabel),
      h("button", { type: "button", class: "small", onclick: () => env.openSettings() }, T(N.desk, "settings_button")),
      h("p", { class: "controls-hint" }, T(N.desk, "controls")),
      h("p", { class: "controls-hint" }, T(N.desk, "move_hint")),
    ),
    hud,
  );

  // Persistent desk items
  const items: HTMLElement[] = [];
  const addItem = (el: HTMLElement, key: string, def: { x: number; y: number }): void => {
    desk.append(el);
    placeItem(el, key, def, deskCtx);
    items.push(el);
  };
  addItem(buildLetter(state), "letter", { x: 10, y: 10 });
  addItem(buildElection(state), "election", { x: 1040, y: 10 });
  addItem(buildFlag(), "flag", { x: 1050, y: 200 });

  // Stamps
  const stampButton = (kind: Decision): HTMLButtonElement => {
    const approve = kind === "approve";
    const btn = h(
      "button",
      {
        type: "button",
        class: `stamp ${approve ? "stamp-approve" : "stamp-deny"}`,
        "aria-label": T(N.desk, approve ? "approve_label" : "deny_label"),
        onclick: () => act(kind),
      },
      stampFace(kind, approve ? -3 : 4),
      h("span", { class: "key-hint", "aria-hidden": "true" }, T(N.desk, approve ? "approve_hint" : "deny_hint")),
    );
    return btn;
  };
  const approveBtn = stampButton("approve");
  const denyBtn = stampButton("deny");
  desk.append(h("div", { class: "stamps" }, approveBtn, denyBtn));

  const docLayer: HTMLElement[] = [];
  const overlay = h("div", { class: "overlay", hidden: true });

  const root = h("div", { class: "play" }, booth, desk, overlay);

  function buildApplicant(): void {
    for (const el of docLayer) el.remove();
    docLayer.length = 0;
    clear(glass);
    const a = currentApplicant(state);
    if (a === null) {
      speech.hidden = true;
      return;
    }
    const app = a.application;
    glass.append(h("div", { class: "booth-portrait" }, drawPortrait(applicantPortraitSeed(app), "Applicant portrait")));

    const cards: [string, HTMLElement][] = [["form", renderForm(app)]];
    if (app.id_document !== null) cards.push(["id", renderCard(app.id_document)]);
    cards.push(["residency", renderResidency(app.residency_declaration)]);
    const shownIds = new Set([app.id_document?.doc_id]);
    app.citizenship_documents.forEach((d, i) => {
      if (shownIds.has(d.doc_id)) return;
      shownIds.add(d.doc_id);
      cards.push([`cit-${i}`, renderCard(d)]);
    });
    cards.forEach(([key, el], i) => {
      desk.append(el);
      placeItem(el, key, { x: COLS[i % 3] ?? 345, y: ROWS[Math.floor(i / 3) % 3] ?? 10 }, deskCtx);
      docLayer.push(el);
    });

    if (a.dialogue_key !== undefined) {
      const line = N.dialogue[a.dialogue_key];
      const text = typeof line === "string" ? line : fill(T(N.booth, "dialogue_pending"), { key: a.dialogue_key });
      clear(speech);
      speech.append(h("span", { class: "sr-only" }, `${T(N.booth, "dialogue_label")}: `), text);
      speech.hidden = false;
      env.audio.type(text.length);
    } else {
      speech.hidden = true;
    }
    env.audio.type(40);
  }

  function renderHud(): void {
    hudDate.textContent = fill(T(N.desk, "shift_date"), { month_year: monthYear(state.as_of) });
    const a = currentApplicant(state);
    hudCount.textContent = a === null
      ? T(N.desk, "no_applicant")
      : fill(T(N.desk, "applicant_counter"), { n: state.index + 1, total: state.applicants.length });
    incomeVal.textContent = formatMoney(state.balance);
    errorsVal.textContent = String(state.errors);
    clear(ledgerList);
    const empty = state.ledger.length === 0;
    for (const line of state.ledger.slice(-6)) ledgerList.append(h("li", {}, line));
    if (empty) ledgerList.append(h("li", { class: "empty" }, T(N.ledger, "empty")));
    note.textContent = state.note ?? "";
  }

  function renderOverlay(): void {
    clear(overlay);
    if (state.restart_notice === null) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    const btn = h("button", {
      type: "button",
      class: "primary",
      onclick: () => {
        state = acknowledgeNotice(state);
        shownKey = "";
        renderAll();
      },
    }, T(N.summary, "restart"));
    overlay.append(
      h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-label": T(N.summary, "heading") },
        h("p", { class: "dialog-text" }, state.restart_notice), btn),
    );
    btn.focus();
  }

  function renderAll(): void {
    const key = `${state.attempt_number}:${state.index}:${state.status}`;
    if (key !== shownKey) {
      shownKey = key;
      buildApplicant();
    }
    renderHud();
    renderOverlay();
    if (state.status === "complete" && !completeSent) {
      completeSent = true;
      env.onComplete(state);
    }
  }

  function impression(kind: Decision): void {
    const rot = env.reducedMotion() ? 0 : (Math.random() - 0.5) * 14;
    const mark = h("div", { class: "impression", "aria-hidden": "true" }, stampFace(kind, rot, !env.reducedMotion()));
    desk.append(mark);
    setTimeout(() => mark.remove(), 900);
    const btn = kind === "approve" ? approveBtn : denyBtn;
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 220);
  }

  function act(d: Decision): void {
    if (state.status !== "in_progress" || state.restart_notice !== null) return;
    const before = state;
    state = decide(state, d);
    if (state === before) return;
    if (state.note !== before.note && state.note !== null) env.audio.type(state.note.length);
    if (state.index !== before.index || state.restart_notice !== null) {
      env.audio.stamp();
      impression(d);
      env.onState(state);
    }
    renderAll();
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t !== null && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
    if (document.querySelector(".settings-panel") !== null) return;
    if (e.key === "a" || e.key === "A") {
      act("approve");
      e.preventDefault();
    } else if (e.key === "d" || e.key === "D") {
      act("deny");
      e.preventDefault();
    }
  };
  document.addEventListener("keydown", onKey);

  renderAll();
  return { el: root, destroy: () => document.removeEventListener("keydown", onKey) };
}

function buildLetter(state: GameState): HTMLElement {
  const b = N.briefing;
  const ids = activeRules(state);
  const body = h("div", { class: "letter-body" },
    h("h2", { class: "letter-office" }, b.header),
    h("p", { class: "letter-subject" }, b.subject),
    h("p", {}, fill(b.date_line, { month_year: monthYear(state.as_of) })),
    h("p", {}, ids.length > 0 ? b.intro : b.no_rules),
  );
  for (const id of ids) {
    const rule = b.rules[id];
    if (rule === undefined) continue;
    body.append(h("h3", {}, rule.heading));
    for (const line of rule.lines) body.append(h("p", { class: line.level === 1 ? "bullet" : "" }, line.level === 1 ? `• ${line.text}` : line.text));
    if (id === "R3_CITIZENSHIP") {
      const tribes = (r3Citizenship.params as { participating_tribes: { name: string }[] }).participating_tribes;
      body.append(h("h4", {}, b.tribes_heading), h("ul", { class: "tribes" }, ...tribes.map((t) => h("li", {}, t.name))));
    }
  }
  body.append(h("p", { class: "closing" }, b.closing));
  return h("div", {
    class: "item letter", tabindex: 0, role: "group",
    "aria-roledescription": T(N.desk, "movable"), "aria-label": T(N.desk, "briefing_letter"),
  }, body);
}

function buildElection(state: GameState): HTMLElement {
  const found = lookupElection(calendar, state.as_of);
  const lines = found.ok
    ? [
        fill(T(N.desk, "next_election"), { label: found.entry.label, date: formatDate(found.entry.election_date) }),
        fill(T(N.desk, "registration_closes"), { date: formatDate(found.entry.registration_deadline) }),
      ]
    : [T(N.notes, "no_election")];
  return h("div", {
    class: "item election", tabindex: 0, role: "group",
    "aria-roledescription": T(N.desk, "movable"), "aria-label": T(N.desk, "election_display"),
  }, h("div", { class: "election-month" }, monthYear(state.as_of)), ...lines.map((l) => h("p", {}, l)));
}

function buildFlag(): HTMLElement {
  return h("div", {
    class: "item flag", tabindex: 0, role: "group",
    "aria-roledescription": T(N.desk, "movable"), "aria-label": T(N.desk, "desk_flag"),
  }, h("img", { src: flagUrl, alt: "", draggable: "false" }));
}

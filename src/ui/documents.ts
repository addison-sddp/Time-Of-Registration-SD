import { narrative } from "../data";
import type { Application, Document } from "../engine/types";
import { cardKind, mrzLines, serialDigits, stateStyle, wearFor } from "../game/docstyle";
import { FLIPPABLE_TYPES, finePrintFor, sdBackRows } from "../game/fineprint";
import { formatPrinted } from "../game/format";
import { r3Citizenship } from "../rules";
import {
  barsEmblem, embossedSeal, foil, notchFrame, rosetteSvg, ropeFrame, scallopFrame, sheen, starRing, stripeMark,
  waveBand, waveLayer,
} from "./decor";
import { h, s, type Child } from "./dom";
import { drawPortrait } from "./portrait";
import "./documents.css";

// Original designs, one look per document type (styled in documents.css). They show printed
// fields only. Decoration is abstract and drawn for this project; nothing is copied from a
// real document, seal or agency.

const tribes = (r3Citizenship.params as { participating_tribes: { key: string; name: string }[] }).participating_tribes;
const tribeName = (key: string): string => tribes.find((t) => t.key === key)?.name ?? key;

const D = narrative.docs;
const label = (k: string): string => D[k] ?? k;

// Each printed field carries a stable data-field key (name, birth_date, address, issue_date,
// expiry_date, issuing_jurisdiction, tribe, fine_print). While the denial sheet asks for a source,
// these are the items the player can select. `show` draws the row even when the value is empty.
function row(name: string, value: string | null, wide = false, key = "", show = false): Child {
  if (!show && (value === null || value === "")) return null;
  return h(
    "div",
    { class: wide ? "field wide" : "field", "data-field": key || null },
    h("dt", {}, name),
    h("dd", {}, value ?? ""),
  );
}

const PAPER: readonly string[] = [
  "application_form", "residency_declaration", "birth_certificate", "us_passport",
  "consular_report_of_birth_abroad", "certificate_of_naturalization",
];

// "paper" for sheets and booklets, "card" for plastic cards: picks the pickup and drop sounds.
export const materialOf = (type: string): "paper" | "card" => (PAPER.includes(type) ? "paper" : "card");

function addressText(d: Document): string | null {
  if (d.address_line === null) return null;
  const tail = [d.address_city, [d.address_state, d.address_postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return tail ? `${d.address_line}, ${tail}` : d.address_line;
}

function issuer(d: Document): string | null {
  if (d.issuing_jurisdiction === null) return null;
  return d.type === "tribal_id" ? tribeName(d.issuing_jurisdiction) : d.issuing_jurisdiction;
}

function fields(d: Document): Child[] {
  return [
    row(label("name"), d.name, true, "name"),
    row(label("birth_date"), d.birth_date === null ? null : formatPrinted(d.birth_date), false, "birth_date"),
    row(label("address"), addressText(d), true, "address"),
    row(label("issued"), d.issue_date === null ? null : formatPrinted(d.issue_date), false, "issue_date"),
    row(label("expires"), d.expiry_date === null ? null : formatPrinted(d.expiry_date), false, "expiry_date"),
    row(
      d.type === "tribal_id" ? label("tribe") : label("issued_by"),
      issuer(d),
      d.type === "tribal_id",
      d.type === "tribal_id" ? "tribe" : "issuing_jurisdiction",
    ),
  ];
}

function shell(type: string, title: string, extra: string, id: string): HTMLElement {
  return h("div", {
    class: `item doc ${extra}`.trim(),
    "data-type": type,
    "data-doc-id": id,
    "data-material": materialOf(type),
    tabindex: 0,
    role: "group",
    "aria-roledescription": narrative.desk["movable"],
    "aria-label": title,
  });
}

// Paper items get deterministic wear from the id: a crease, a folded corner, slightly uneven print.
function dress(card: HTMLElement, id: string): void {
  const w = wearFor(id);
  card.setAttribute("data-paper", "1");
  card.classList.add(`crease-${w.crease}`, `fold-${w.fold}`);
  card.style.setProperty("--crease-pos", `${w.crease_pos}%`);
  card.style.setProperty("--fold", `${w.fold_size}px`);
  card.style.setProperty("--print-x", `${w.shift_x}px`);
  card.style.setProperty("--print-y", `${w.shift_y}px`);
  card.style.setProperty("--tilt", `${w.tilt}deg`);
  card.style.setProperty("--ink", String(w.ink));
  card.append(h("span", { class: "wear", "aria-hidden": "true" }, h("span", { class: "crease" }), h("span", { class: "fold" })));
}

const portraitBox = (d: Document): Child =>
  d.portrait_seed === null ? null : h("div", { class: "doc-portrait" }, drawPortrait(d.portrait_seed, label("portrait_label")));
const fieldList = (d: Document): HTMLElement => h("dl", { class: "fields grid" }, ...fields(d));
const body = (d: Document): HTMLElement => h("div", { class: "doc-body" }, portraitBox(d), fieldList(d));
const titleSpan = (t: string): HTMLElement => h("span", { class: "doc-title" }, t);
const serial = (d: Document, tag: string, n: number): HTMLElement =>
  h("span", { class: "serial" }, `${label("serial_label")} ${serialDigits(d.doc_id, tag, n)}`);

function front(d: Document, title: string): HTMLElement {
  const face = (...kids: Child[]): HTMLElement => h("div", { class: "face front" }, ...kids);
  const state = d.issuing_jurisdiction ?? "";
  switch (d.type) {
    case "sd_drivers_license":
      return face(
        waveLayer(128, 5, 6, 38),
        h("div", { class: "doc-head" }, barsEmblem(), titleSpan(title)),
        body(d),
        foil(),
        sheen(),
      );
    case "other_state_drivers_license":
      return face(
        h("div", { class: "decor mark" }, rosetteSvg(stateStyle(state).lobes)),
        h("div", { class: "doc-head" }, h("span", { class: "doc-state" }, state), titleSpan(title)),
        body(d),
        sheen(),
      );
    case "other_state_nondriver_id":
      return face(
        h("div", { class: "side-band", "aria-hidden": "true" }, h("span", { class: "side-code" }, state), stripeMark()),
        h("div", { class: "doc-head" }, titleSpan(title)),
        body(d),
        sheen(),
      );
    case "tribal_id":
      return face(
        h("div", { class: "doc-head" }, titleSpan(title)),
        h("div", { class: "tribe-line" }, issuer(d) ?? ""),
        h("div", { class: "doc-body" }, h("div", { class: "rail" }, portraitBox(d)), fieldList(d)),
      );
    case "birth_certificate":
      return face(
        scallopFrame(),
        h("div", { class: "doc-head" }, titleSpan(title), h("span", { class: "doc-sub" }, label("birth_cert_line"))),
        serial(d, "birth", 7),
        body(d),
        embossedSeal(7),
      );
    case "us_passport": {
      const [m1, m2] = mrzLines(d);
      return face(
        h("div", { class: "doc-head" }, starRing(), titleSpan(title), h("span", { class: "pp-type" }, label("passport_type"), h("br"), label("passport_code"))),
        waveBand(226, 10, 4, "wave-band pp-band"),
        body(d),
        h("div", { class: "mrz", "aria-hidden": "true" }, h("div", {}, m1), h("div", {}, m2)),
        sheen(),
      );
    }
    case "consular_report_of_birth_abroad":
      return face(
        notchFrame(),
        h("div", { class: "doc-head" }, starRing(7), titleSpan(title), h("span", { class: "doc-sub" }, label("consular_line"))),
        serial(d, "consular", 8),
        body(d),
      );
    case "certificate_of_naturalization":
      return face(
        ropeFrame(),
        h("div", { class: "doc-head" }, h("span", { class: "doc-sub top" }, label("usa_header")), titleSpan(title), h("span", { class: "doc-sub" }, label("naturalization_line"))),
        serial(d, "natz", 8),
        body(d),
        embossedSeal(9),
      );
    case "other_unrecognized": {
      const kind = cardKind(d.doc_id);
      return face(
        h("div", { class: "doc-head" }, kind === "member" ? h("span", { class: "chip", "aria-hidden": "true" }) : stripeMark(), titleSpan(title), h("span", { class: "doc-state" }, label(`card_kind_${kind}`))),
        body(d),
        kind === "library" ? h("div", { class: "barcode", "aria-hidden": "true" }) : null,
        kind === "staff" ? h("div", { class: "clip-slot", "aria-hidden": "true" }) : null,
        sheen(),
      );
    }
    default:
      return face(h("div", { class: "doc-head" }, titleSpan(title)), body(d));
  }
}

// A small original outline of South Dakota: a plain polygon, drawn for this project.
function stateOutline(): SVGElement {
  return s(
    "svg",
    { viewBox: "0 0 62 36", class: "sd-outline", "aria-hidden": "true", focusable: "false" },
    s("polygon", { points: "3,4 58,4 59,13 57,18 58,25 54,31 47,28 41,25 3,25", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linejoin": "round" }),
  );
}

// Back of an SD license: a cluttered card in flat ink. Citizenship is one fine-print row.
function sdBack(d: Document): HTMLElement {
  const rows = sdBackRows(d);
  return h(
    "div",
    { class: "face back sd-back" },
    waveLayer(104, 4, 9, 46),
    h("div", { class: "micro" }, rows.digits),
    h("div", { class: "stripe sd-stripe", "aria-hidden": "true" }),
    h("div", { class: "sd-middle" }, ...rows.middle.map((r) => h("div", { class: "fp" }, r))),
    h("div", { class: "sd-bottom-left", "data-field": "fine_print" }, ...rows.bottom.map((r) => h("div", { class: "fp" }, r))),
    h(
      "div",
      { class: "sd-bottom-right" },
      rows.birth_date === null ? null : h("div", { class: "fp" }, rows.birth_date),
      stateOutline(),
    ),
    foil(),
    sheen(),
  );
}

function back(d: Document): HTMLElement {
  if (d.type === "sd_drivers_license") return sdBack(d);
  const fine = finePrintFor(d);
  const patterned = d.type === "other_state_drivers_license" || d.type === "other_state_nondriver_id";
  return h(
    "div",
    { class: "face back" },
    patterned ? waveLayer(112, 4, 8, 42) : null,
    h("div", { class: "stripe", "aria-hidden": "true" }),
    h(
      "div",
      { class: "back-meta" },
      h("span", {}, `${label("restrictions")}: ${label("restrictions_none")}`),
      h("span", {}, `${label("class")}: ${label("class_value")}`),
    ),
    fine === null ? null : h("span", { class: `fineprint ${fine.spot}`, "data-field": "fine_print" }, label("fine_print_citizen")),
    d.type === "tribal_id" ? null : sheen(),
  );
}

export function flippable(d: Document): boolean {
  return FLIPPABLE_TYPES.includes(d.type);
}

export function toggleFlip(card: HTMLElement): void {
  if (!card.classList.contains("flippable")) return;
  const flipped = card.classList.toggle("flipped");
  const btn = card.querySelector<HTMLButtonElement>("button.flip");
  btn?.setAttribute("aria-pressed", String(flipped));
  card.dispatchEvent(new CustomEvent("cardflip", { bubbles: true }));
}

const PAPER_TYPES: readonly string[] = ["birth_certificate", "consular_report_of_birth_abroad", "certificate_of_naturalization"];

export function renderCard(d: Document): HTMLElement {
  const title = narrative.doc_types[d.type] ?? d.type;
  const card = shell(d.type, title, `${d.is_photocopy ? "copy" : ""} ${flippable(d) ? "flippable" : ""}`, d.doc_id);
  if (d.type === "other_state_drivers_license" || d.type === "other_state_nondriver_id") {
    const st = stateStyle(d.issuing_jurisdiction);
    card.setAttribute("data-state", (d.issuing_jurisdiction ?? "").toUpperCase());
    card.style.setProperty("--accent", st.accent);
    card.style.setProperty("--mid", st.mid);
    card.style.setProperty("--tint", st.tint);
  }
  if (d.type === "other_unrecognized") card.setAttribute("data-kind", cardKind(d.doc_id));
  card.append(front(d, title));
  if (flippable(d)) {
    card.append(
      back(d),
      h("button", {
        class: "flip",
        type: "button",
        "aria-label": `${title}: ${label("flip_label")}`,
        "aria-pressed": "false",
        onclick: () => toggleFlip(card),
      }, label("flip")),
    );
  }
  if (PAPER_TYPES.includes(d.type)) dress(card, d.doc_id);
  return card;
}

const formHead = (title: string, no: string): HTMLElement =>
  h("div", { class: "doc-head" }, titleSpan(title), h("span", { class: "form-no" }, no));

export function renderForm(app: Application): HTMLElement {
  const title = label("form_title");
  const card = shell("application_form", title, "", app.application_id);
  card.append(
    h(
      "div",
      { class: "face front" },
      formHead(title, label("form_number_vr")),
      h("p", { class: "doc-instr" }, label("form_instruction")),
      h(
        "div",
        { class: "doc-body" },
        h("dl", { class: "fields" }, row(label("name"), app.applicant_name, false, "name"), row(label("birth_date"), formatPrinted(app.declared_birth_date), false, "birth_date")),
      ),
      h(
        "div",
        { class: "office", "aria-hidden": "true" },
        h("span", { class: "office-title" }, label("office_use")),
        h("span", { class: "office-cell" }, label("office_received")),
        h("span", { class: "office-cell" }, label("office_initials")),
      ),
    ),
  );
  dress(card, app.application_id);
  return card;
}

export function renderResidency(d: Document): HTMLElement {
  const title = narrative.doc_types["residency_declaration"] ?? "";
  const card = shell("residency_declaration", title, d.is_photocopy ? "copy" : "", d.doc_id);
  card.append(
    h(
      "div",
      { class: "face front" },
      formHead(title, label("form_number_rd")),
      h("p", { class: "doc-instr" }, label("residency_instruction")),
      h("div", { class: "doc-body" }, h("dl", { class: "fields" }, row(label("name"), d.name, false, "name"), row(label("address"), addressText(d), false, "address", true))),
    ),
  );
  dress(card, d.doc_id);
  return card;
}

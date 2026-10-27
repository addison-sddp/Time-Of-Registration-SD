import { narrative } from "../data";
import type { Application, Document, ISODate } from "../engine/types";
import { backKind, cardKind, isBookPassport, mrzLines, serialDigits, stateStyle, wearFor } from "../game/docstyle";
import { FLIPPABLE_TYPES, finePrintFor, sdBackRows } from "../game/fineprint";
import { formatPrinted } from "../game/format";
import { documentTraits } from "../game/portrait";
import { r3Citizenship } from "../rules";
import {
  coverDevice, embossedSeal, foil, notchFrame, rosetteSvg, ropeFrame, scallopFrame, sheen, starRing, stateEmblem,
  stateOutlineMark, stripeMark, waveBand, waveLayer,
} from "./decor";
import { h, type Child } from "./dom";
import { drawPortrait } from "./portrait";
import "./documents.css";

// Original designs, one look per document type (styled in documents.css). They show printed
// fields only. Decoration is abstract and drawn for this project; nothing is copied from a
// real document, seal or agency.

const tribes = (r3Citizenship.params as { participating_tribes: { key: string; name: string }[] }).participating_tribes;
const tribeName = (key: string): string => tribes.find((t) => t.key === key)?.name ?? key;

const D = narrative.docs;

// COPY ADDED BY BUILD 5 (documents only; move into narrative.json docs when convenient). All wording is
// generic and original: no real form text, form number, statute or agency name.
export const DOC_COPY = {
  // Passport cover (closed book) and the open/close button.
  cover_title: "PASSPORT",
  cover_country: "United States of America",
  open: "open",
  close: "close",
  open_label: "Open passport (Enter or Space while focused)",
  close_label: "Close passport (Enter or Space while focused)",
  visa_page: "Visas",
  // Voter registration application sections.
  q_citizen: "Are you a citizen of the United States?",
  q_age: "Will you be 18 years old on or before election day?",
  yes: "Yes",
  no: "No",
  sec_eligibility: "Eligibility",
  sec_birthdate: "Birthdate",
  sec_name: "Name",
  sec_ident: "Identification",
  sec_residence: "Residence address",
  sec_mailing: "Mailing address",
  sec_party: "Party affiliation",
  sec_declaration: "Declaration",
  name_parts: ["Last", "First", "Middle", "Suffix"],
  declaration: "I declare that what I have written here is true.",
  sex: "Sex",
  signature: "Signature",
  date: "Date",
} as const;
export const FORM_COPY = DOC_COPY;
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

const SEX_TYPES: readonly string[] = ["sd_drivers_license", "other_state_drivers_license", "other_state_nondriver_id", "tribal_id", "us_passport"];

function fields(d: Document): Child[] {
  return [
    row(label("name"), d.name, true, "name"),
    row(label("birth_date"), d.birth_date === null ? null : formatPrinted(d.birth_date), false, "birth_date"),
    SEX_TYPES.includes(d.type) && d.sex !== null && d.sex !== undefined ? row(DOC_COPY.sex, d.sex, false) : null,
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

// Set by renderCard for the duration of one render: the date used for the pictured age when a
// document has no issue date.
let renderAsOf: ISODate | undefined;
const portraitBox = (d: Document): Child => {
  if (d.portrait_seed === null) return null;
  const when = d.issue_date ?? renderAsOf;
  const traits = when === undefined ? undefined : documentTraits(d, when);
  return h("div", { class: "doc-portrait" }, drawPortrait(d.portrait_seed, label("portrait_label"), true, traits));
};
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
        h("div", { class: "doc-head" }, stateEmblem("SD"), titleSpan(title)),
        body(d),
        foil(),
        sheen(),
      );
    case "other_state_drivers_license":
      return face(
        h("div", { class: "decor mark" }, rosetteSvg(stateStyle(state).lobes)),
        h("div", { class: "doc-head" }, h("span", { class: "doc-state" }, stateEmblem(state), state), titleSpan(title)),
        body(d),
        sheen(),
      );
    case "other_state_nondriver_id":
      return face(
        h("div", { class: "side-band", "aria-hidden": "true" }, h("span", { class: "side-code" }, state), stateEmblem(state)),
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
    case "us_passport":
      // Only a photocopy shows the bare data page; a real passport is a book (see passportBook).
      return face(...passportPage(d, title));
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

// The data page of a passport: header, portrait and fields, machine-readable strip.
function passportPage(d: Document, title: string): Child[] {
  const [m1, m2] = mrzLines(d);
  return [
    h("div", { class: "doc-head" }, starRing(), titleSpan(title), h("span", { class: "pp-type" }, label("passport_type"), h("br"), label("passport_code"))),
    waveBand(226, 10, 4, "wave-band pp-band"),
    body(d),
    h("div", { class: "mrz", "aria-hidden": "true" }, h("div", {}, m1), h("div", {}, m2)),
    sheen(),
  ];
}

// Closed cover: dark navy, gold-foil style generic lettering and a plain star device.
function passportCover(): HTMLElement {
  return h(
    "div",
    { class: "face front pp-cover" },
    h("span", { class: "cover-country" }, DOC_COPY.cover_country),
    coverDevice(),
    h("span", { class: "cover-title" }, DOC_COPY.cover_title),
    h("span", { class: "cover-chip", "aria-hidden": "true" }),
    sheen(),
  );
}

// Open book: a blank visa page on the left, the data page on the right.
function passportBook(d: Document, title: string): HTMLElement {
  return h(
    "div",
    { class: "face back book" },
    h("div", { class: "pp-left", "aria-hidden": "true" }, h("span", { class: "pp-left-title" }, DOC_COPY.visa_page), h("span", { class: "pp-ruled" })),
    h("div", { class: "pp-data" }, ...passportPage(d, title)),
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
      stateOutlineMark("SD"),
    ),
    foil(),
    sheen(),
  );
}

function back(d: Document): HTMLElement {
  if (backKind(d) === "sd") return sdBack(d);
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

// A real passport opens like a book; a photocopy is a flat copy of the data page and does not.
export const isBook = (d: Document): boolean => isBookPassport(d);

export function flippable(d: Document): boolean {
  return FLIPPABLE_TYPES.includes(d.type) || isBook(d);
}

export function toggleFlip(card: HTMLElement): void {
  if (!card.classList.contains("flippable")) return;
  const flipped = card.classList.toggle("flipped");
  const btn = card.querySelector<HTMLButtonElement>("button.flip");
  btn?.setAttribute("aria-pressed", String(flipped));
  if (btn !== null && btn.dataset["openText"] !== undefined) {
    btn.textContent = flipped ? (btn.dataset["closeText"] ?? "") : btn.dataset["openText"];
    btn.setAttribute("aria-label", (flipped ? btn.dataset["closeLabel"] : btn.dataset["openLabel"]) ?? "");
  }
  card.dispatchEvent(new CustomEvent("cardflip", { bubbles: true }));
}

const PAPER_TYPES: readonly string[] = ["birth_certificate", "consular_report_of_birth_abroad", "certificate_of_naturalization"];

export function renderCard(d: Document, as_of?: ISODate): HTMLElement {
  renderAsOf = as_of;
  try {
    return renderCardInner(d);
  } finally {
    renderAsOf = undefined;
  }
}

function renderCardInner(d: Document): HTMLElement {
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
  if (isBook(d)) {
    renderBook(card, d, title);
    return card;
  }
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

// A closed passport is a cover; Enter, Space, a click (not a drag), F or the button opens it. Fields
// on the data page keep their data-field keys, so denial-source picking works once it is open.
function renderBook(card: HTMLElement, d: Document, title: string): void {
  card.classList.add("book-doc");
  card.append(
    passportCover(),
    passportBook(d, title),
    h("button", {
      class: "flip",
      type: "button",
      "aria-label": `${title}: ${DOC_COPY.open_label}`,
      "aria-pressed": "false",
      "data-open-text": DOC_COPY.open,
      "data-close-text": DOC_COPY.close,
      "data-open-label": `${title}: ${DOC_COPY.open_label}`,
      "data-close-label": `${title}: ${DOC_COPY.close_label}`,
      onclick: () => toggleFlip(card),
    }, DOC_COPY.open),
  );
  let down: [number, number] | null = null;
  card.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  card.addEventListener("click", (e) => {
    if (card.classList.contains("flipped") || card.classList.contains("src-target")) return;
    if ((e.target as HTMLElement).closest("button") !== null) return;
    if (down !== null && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    toggleFlip(card);
  });
  card.addEventListener("keydown", (e) => {
    if (e.target !== card || (e.key !== "Enter" && e.key !== " ") || card.classList.contains("src-target")) return;
    e.preventDefault();
    toggleFlip(card);
  });
}

const formHead = (title: string, no: string): HTMLElement =>
  h("div", { class: "doc-head" }, titleSpan(title), h("span", { class: "form-no" }, no));

// Voter registration application: a letter-size page (8.5 x 11) shown at reduced scale, numbered
// sections down the left with bold labels and light blue input boxes. Only the name and the declared
// birth date are real; every other box is a blank stand-in. The fields keep data-field keys so a
// denial source can be picked, and .form-impression (stamp) attaches to the card itself.
const vrSec = (n: number, name: string, ...inputs: Child[]): HTMLElement =>
  h(
    "div",
    { class: `vr-sec vr-s${n}` },
    h("div", { class: "vr-lab" }, h("span", { class: "vr-n" }, String(n)), h("span", { class: "vr-name" }, name)),
    h("div", { class: "vr-in" }, ...inputs),
  );
const vrBlank = (cls = ""): HTMLElement => h("div", { class: `vr-box ${cls}`.trim(), "aria-hidden": "true" }, h("span", { class: "vr-hint" }));
const vrCheck = (text: string): HTMLElement => h("span", { class: "vr-yn" }, h("span", { class: "vr-cb" }), text);
const vrQuestion = (q: string): HTMLElement =>
  h("div", { class: "vr-q", "aria-hidden": "true" }, h("span", { class: "vr-qt" }, q), vrCheck(FORM_COPY.yes), vrCheck(FORM_COPY.no));

export function renderForm(app: Application): HTMLElement {
  // Section 5 shows the residency declaration's address. Its fields keep the declaration's identity
  // (doc id and type), so choosing it as a denial source names the residency declaration.
  const res = app.residency_declaration;
  const addr = h("dl", { class: "fields vr-addr" }, row(label("address"), addressText(res), true, "address", true));
  const addrRow = addr.firstElementChild as HTMLElement | null;
  if (addrRow !== null) {
    addrRow.dataset["srcDocId"] = res.doc_id;
    addrRow.dataset["srcType"] = "residency_declaration";
  }
  const title = label("form_title");
  const card = shell("application_form", title, "", app.application_id);
  card.append(
    h(
      "div",
      { class: "face front vr-page" },
      h("div", { class: "doc-head" }, titleSpan(title)),
      h("p", { class: "doc-instr" }, label("form_instruction")),
      h(
        "div",
        { class: "vr-secs" },
        vrSec(1, FORM_COPY.sec_eligibility, vrQuestion(FORM_COPY.q_citizen), vrQuestion(FORM_COPY.q_age)),
        vrSec(2, FORM_COPY.sec_birthdate, h("dl", { class: "fields" }, row(label("birth_date"), formatPrinted(app.declared_birth_date), true, "birth_date"))),
        vrSec(
          3,
          FORM_COPY.sec_name,
          h("dl", { class: "fields" }, row(label("name"), app.applicant_name, true, "name")),
          h("div", { class: "vr-parts", "aria-hidden": "true" }, ...FORM_COPY.name_parts.map((p) => h("span", {}, p))),
        ),
        vrSec(4, FORM_COPY.sec_ident, vrBlank("half"), vrBlank("half")),
        vrSec(5, FORM_COPY.sec_residence, addr),
        vrSec(6, FORM_COPY.sec_mailing, vrBlank("tall")),
        vrSec(7, FORM_COPY.sec_party, vrBlank()),
        vrSec(
          8,
          FORM_COPY.sec_declaration,
          h("div", { class: "vr-decl", "aria-hidden": "true" }, FORM_COPY.declaration),
          h("div", { class: "vr-sign", "aria-hidden": "true" }, h("span", { class: "vr-sig" }, FORM_COPY.signature), h("span", { class: "vr-dt" }, FORM_COPY.date)),
        ),
      ),
      h(
        "div",
        { class: "office", "aria-hidden": "true" },
        h("span", { class: "office-title" }, label("office_use")),
        h("span", { class: "office-cell" }, label("office_received")),
        h("span", { class: "office-cell" }, label("office_initials")),
        h("span", { class: "form-no" }, label("form_number_vr")),
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

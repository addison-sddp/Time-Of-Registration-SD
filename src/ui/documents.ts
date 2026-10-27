import { narrative } from "../data";
import type { Application, Document } from "../engine/types";
import { FLIPPABLE_TYPES, finePrintFor, sdBackRows } from "../game/fineprint";
import { formatPrinted } from "../game/format";
import { r3Citizenship } from "../rules";
import { h, s, type Child } from "./dom";
import { drawPortrait } from "./portrait";

// Original card designs, one look per DocumentType. They show printed fields only.

const tribes = (r3Citizenship.params as { participating_tribes: { key: string; name: string }[] }).participating_tribes;
const tribeName = (key: string): string => tribes.find((t) => t.key === key)?.name ?? key;

const D = narrative.docs;
const label = (k: string): string => D[k] ?? k;

function row(name: string, value: string | null): Child {
  if (value === null || value === "") return null;
  return h("div", { class: "field" }, h("dt", {}, name), h("dd", {}, value));
}

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
    row(label("name"), d.name),
    row(label("birth_date"), d.birth_date === null ? null : formatPrinted(d.birth_date)),
    row(label("address"), addressText(d)),
    row(label("issued"), d.issue_date === null ? null : formatPrinted(d.issue_date)),
    row(label("expires"), d.expiry_date === null ? null : formatPrinted(d.expiry_date)),
    row(d.type === "tribal_id" ? label("tribe") : label("issued_by"), issuer(d)),
  ];
}

function shell(type: string, title: string, extra: string): HTMLElement {
  return h("div", {
    class: `item doc ${extra}`.trim(),
    "data-type": type,
    tabindex: 0,
    role: "group",
    "aria-roledescription": narrative.desk["movable"],
    "aria-label": title,
  });
}

function front(d: Document, title: string): HTMLElement {
  const head = h("div", { class: "doc-head" }, h("span", { class: "doc-title" }, title));
  if (d.type === "other_state_drivers_license" || d.type === "other_state_nondriver_id") {
    head.append(h("span", { class: "doc-state" }, d.issuing_jurisdiction ?? ""));
  }
  const body = h("div", { class: "doc-body" });
  if (d.portrait_seed !== null) {
    body.append(h("div", { class: "doc-portrait" }, drawPortrait(d.portrait_seed, label("portrait_label"))));
  }
  body.append(h("dl", { class: "fields" }, ...fields(d)));
  return h("div", { class: "face front" }, head, body);
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
    h("div", { class: "micro" }, rows.digits),
    h("div", { class: "stripe sd-stripe", "aria-hidden": "true" }),
    h("div", { class: "sd-middle" }, ...rows.middle.map((r) => h("div", { class: "fp" }, r))),
    h("div", { class: "sd-bottom-left" }, ...rows.bottom.map((r) => h("div", { class: "fp" }, r))),
    h(
      "div",
      { class: "sd-bottom-right" },
      rows.birth_date === null ? null : h("div", { class: "fp" }, rows.birth_date),
      stateOutline(),
    ),
  );
}

function back(d: Document): HTMLElement {
  if (d.type === "sd_drivers_license") return sdBack(d);
  const fine = finePrintFor(d);
  return h(
    "div",
    { class: "face back" },
    h("div", { class: "stripe", "aria-hidden": "true" }),
    h(
      "div",
      { class: "back-meta" },
      h("span", {}, `${label("restrictions")}: ${label("restrictions_none")}`),
      h("span", {}, `${label("class")}: ${label("class_value")}`),
    ),
    fine === null ? null : h("span", { class: `fineprint ${fine.spot}` }, label("fine_print_citizen")),
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
}

export function renderCard(d: Document): HTMLElement {
  const title = narrative.doc_types[d.type] ?? d.type;
  const card = shell(d.type, title, `${d.is_photocopy ? "copy" : ""} ${flippable(d) ? "flippable" : ""}`);
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
  return card;
}

export function renderForm(app: Application): HTMLElement {
  const title = label("form_title");
  const card = shell("application_form", title, "");
  card.append(
    h(
      "div",
      { class: "face front" },
      h("div", { class: "doc-head" }, h("span", { class: "doc-title" }, title)),
      h(
        "div",
        { class: "doc-body" },
        h("dl", { class: "fields" }, row(label("name"), app.applicant_name), row(label("birth_date"), formatPrinted(app.declared_birth_date))),
      ),
    ),
  );
  return card;
}

export function renderResidency(d: Document): HTMLElement {
  const title = narrative.doc_types["residency_declaration"] ?? "";
  const card = shell("residency_declaration", title, d.is_photocopy ? "copy" : "");
  card.append(
    h(
      "div",
      { class: "face front" },
      h("div", { class: "doc-head" }, h("span", { class: "doc-title" }, title)),
      h("div", { class: "doc-body" }, h("dl", { class: "fields" }, row(label("name"), d.name), row(label("address"), addressText(d)))),
    ),
  );
  return card;
}

import type { ElectionEntry } from "../engine/types";
import { bornBeforeDate, fill, formatDate } from "../game/format";
import { narrative } from "../data";
import { h, s } from "./dom";

// Booth wall signs right of the glass: the "Next Election" clock-style readout and the birth-date
// cutoff sign. Both read the calendar entry that the rule engine uses; nothing is hardcoded.

const N = narrative.desk;
const T = (k: string): string => N[k] ?? "";

// Seven-segment glyphs drawn as polygons in a 20 x 36 box (CSS colours; no font).
const SEG: Record<string, string> = {
  a: "4,0 16,0 14,3 6,3",
  b: "17,4 20,2 20,16 18.5,17.5 17,16",
  c: "17,20 18.5,18.5 20,20 20,34 17,32",
  d: "4,36 16,36 14,33 6,33",
  e: "0,20 1.5,18.5 3,20 3,32 0,34",
  f: "0,2 3,4 3,16 1.5,17.5 0,16",
  g: "4,18 5.5,16.5 14.5,16.5 16,18 14.5,19.5 5.5,19.5",
};
const LIT: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
  "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg", "-": "g",
};
const DIGIT_W = 20;
const GAP = 6;
const GROUP_GAP = 16;

// Pure: the SVG width needed for a readout such as "06 02 2026".
export function readoutWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === " " ? GROUP_GAP : DIGIT_W + GAP;
  return Math.max(0, w - GAP);
}

// One dim "8" ghost behind every lit digit, like an unlit segment display.
export function sevenSegment(text: string): SVGElement {
  const width = readoutWidth(text);
  const svg = s("svg", {
    viewBox: `0 0 ${width} 36`, width, height: 36, class: "sevenseg",
    "aria-hidden": "true", focusable: "false", "shape-rendering": "crispEdges",
  });
  let x = 0;
  for (const ch of text) {
    if (ch === " ") {
      x += GROUP_GAP;
      continue;
    }
    const g = s("g", { transform: `translate(${x} 0)` });
    const on = LIT[ch] ?? "";
    for (const k of Object.keys(SEG)) g.append(s("polygon", { points: SEG[k] ?? "", class: on.includes(k) ? "seg on" : "seg off" }));
    svg.append(g);
    x += DIGIT_W + GAP;
  }
  return svg;
}

// "2026-06-02" -> "06 02 2026"
export const readoutText = (d: string): string => `${d.slice(5, 7)} ${d.slice(8, 10)} ${d.slice(0, 4)}`;

export interface BoothSigns {
  election: HTMLElement;
  bornBefore: HTMLElement;
}

export function buildSigns(entry: ElectionEntry | null, noElectionText: string): BoothSigns {
  const election = h("div", {
    class: "sign sign-election", role: "group", "aria-label": T("election_display"),
  },
  h("div", { class: "sign-title", "aria-hidden": "true" }, T("born_before_heading")),
  h("div", { class: "sign-clock", "aria-hidden": "true" }, sevenSegment(entry === null ? "-- -- ----" : readoutText(entry.election_date))),
  h("p", { class: "sr-only" }, entry === null
    ? noElectionText
    : `${fill(T("next_election"), { label: entry.label, date: formatDate(entry.election_date) })} ${fill(T("registration_closes"), { date: formatDate(entry.registration_deadline) })}`));

  const date = entry === null ? null : bornBeforeDate(entry.election_date);
  const bornBefore = h("div", {
    class: "sign sign-born", role: "group", "aria-label": T("born_before_display"),
  },
  h("p", { class: "sign-born-line", "aria-hidden": "true" }, T("born_before")),
  h("p", { class: "sign-born-date", "aria-hidden": "true" }, date === null ? "-" : formatDate(date)),
  h("p", { class: "sr-only" }, date === null ? noElectionText : fill(T("born_before_sr"), { date: formatDate(date) })));
  return { election, bornBefore };
}

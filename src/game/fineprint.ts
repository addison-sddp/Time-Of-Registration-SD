import { narrative } from "../data";
import type { Document } from "../engine/types";
import { createRng, hashSeed } from "../gen/rng";
import { r3Citizenship } from "../rules";
import { formatPrinted } from "./format";

interface R3View {
  sd_license_min_issue_date: string;
}

const sdMinDefault = (): string => (r3Citizenship.params as R3View).sd_license_min_issue_date;

// Types that have a back side the player can flip to.
export const FLIPPABLE_TYPES: readonly string[] = [
  "sd_drivers_license",
  "other_state_drivers_license",
  "other_state_nondriver_id",
  "tribal_id",
];

// The only citizenship marking in the game is the fine print "U.S. Citizen" on the BACK of a
// card, never on a front and never on any other type. Printed fields only; the rule engine
// still decides every verdict.
//   SD license: iff the marker is true and the issue date is on or after the R3 threshold
//     (one row of the bottom-left block of the back).
//   Other-state license or ID: iff citizenship_verified_marker is true (top left of the back).
export type FinePrintSpot = "back_bottom_left" | "back_top_left";

export interface FinePrint {
  spot: FinePrintSpot;
}

export function finePrintFor(d: Document, sdMinIssueDate: string = sdMinDefault()): FinePrint | null {
  if (d.type === "sd_drivers_license") {
    const newCard = d.issue_date !== null && d.issue_date >= sdMinIssueDate;
    return newCard && d.citizenship_verified_marker === true ? { spot: "back_bottom_left" } : null;
  }
  if (d.type === "other_state_drivers_license" || d.type === "other_state_nondriver_id") {
    return d.citizenship_verified_marker === true ? { spot: "back_top_left" } : null;
  }
  return null;
}

// A string of digits for the tiny box on an SD back, derived from the document id.
export function backDigits(doc_id: string): string {
  const rng = createRng(hashSeed("back-digits", doc_id));
  return Array.from({ length: 20 }, () => String(rng.int(0, 9))).join("");
}

export interface SdBack {
  digits: string;
  middle: string[]; // class, endorsements, restrictions
  bottom: string[]; // revision, [U.S. Citizen], renewal line
  birth_date: string | null; // printed format, from this document's birth_date
}

// The rows printed on the back of an SD license.
export function sdBackRows(d: Document, sdMinIssueDate: string = sdMinDefault()): SdBack {
  const D = narrative.docs;
  const newCard = d.issue_date !== null && d.issue_date >= sdMinIssueDate;
  const fine = finePrintFor(d, sdMinIssueDate) !== null;
  return {
    digits: backDigits(d.doc_id),
    middle: [D["sd_class"] ?? "", D["sd_endorsements"] ?? "", D["sd_restrictions"] ?? ""],
    bottom: [
      newCard ? (D["rev_new"] ?? "") : (D["rev_old"] ?? ""),
      ...(fine ? [D["fine_print_citizen"] ?? ""] : []),
      D["renewable"] ?? "",
    ],
    birth_date: d.birth_date === null ? null : formatPrinted(d.birth_date),
  };
}

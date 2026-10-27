import type { ISODate, Sex } from "../engine/types";
import { minusYears } from "../engine/dates";
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, MIDDLE_INITIALS } from "./content";
import { addDays, maxDate, minDate, randomDate } from "./dates";
import type { Rng } from "./rng";
import type { GenContext } from "./types";

export interface Person {
  first: string;
  middle: string | null; // initial only
  last: string;
}

export type ResidencySpec =
  | { kind: "sd" }
  | { kind: "other_state"; state: string }
  | { kind: "none" };

// The mutable plan perturbers edit before documents are rendered. It holds only the
// few facts a rule failure needs; everything else is drawn at render time.
export interface Spec {
  person: Person;
  sex: Sex; // printed on every document that carries a sex; drives the portrait
  portrait_seed: number;
  birth_date: ISODate; // the true date, written on every document unless overridden
  birth_mismatch: { target: "declared" | "id" | "citizenship"; date: ISODate } | null;
  residency: ResidencySpec;
  r3_condition: string | null; // null = the citizenship documents must satisfy R3
}

export const printName = (p: Person): string =>
  p.middle === null ? `${p.first} ${p.last}` : `${p.first} ${p.middle}. ${p.last}`;

export function drawPerson(rng: Rng, sex: Sex): Person {
  return {
    first: rng.pick(sex === "F" ? FIRST_NAMES_F : FIRST_NAMES_M),
    middle: rng.chance(0.55) ? rng.pick(MIDDLE_INITIALS) : null,
    last: rng.pick(LAST_NAMES),
  };
}

// A spec for an applicant who passes every rule. Perturbers then break chosen parts.
export function baseSpec(rng: Rng, ctx: GenContext): Spec {
  const sex: Sex = rng.chance(0.5) ? "F" : "M";
  const person = drawPerson(rng, sex);
  const portrait_seed = rng.int(0, 0x7fffffff);
  // Eligible: on or before the cutoff. Birth exactly on the cutoff is a deliberate edge case.
  const oldest = minusYears(ctx.election_date, 90);
  const birth_date = rng.chance(0.1)
    ? ctx.adult_cutoff
    : randomDate(rng, oldest, ctx.adult_cutoff);
  return {
    person,
    sex,
    portrait_seed,
    birth_date,
    birth_mismatch: null,
    residency: { kind: "sd" },
    r3_condition: null,
  };
}

// First eligible day (one past the cutoff) and a plausible youngest age.
export function ineligibleRange(ctx: GenContext): [ISODate, ISODate] {
  const lo = addDays(ctx.adult_cutoff, 1);
  const hi = maxDate(lo, minDate(minusYears(ctx.as_of, 15), addDays(ctx.adult_cutoff, 700)));
  return [lo, hi];
}

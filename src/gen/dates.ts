import { minusYears } from "../engine/dates";
import type { ISODate } from "../engine/types";
import type { Rng } from "./rng";

// Calendar arithmetic on integer day numbers (proleptic Gregorian, civil-date algorithm).
// No Date objects and no millisecond math. Feb 29 is never emitted: a day number that
// lands on it is nudged one day in the caller's direction of travel.

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(n: number): [number, number, number] {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n: number, width: number): string => String(n).padStart(width, "0");

export function toDays(d: ISODate): number {
  return daysFromCivil(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)));
}

function rawIso(n: number): ISODate {
  const [y, m, d] = civilFromDays(n);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function fromDays(n: number, dir: 1 | -1 = 1): ISODate {
  const iso = rawIso(n);
  return iso.endsWith("-02-29") ? rawIso(n + dir) : iso;
}

export const addDays = (d: ISODate, n: number): ISODate => fromDays(toDays(d) + n, n < 0 ? -1 : 1);

// Same month and day, n years later (clamped off Feb 29 by the engine helper).
export const addYears = (d: ISODate, n: number): ISODate => minusYears(d, -n);

export const maxDate = (a: ISODate, b: ISODate): ISODate => (a >= b ? a : b);
export const minDate = (a: ISODate, b: ISODate): ISODate => (a <= b ? a : b);

// Uniform pick from lo..hi inclusive.
export function randomDate(rng: Rng, lo: ISODate, hi: ISODate): ISODate {
  const a = toDays(lo);
  const b = toDays(hi);
  if (a > b) throw new Error(`date range invalid: ${lo}..${hi}`);
  const n = rng.int(a, b);
  return fromDays(n, n === b ? -1 : 1);
}

// A date near `base` that is guaranteed to differ from it.
export function differentDate(rng: Rng, base: ISODate): ISODate {
  const sign = rng.chance(0.5) ? 1 : -1;
  let step = rng.int(1, 400);
  for (;;) {
    const out = addDays(base, sign * step);
    if (out !== base) return out;
    step += 1;
  }
}

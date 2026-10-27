import type { ISODate, YearMonth } from "./types";

// Fixed-width ISO strings sort correctly as plain strings, so no Date objects are needed.
export const dateLte = (a: ISODate, b: ISODate): boolean => a <= b;
export const dateLt = (a: ISODate, b: ISODate): boolean => a < b;

export const monthOf = (d: ISODate): YearMonth => d.slice(0, 7);

// Feb 29 never occurs in game data; if it did, clamping keeps the result a valid date.
export function minusYears(d: ISODate, n: number): ISODate {
  const year = Number(d.slice(0, 4)) - n;
  const month = d.slice(5, 7);
  let day = d.slice(8, 10);
  if (month === "02" && day === "29") day = "28";
  return `${String(year).padStart(4, "0")}-${month}-${day}`;
}

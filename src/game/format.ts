import { minusYears } from "../engine/dates";
import type { ISODate } from "../engine/types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const parts = (d: ISODate): [number, number, number] => [
  Number(d.slice(0, 4)),
  Number(d.slice(5, 7)),
  Number(d.slice(8, 10)),
];

// "2026-06-02" -> "June 2, 2026"
export function formatDate(d: ISODate): string {
  const [y, m, day] = parts(d);
  return `${MONTHS[m - 1] ?? "?"} ${day}, ${y}`;
}

// "2026-06-02" -> "June 2026" (the shift display, DESIGN 2.1)
export function monthYear(d: ISODate): string {
  const [y, m] = parts(d);
  return `${MONTHS[m - 1] ?? "?"} ${y}`;
}

// "2026-06-02" -> "06/02/2026" (printed on documents)
export function formatPrinted(d: ISODate): string {
  return `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
}

export const formatMoney = (n: number): string => `$${n}`;

// Replaces {name} placeholders. A placeholder with no value is left as written.
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined ? whole : String(v);
  });
}

// Shape and calendar check without Date objects.
export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = parts(d);
  if (m < 1 || m > 12 || day < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
  return day <= days;
}

const daysIn = (y: number, m: number): number => {
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 31;
};
const pad = (n: number, w: number): string => String(n).padStart(w, "0");

// The day after a date, with month and year rollover.
export function nextDay(d: ISODate): ISODate {
  let [y, m, day] = parts(d);
  day += 1;
  if (day > daysIn(y, m)) {
    day = 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(day, 2)}`;
}

// The date shown on the desk sign "Registrants must be born before". Rule 1 passes on or before the
// cutoff (election date minus 18 years, same month and day, using the engine's own minusYears), so
// the exclusive "before" date is the cutoff plus one day.
export function bornBeforeDate(election_date: ISODate, min_age_years = 18): ISODate {
  return nextDay(minusYears(election_date, min_age_years));
}

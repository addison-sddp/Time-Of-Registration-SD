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

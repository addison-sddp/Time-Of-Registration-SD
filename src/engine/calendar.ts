import type { ElectionEntry, ISODate } from "./types";

export type LookupResult =
  | { ok: true; entry: ElectionEntry }
  | { ok: false; code: "NO_ELECTION_CONFIGURED" | "OVERLAPPING_CALENDAR_ENTRIES" };

const covers = (e: ElectionEntry, d: ISODate): boolean =>
  (e.from === null || e.from <= d) && (e.to === null || d < e.to);

export function lookupElection(calendar: readonly ElectionEntry[], as_of: ISODate): LookupResult {
  const hits = calendar.filter((e) => covers(e, as_of));
  const first = hits[0];
  if (first === undefined) return { ok: false, code: "NO_ELECTION_CONFIGURED" };
  if (hits.length > 1) return { ok: false, code: "OVERLAPPING_CALENDAR_ENTRIES" };
  return { ok: true, entry: first };
}

import { lookupElection } from "../engine/calendar";
import { monthOf, minusYears } from "../engine/dates";
import type { Activation, AnyRule, ElectionEntry, ISODate } from "../engine/types";
import { calendar as shippedCalendar } from "../data";
import { r1Age, r3Citizenship, rules as shippedRules } from "../rules";
import type { GenContext } from "./types";

export interface GenOptions {
  as_of?: ISODate; // defaults to the shift date
  calendar?: readonly ElectionEntry[];
  rules?: readonly AnyRule[];
  // calendar (default): a rule is active iff introduced_month <= month(as_of).
  // sandbox: exactly the listed rule ids are active (an explicit active-rule list).
  activation?: Activation;
}

// Rule params are untyped outside their rule file; these are the only fields read here.
interface R1View {
  min_age_years: number;
}
interface R3View {
  sd_license_min_issue_date: string;
  participating_tribes: { key: string }[];
}

// The ids of the rules the engine would evaluate. Mirrors the engine's own activation test.
export function activeRuleIds(
  rules: readonly AnyRule[],
  as_of: ISODate,
  activation: Activation,
): string[] {
  return rules
    .filter((r) =>
      activation.mode === "sandbox"
        ? activation.rule_ids.includes(r.id)
        : r.introduced_month <= monthOf(as_of),
    )
    .map((r) => r.id)
    .sort();
}

// Throws if the calendar has no single entry for as_of: that is a data error, which the
// data tests catch for every shipped shift.
export function createContext(shift_date: ISODate, opts: GenOptions = {}): GenContext {
  const as_of = opts.as_of ?? shift_date;
  const found = lookupElection(opts.calendar ?? shippedCalendar, as_of);
  if (!found.ok) throw new Error(`${found.code} for ${as_of}`);
  const r1 = r1Age.params as R1View;
  const r3 = r3Citizenship.params as R3View;
  const election_date = found.entry.election_date;
  return {
    as_of,
    election_date,
    adult_cutoff: minusYears(election_date, r1.min_age_years),
    active_rule_ids: activeRuleIds(opts.rules ?? shippedRules, as_of, opts.activation ?? { mode: "calendar" }),
    tribe_keys: r3.participating_tribes.map((t) => t.key),
    sd_license_min_issue_date: r3.sd_license_min_issue_date,
    sd_new_ok: as_of >= r3.sd_license_min_issue_date,
  };
}

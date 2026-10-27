import type { ElectionEntry, ISODate } from "../engine/types";
import type { GeneratedApplicant } from "../gen/types";
import calendarJson from "./calendar.json";
import economyJson from "./economy.json";
import narrativeJson from "./narrative.json";
import shiftsJson from "./shifts.json";

export interface Shift {
  shift_id: string;
  shift_date: ISODate;
  // Hand-written applicants (DESIGN 2.4, 4.2). Counted in the shift total by generateShift.
  scripted_applicants?: readonly GeneratedApplicant[];
}

export interface Economy {
  income_per_correct_decision: number;
  penalty_per_error: number;
  error_limit_per_shift: number;
  starting_balance: number;
  minimum_balance: number;
  restart_restores_shift_start_balance: boolean;
}

export interface BriefingLine {
  text: string;
  level: 0 | 1;
}

// All non-error copy (DESIGN B8). Rule error_message text stays in the rule entries.
export interface Narrative {
  title: Record<string, string>;
  settings: Record<string, string>;
  sandbox: Record<string, string>;
  briefing: {
    header: string;
    subject: string;
    date_line: string;
    intro: string;
    no_rules: string;
    closing: string;
    tribes_heading: string;
    rules: Record<string, { heading: string; lines: BriefingLine[] }>;
  };
  desk: Record<string, string>;
  ledger: Record<string, string>;
  flow: Record<string, string>;
  denial: Record<string, string>;
  reasons: Record<string, string>;
  fields: Record<string, string>;
  bin: Record<string, string>;
  notes: Record<string, string>;
  summary: Record<string, string>;
  doc_types: Record<string, string>;
  docs: Record<string, string>;
  // A null value is a line the owner has not written yet; the UI shows a placeholder.
  dialogue: Record<string, string | null>;
  booth: Record<string, string>;
}

export const calendar: readonly ElectionEntry[] = calendarJson;
// The JSON widens string literals, so the typed view is asserted here and checked by tests.
export const shifts: readonly Shift[] = shiftsJson as unknown as readonly Shift[];
export const economy: Economy = economyJson;
export const narrative: Narrative = narrativeJson as unknown as Narrative;

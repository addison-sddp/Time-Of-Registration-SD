import type { ElectionEntry, ISODate } from "../engine/types";
import calendarJson from "./calendar.json";
import economyJson from "./economy.json";
import shiftsJson from "./shifts.json";

export interface Shift {
  shift_id: string;
  shift_date: ISODate;
}

export interface Economy {
  income_per_correct_decision: number;
  penalty_per_error: number;
  error_limit_per_shift: number;
  starting_balance: number;
  minimum_balance: number;
  restart_restores_shift_start_balance: boolean;
}

export const calendar: readonly ElectionEntry[] = calendarJson;
export const shifts: readonly Shift[] = shiftsJson;
export const economy: Economy = economyJson;

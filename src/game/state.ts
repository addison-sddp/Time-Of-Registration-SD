import { lookupElection } from "../engine/calendar";
import { evaluate } from "../engine/evaluate";
import type { Activation, ISODate } from "../engine/types";
import { calendar, economy, narrative, shifts, type Shift } from "../data";
import { activeRuleIds, generateShift, orderShift, type GeneratedApplicant } from "../gen";
import { rules } from "../rules";
import type { Decision, DecisionLogEntry, SaveV1 } from "../save/schema";
import { fill, isValidDate } from "./format";

// The shift state machine (DESIGN 2.3 to 2.7, 6). Pure: every function returns a new state.
// Verdicts come only from the engine's evaluate on the finished Application; the generator's
// intent is never read here.

export type Mode = "calendar" | "sandbox";

export interface ShiftSummary {
  processed: number;
  correct: number;
  errors: number;
  earnings: number;
}

export interface GameState {
  mode: Mode;
  activation: Activation;
  save_salt: string;
  shift: Shift;
  as_of: ISODate;
  attempt_number: number;
  content: GeneratedApplicant[]; // canonical order, identical on every attempt
  applicants: GeneratedApplicant[]; // order for this attempt
  index: number; // applicant at the counter; equals applicants.length when none remain
  correct: number;
  errors: number;
  balance: number;
  balance_at_shift_start: number;
  ledger: string[];
  note: string | null; // latest procedural note
  restart_notice: string | null; // set when an attempt just ended on the error limit
  status: "in_progress" | "complete";
  summary: ShiftSummary | null;
  completed_shift_ids: string[];
  decision_log: DecisionLogEntry[]; // calendar mode only
}

export type StartResult = { ok: true; state: GameState } | { ok: false; message: string };

interface BeginArgs {
  mode: Mode;
  activation: Activation;
  save_salt: string;
  shift: Shift;
  as_of: ISODate;
  attempt_number: number;
  balance: number;
  completed_shift_ids: string[];
  decision_log: DecisionLogEntry[];
}

const clampBalance = (n: number): number => Math.max(economy.minimum_balance, n);

function begin(a: BeginArgs): StartResult {
  if (!isValidDate(a.as_of)) return { ok: false, message: narrative.sandbox["invalid_date"] ?? "" };
  if (!lookupElection(calendar, a.as_of).ok) return { ok: false, message: narrative.notes["no_election"] ?? "" };
  const content = generateShift(a.save_salt, a.shift, { as_of: a.as_of, activation: a.activation });
  return {
    ok: true,
    state: {
      mode: a.mode,
      activation: a.activation,
      save_salt: a.save_salt,
      shift: a.shift,
      as_of: a.as_of,
      attempt_number: a.attempt_number,
      content,
      applicants: orderShift(content, a.save_salt, a.shift.shift_id, a.attempt_number),
      index: 0,
      correct: 0,
      errors: 0,
      balance: a.balance,
      balance_at_shift_start: a.balance,
      ledger: [],
      note: null,
      restart_notice: null,
      status: "in_progress",
      summary: null,
      completed_shift_ids: a.completed_shift_ids,
      decision_log: a.decision_log,
    },
  };
}

// The shift the save points at, played in calendar mode. Mid-shift progress is not stored
// (DESIGN 6.4), so a reload replays the same attempt from the shift-start balance.
export function startCalendarShift(save: SaveV1): StartResult {
  const shift = shifts.find((s) => s.shift_id === save.progress.current_shift_id) ?? shifts[0];
  if (shift === undefined) return { ok: false, message: "" };
  return begin({
    mode: "calendar",
    activation: { mode: "calendar" },
    save_salt: save.save_salt,
    shift,
    as_of: shift.shift_date,
    attempt_number: save.progress.attempt_number,
    balance: save.economy.balance_at_shift_start,
    completed_shift_ids: [...save.progress.completed_shift_ids],
    decision_log: [...save.decision_log],
  });
}

export interface SandboxOptions {
  save_salt: string;
  shift_id: string;
  as_of: ISODate;
  rule_ids: string[];
  attempt_number: number;
}

// Sandbox: the listed rules are active whatever their introduced_month. Its state carries no
// progress, and saveFromState ignores it.
export function startSandboxShift(o: SandboxOptions): StartResult {
  const shift = shifts.find((s) => s.shift_id === o.shift_id);
  if (shift === undefined) return { ok: false, message: "" };
  const known = new Set(rules.map((r) => r.id));
  const attempt = Number.isInteger(o.attempt_number) && o.attempt_number >= 1 ? o.attempt_number : 1;
  return begin({
    mode: "sandbox",
    activation: { mode: "sandbox", rule_ids: o.rule_ids.filter((id) => known.has(id)) },
    save_salt: o.save_salt,
    shift,
    as_of: o.as_of,
    attempt_number: attempt,
    balance: economy.starting_balance,
    completed_shift_ids: [],
    decision_log: [],
  });
}

export const currentApplicant = (s: GameState): GeneratedApplicant | null =>
  s.status === "in_progress" ? (s.applicants[s.index] ?? null) : null;

export const activeRules = (s: GameState): string[] => activeRuleIds(rules, s.as_of, s.activation);

export const isFinalShift = (shift_id: string): boolean => shifts[shifts.length - 1]?.shift_id === shift_id;

function nextShiftId(shift_id: string): string {
  const i = shifts.findIndex((s) => s.shift_id === shift_id);
  return shifts[i + 1]?.shift_id ?? shift_id;
}

const ruleList = (ids: readonly string[]): string => ids.map((id) => `Rule ${id}`).join(", ");

// Three errors: the attempt ends, the shift-start balance returns, and the same applicants
// come back in the order seeded by the next attempt number.
function restart(s: GameState): GameState {
  const attempt = s.attempt_number + 1;
  return {
    ...s,
    attempt_number: attempt,
    applicants: orderShift(s.content, s.save_salt, s.shift.shift_id, attempt),
    index: 0,
    correct: 0,
    errors: 0,
    balance: economy.restart_restores_shift_start_balance ? s.balance_at_shift_start : s.balance,
    ledger: [],
    note: null,
    restart_notice: fill(narrative.summary["not_completed"] ?? "", { errors: s.errors }),
  };
}

export function acknowledgeNotice(s: GameState): GameState {
  return s.restart_notice === null ? s : { ...s, restart_notice: null };
}

export function decide(s: GameState, decision: Decision): GameState {
  if (s.status !== "in_progress" || s.restart_notice !== null) return s;
  const applicant = s.applicants[s.index];
  if (applicant === undefined) return s;

  const result = evaluate(applicant.application, s.as_of, calendar, rules, s.activation);
  if (!result.ok) {
    // Not a player error: nothing is counted and the applicant stays at the counter.
    const key = result.error.code === "NO_ELECTION_CONFIGURED" ? "no_election" : "evaluation_failed";
    return { ...s, note: narrative.notes[key] ?? null };
  }
  const verdict = result.value;
  const n = s.index + 1;
  const wasCorrect = decision === verdict.verdict;
  const word = decision === "approve" ? "approved" : "denied";

  let next: GameState = {
    ...s,
    index: s.index + 1,
    ledger: [
      ...s.ledger,
      fill(narrative.ledger[decision === "approve" ? "line_approved" : "line_denied"] ?? "", { n }),
    ],
    decision_log:
      s.mode === "calendar"
        ? [
            ...s.decision_log,
            {
              shift_id: s.shift.shift_id,
              application_id: applicant.application.application_id,
              as_of: s.as_of,
              player_decision: decision,
              engine_verdict: verdict.verdict,
              violated_rule_ids: [...verdict.violated_rule_ids],
              attempt_number: s.attempt_number,
            },
          ]
        : s.decision_log,
  };

  if (wasCorrect) {
    next = {
      ...next,
      correct: s.correct + 1,
      balance: next.balance + economy.income_per_correct_decision,
      note: null,
    };
  } else {
    const template =
      decision === "approve" ? narrative.notes["error_approved"] : narrative.notes["error_denied"];
    next = {
      ...next,
      errors: s.errors + 1,
      balance: clampBalance(next.balance - economy.penalty_per_error),
      note: fill(template ?? "", { n, rules: ruleList(verdict.violated_rule_ids), word }),
    };
    if (next.errors >= economy.error_limit_per_shift) return restart(next);
  }

  if (next.index >= next.applicants.length) {
    const completed =
      s.mode === "calendar" && !next.completed_shift_ids.includes(s.shift.shift_id)
        ? [...next.completed_shift_ids, s.shift.shift_id]
        : next.completed_shift_ids;
    return {
      ...next,
      status: "complete",
      completed_shift_ids: completed,
      summary: {
        processed: next.index,
        correct: next.correct,
        errors: next.errors,
        earnings: next.balance - next.balance_at_shift_start,
      },
    };
  }
  return next;
}

// The save after this state. Sandbox sessions write no progress, economy or decision_log, so
// the save comes back unchanged. Mid-shift the balance stored is the shift-start balance.
export function saveFromState(save: SaveV1, s: GameState): SaveV1 {
  if (s.mode === "sandbox") return save;
  const done = s.status === "complete";
  const balance = done ? s.balance : s.balance_at_shift_start;
  return {
    ...save,
    progress: {
      current_shift_id: done ? nextShiftId(s.shift.shift_id) : s.shift.shift_id,
      completed_shift_ids: [...s.completed_shift_ids],
      attempt_number: done ? 1 : s.attempt_number,
    },
    economy: { balance, balance_at_shift_start: balance },
    decision_log: [...s.decision_log],
  };
}

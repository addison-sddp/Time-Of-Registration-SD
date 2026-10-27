import { lookupElection } from "../engine/calendar";
import { evaluate } from "../engine/evaluate";
import type { Activation, ISODate } from "../engine/types";
import { calendar, economy, narrative, shifts, type Shift } from "../data";
import { activeRuleIds, generateShift, orderShift, type GeneratedApplicant } from "../gen";
import { rules } from "../rules";
import type { Decision, DecisionLogEntry, SaveV1 } from "../save/schema";
import { fill, isValidDate } from "./format";
import { findReason, reasonCatalog, reasonConfirmed, type DocSource } from "./reasons";

// The shift state machine (DESIGN 2.3 to 2.7, 6; build-4 flow). Pure: every function returns a
// new state, or the same state when the action does not apply. Verdicts come only from the
// engine's evaluate on the finished Application; the generator's intent is never read here.
//
// Per applicant: callNext, then either stampApprove, or startDenial + chooseReason
// (+ chooseSource) + stampDenied, then fileForm. A stamp is pending until the form is filed;
// scoring happens at filing.

export type Mode = "calendar" | "sandbox";

export interface ShiftSummary {
  processed: number;
  correct: number;
  errors: number;
  reasons_not_confirmed: number;
  earnings: number;
}

// The denial checklist while it is open.
export interface DenialDraft {
  step: "reasons" | "source" | "ready";
  reason_id: string | null;
  source: DocSource | null;
}

// A stamped form that has not been filed yet.
export interface PendingStamp {
  decision: Decision;
  reason_id: string | null;
  source: DocSource | null;
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
  bulletin_delivered: boolean; // the briefing letter is on the desk
  present: boolean; // the applicant at `index` has walked in and is not yet filed
  draft: DenialDraft | null;
  pending: PendingStamp | null;
  unconfirmed: number; // correct denials this attempt whose reason or source was not confirmed
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
      bulletin_delivered: false,
      present: false,
      draft: null,
      pending: null,
      unconfirmed: 0,
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
// come back in the order seeded by the next attempt number. The bulletin stays on the desk.
function restart(s: GameState): GameState {
  const attempt = s.attempt_number + 1;
  return {
    ...s,
    attempt_number: attempt,
    applicants: orderShift(s.content, s.save_salt, s.shift.shift_id, attempt),
    index: 0,
    present: false,
    draft: null,
    pending: null,
    unconfirmed: 0,
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

// ---- Opening the shift and calling applicants ------------------------------------------------

export function deliverBulletin(s: GameState): GameState {
  return s.bulletin_delivered ? s : { ...s, bulletin_delivered: true };
}

export const canCallNext = (s: GameState): boolean =>
  s.status === "in_progress" &&
  s.restart_notice === null &&
  s.bulletin_delivered &&
  !s.present &&
  s.index < s.applicants.length;

export function callNext(s: GameState): GameState {
  return canCallNext(s) ? { ...s, present: true } : s;
}

// ---- Stamping --------------------------------------------------------------------------------

const canStamp = (s: GameState): boolean =>
  s.status === "in_progress" && s.restart_notice === null && s.present && s.pending === null;

export function stampApprove(s: GameState): GameState {
  if (!canStamp(s) || s.draft !== null) return s;
  return { ...s, pending: { decision: "approve", reason_id: null, source: null } };
}

export function startDenial(s: GameState): GameState {
  if (!canStamp(s) || s.draft !== null) return s;
  return { ...s, draft: { step: "reasons", reason_id: null, source: null } };
}

export function chooseReason(s: GameState, reason_id: string): GameState {
  if (s.draft === null || s.draft.step !== "reasons") return s;
  const listed = reasonCatalog(activeRules(s)).some((g) => g.reasons.some((r) => r.id === reason_id));
  const reason = listed ? findReason(reason_id) : null;
  if (reason === null) return s;
  return { ...s, draft: { step: reason.needs_source ? "source" : "ready", reason_id, source: null } };
}

// Picking an item is allowed while a source is wanted, including to change an earlier pick.
export function chooseSource(s: GameState, source: DocSource): GameState {
  const d = s.draft;
  if (d === null || d.step === "reasons" || d.reason_id === null) return s;
  if (findReason(d.reason_id)?.needs_source !== true) return s;
  return { ...s, draft: { step: "ready", reason_id: d.reason_id, source } };
}

export function backToReasons(s: GameState): GameState {
  if (s.draft === null || s.draft.step === "reasons") return s;
  return { ...s, draft: { step: "reasons", reason_id: null, source: null } };
}

export function cancelDenial(s: GameState): GameState {
  return s.draft === null ? s : { ...s, draft: null };
}

export function stampDenied(s: GameState): GameState {
  const d = s.draft;
  if (!canStamp(s) || d === null || d.step !== "ready") return s;
  return { ...s, draft: null, pending: { decision: "deny", reason_id: d.reason_id, source: d.source } };
}

// ---- Filing and scoring ----------------------------------------------------------------------

export function fileForm(s: GameState): GameState {
  if (s.status !== "in_progress" || s.restart_notice !== null || !s.present || s.pending === null) return s;
  const applicant = s.applicants[s.index];
  if (applicant === undefined) return s;

  const result = evaluate(applicant.application, s.as_of, calendar, rules, s.activation);
  if (!result.ok) {
    // Not a player error: nothing is counted and the applicant stays at the booth.
    const key = result.error.code === "NO_ELECTION_CONFIGURED" ? "no_election" : "evaluation_failed";
    return { ...s, note: narrative.notes[key] ?? null };
  }
  const verdict = result.value;
  const stamp = s.pending;
  const decision = stamp.decision;
  const n = s.index + 1;
  const wasCorrect = decision === verdict.verdict;
  const word = decision === "approve" ? "approved" : "denied";

  const reason = stamp.reason_id === null ? null : findReason(stamp.reason_id);
  const confirmed =
    decision === "deny" && wasCorrect
      ? reasonConfirmed(applicant.application, s.as_of, verdict.results, reason, stamp.source)
      : false;
  const notConfirmed = decision === "deny" && wasCorrect && !confirmed;
  const freePass = notConfirmed && s.unconfirmed === 0; // the first one in an attempt carries no penalty
  const asError = !wasCorrect || (notConfirmed && !freePass);

  const ledgerKey =
    decision === "approve" ? "line_approved" : notConfirmed ? "line_denied_unconfirmed" : "line_denied";

  const entry: DecisionLogEntry = {
    shift_id: s.shift.shift_id,
    application_id: applicant.application.application_id,
    as_of: s.as_of,
    player_decision: decision,
    engine_verdict: verdict.verdict,
    violated_rule_ids: [...verdict.violated_rule_ids],
    attempt_number: s.attempt_number,
  };
  if (decision === "deny") {
    if (reason !== null) entry.denial_reason = { rule_id: reason.rule_id, condition: reason.condition };
    entry.denial_source = stamp.source === null ? null : { doc_type: stamp.source.doc_type, field: stamp.source.field };
    entry.reason_confirmed = confirmed;
  }

  let next: GameState = {
    ...s,
    index: s.index + 1,
    present: false,
    draft: null,
    pending: null,
    unconfirmed: s.unconfirmed + (notConfirmed ? 1 : 0),
    ledger: [...s.ledger, fill(narrative.ledger[ledgerKey] ?? "", { n })],
    decision_log: s.mode === "calendar" ? [...s.decision_log, entry] : s.decision_log,
  };

  if (!asError) {
    next = {
      ...next,
      correct: s.correct + 1,
      balance: next.balance + economy.income_per_correct_decision,
      note: freePass ? fill(narrative.notes["reason_unconfirmed"] ?? "", { n }) : null,
    };
  } else {
    let note: string;
    if (!wasCorrect) {
      const template = decision === "approve" ? narrative.notes["error_approved"] : narrative.notes["error_denied"];
      note = fill(template ?? "", { n, rules: ruleList(verdict.violated_rule_ids), word });
    } else {
      note = fill(narrative.notes["reason_unconfirmed_error"] ?? "", { n });
    }
    next = {
      ...next,
      errors: s.errors + 1,
      balance: clampBalance(next.balance - economy.penalty_per_error),
      note,
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
        reasons_not_confirmed: next.unconfirmed,
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

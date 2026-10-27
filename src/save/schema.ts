import { economy, shifts } from "../data";

// DESIGN 6.4. The save holds ids and results only: never rules, the calendar, or applicants.
// Applicant content and order are recomputed from save_salt and attempt_number.

export type Decision = "approve" | "deny";

export interface DecisionLogEntry {
  shift_id: string;
  application_id: string;
  as_of: string; // ISO date
  player_decision: Decision;
  engine_verdict: Decision;
  violated_rule_ids: string[];
  attempt_number: number;
}

export interface SaveV1 {
  schema_version: 1;
  save_salt: string; // seeds deterministic generation (2.4)
  created_at: string; // ISO timestamp, informational only
  progress: {
    current_shift_id: string; // next shift to play
    completed_shift_ids: string[];
    attempt_number: number; // restarts of current shift, starting at 1
  };
  economy: {
    balance: number;
    balance_at_shift_start: number; // used to restore on restart
  };
  settings: {
    text_scale: number;
    audio_volume: number;
    reduced_motion: boolean;
  };
  desk_layout: Record<string, { x: number; y: number }>;
  decision_log: DecisionLogEntry[];
  flags: Record<string, boolean>;
}

// The caller supplies both values, so this stays free of clocks and randomness.
export function newSave(save_salt: string, created_at: string): SaveV1 {
  return {
    schema_version: 1,
    save_salt,
    created_at,
    progress: {
      current_shift_id: shifts[0]?.shift_id ?? "",
      completed_shift_ids: [],
      attempt_number: 1,
    },
    economy: {
      balance: economy.starting_balance,
      balance_at_shift_start: economy.starting_balance,
    },
    settings: { text_scale: 1, audio_volume: 0.7, reduced_motion: false },
    desk_layout: {},
    decision_log: [],
    flags: {},
  };
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isDecision = (v: unknown): v is Decision => v === "approve" || v === "deny";
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isAttempt = (v: unknown): v is number => isNum(v) && Number.isInteger(v) && v >= 1;
const isRecordOf = (v: unknown, test: (x: unknown) => boolean): boolean =>
  isObj(v) && Object.values(v).every(test);

function isLogEntry(v: unknown): v is DecisionLogEntry {
  return (
    isObj(v) &&
    isStr(v["shift_id"]) &&
    isStr(v["application_id"]) &&
    isStr(v["as_of"]) &&
    isDecision(v["player_decision"]) &&
    isDecision(v["engine_verdict"]) &&
    isStrArray(v["violated_rule_ids"]) &&
    isAttempt(v["attempt_number"])
  );
}

// Shape check only: does this parsed value have every SaveV1 field with the right type.
export function isSaveV1(v: unknown): v is SaveV1 {
  if (!isObj(v) || v["schema_version"] !== 1) return false;
  const { progress, economy: eco, settings } = v;
  return (
    isStr(v["save_salt"]) &&
    isStr(v["created_at"]) &&
    isObj(progress) &&
    isStr(progress["current_shift_id"]) &&
    isStrArray(progress["completed_shift_ids"]) &&
    isAttempt(progress["attempt_number"]) &&
    isObj(eco) &&
    isNum(eco["balance"]) &&
    isNum(eco["balance_at_shift_start"]) &&
    isObj(settings) &&
    isNum(settings["text_scale"]) &&
    isNum(settings["audio_volume"]) &&
    isBool(settings["reduced_motion"]) &&
    isRecordOf(v["desk_layout"], (p) => isObj(p) && isNum(p["x"]) && isNum(p["y"])) &&
    Array.isArray(v["decision_log"]) &&
    v["decision_log"].every(isLogEntry) &&
    isRecordOf(v["flags"], isBool)
  );
}

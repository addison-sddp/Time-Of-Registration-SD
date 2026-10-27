import type { Application, ISODate, RuleId } from "../engine/types";

export interface Violation {
  rule_id: RuleId;
  condition: string; // exact details.condition the engine should report for this rule
}

// What the generator meant to build. A generation input and a test oracle only:
// runtime code takes verdicts from the engine, never from this.
export type Intent =
  | { verdict: "approve" }
  | { verdict: "deny"; violations: Violation[] }; // non-empty, sorted by rule_id

export interface GeneratedApplicant {
  application: Application;
  intent: Intent;
  pinned_position?: number; // 0-based slot in the shift that is never shuffled
  dialogue_key?: string; // key into narrative.dialogue; set on scripted applicants only
}

// Everything a builder needs to know about the shift it is generating for.
export interface GenContext {
  as_of: ISODate;
  election_date: ISODate;
  adult_cutoff: ISODate; // latest birth date that is old enough for the next election
  active_rule_ids: RuleId[]; // sorted
  tribe_keys: string[]; // R3 participating_tribes keys: the only tribe keys ever used
  sd_license_min_issue_date: ISODate; // R3 tier 1 SD license threshold (inclusive)
  sd_new_ok: boolean; // as_of is on or after the threshold, so a qualifying SD license can exist
}

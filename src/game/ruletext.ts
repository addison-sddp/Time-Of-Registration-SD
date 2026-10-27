import rulebookJson from "../data/rulebook.json";
import { shifts } from "../data";
import { activeRuleIds } from "../gen";
import { rules, r3Citizenship } from "../rules";

// Pure rule copy for the rulebook and the bulletin. The wording lives in data/rulebook.json.
// Each rule's text may depend on which other rules are active (DESIGN build-5 item 10).

export interface RuleText {
  rule_id: string;
  title: string;
  body: string[];
}

interface RuleCopy {
  title: string;
  body: string[];
  birth_dates?: { base: string; with_citizenship: string };
}

export interface RulebookCopy {
  cover_title: string;
  cover_subtitle: string;
  open_label: string;
  close_label: string;
  prev_label: string;
  next_label: string;
  page_label: string;
  rules_heading: string;
  notes_heading: string;
  notes_label: string;
  notes_placeholder: string;
  no_new_rules: string;
  tribes_heading: string;
}

const copy = rulebookJson as unknown as RulebookCopy & { rules: Record<string, RuleCopy> };

export const rulebookCopy: RulebookCopy = copy;
// The player-facing name of a rule (never its id).
export const ruleTitle = (id: string): string => copy.rules[id]?.title ?? "";

export const NO_NEW_RULES_LINE: string = copy.no_new_rules;

const R3 = "R3_CITIZENSHIP";

function textFor(id: string, active: ReadonlySet<string>): RuleText | null {
  const c = copy.rules[id];
  if (c === undefined) return null;
  const withCitizenship = active.has(R3);
  const birth = c.birth_dates ? (withCitizenship ? c.birth_dates.with_citizenship : c.birth_dates.base) : "";
  const body = c.body.map((line) => (line === "{birth_dates}" ? birth : line)).filter((l) => l !== "");
  if (id === R3) {
    const tribes = (r3Citizenship.params as { participating_tribes: { name: string }[] }).participating_tribes;
    body.push(copy.tribes_heading, ...tribes.map((t) => `• ${t.name}`));
  }
  return { rule_id: id, title: c.title, body };
}

// All active rules, in the order the rules ship (R1, R2, R3, ...).
export function rulebookEntries(activeRuleIdList: readonly string[]): RuleText[] {
  const active = new Set(activeRuleIdList);
  return rules.flatMap((r) => (active.has(r.id) ? [textFor(r.id, active)].filter((t): t is RuleText => t !== null) : []));
}

function orderedActive(ids: readonly string[]): string[] {
  const set = new Set(ids);
  return rules.filter((r) => set.has(r.id)).map((r) => r.id);
}

export function newRuleIds(shift_id: string, activeRuleIdList: readonly string[], mode: "calendar" | "sandbox"): string[] {
  const current = orderedActive(activeRuleIdList);
  if (mode === "sandbox") return current;
  const i = shifts.findIndex((s) => s.shift_id === shift_id);
  const prev = i > 0 ? shifts[i - 1] : undefined;
  if (prev === undefined) return current;
  const before = new Set(activeRuleIds(rules, prev.shift_date, { mode: "calendar" }));
  return current.filter((id) => !before.has(id));
}

export function bulletinEntries(shift_id: string, activeRuleIdList: readonly string[], mode: "calendar" | "sandbox"): RuleText[] {
  const fresh = new Set(newRuleIds(shift_id, activeRuleIdList, mode));
  return rulebookEntries(activeRuleIdList).filter((e) => fresh.has(e.rule_id));
}

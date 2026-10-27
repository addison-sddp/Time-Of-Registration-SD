import { calendar } from "../src/data";
import { evaluate } from "../src/engine/evaluate";
import type { RuleResult } from "../src/engine/types";
import {
  activeRules, allSources, backToReasons, callNext, chooseReason, chooseSource, currentApplicant, deliverBulletin,
  fileForm, reasonCatalog, reasonsForResults, startDenial, stampApprove, stampDenied, validSources,
  type DocSource, type GameState, type Reason,
} from "../src/game";
import { rules } from "../src/rules";
import type { Decision } from "../src/save";

export function verdictOf(s: GameState): { verdict: Decision; results: RuleResult[] } {
  const a = currentApplicant(s)!;
  const r = evaluate(a.application, s.as_of, calendar, rules, s.activation);
  if (!r.ok) throw new Error("engine error");
  return { verdict: r.value.verdict, results: r.value.results };
}

export const ready = (s: GameState): GameState => callNext(deliverBulletin(s));

// A way of filling in the denial checklist.
export type DenyPlan = "right" | "wrong_source" | "wrong_reason";

export interface Choice {
  reason: Reason;
  source: DocSource | null;
}

export function choiceFor(s: GameState, plan: DenyPlan): Choice {
  const a = currentApplicant(s)!;
  const { results } = verdictOf(s);
  const all = reasonCatalog(activeRules(s)).flatMap((g) => g.reasons);
  const correct = reasonsForResults(results);
  const ids = new Set(correct.map((r) => r.id));
  if (plan === "wrong_reason") {
    const other = all.find((r) => !ids.has(r.id));
    if (other !== undefined) return { reason: other, source: other.needs_source ? (allSources(a.application)[0] ?? null) : null };
  }
  const reason = correct.find((r) => r.needs_source) ?? correct[0] ?? all[0]!;
  if (!reason.needs_source) return { reason, source: null };
  const valid = validSources(a.application, s.as_of, reason);
  const validKeys = new Set(valid.map((v) => `${v.doc_id}|${v.field}`));
  if (plan === "wrong_source") {
    const bad = allSources(a.application).find((x) => !validKeys.has(`${x.doc_id}|${x.field}`));
    if (bad !== undefined) return { reason, source: bad };
  }
  return { reason, source: valid[0] ?? allSources(a.application)[0] ?? null };
}

export function approve(s: GameState): GameState {
  return fileForm(stampApprove(ready(s)));
}

export function deny(s: GameState, plan: DenyPlan = "right"): GameState {
  let cur = startDenial(ready(s));
  const c = choiceFor(cur, plan);
  cur = chooseReason(cur, c.reason.id);
  if (c.source !== null) cur = chooseSource(cur, c.source);
  return fileForm(stampDenied(cur));
}

// Old single-step helper: a correct denial states its right reason and source.
export function decide(s: GameState, d: Decision, plan: DenyPlan = "right"): GameState {
  return d === "approve" ? approve(s) : deny(s, plan);
}

export { backToReasons };

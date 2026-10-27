import { perturbers, type Perturber } from "./perturbers";
import type { Rng } from "./rng";
import type { GenContext, Intent, Violation } from "./types";

// Perturbers for the rules that are active in this context, in rule-id order. An active
// rule with no perturber is left out: the generator can neither make it fail nor vouch for it.
export function violableRules(ctx: GenContext): Perturber[] {
  return perturbers
    .filter((p) => ctx.active_rule_ids.includes(p.rule_id))
    .sort((a, b) => (a.rule_id < b.rule_id ? -1 : a.rule_id > b.rule_id ? 1 : 0));
}

// Every intent reachable in this context: approve, plus each non-empty set of active rules
// with each combination of their failure conditions. Never mentions an inactive rule.
export function listIntents(ctx: GenContext): Intent[] {
  const out: Intent[] = [{ verdict: "approve" }];
  let partial: Violation[][] = [[]];
  for (const p of violableRules(ctx)) {
    const next: Violation[][] = [];
    for (const base of partial) {
      next.push(base); // this rule passes
      for (const condition of p.conditions(ctx)) next.push([...base, { rule_id: p.rule_id, condition }]);
    }
    partial = next;
  }
  for (const violations of partial) if (violations.length > 0) out.push({ verdict: "deny", violations });
  return out;
}

export function intentKey(intent: Intent): string {
  return intent.verdict === "approve"
    ? "approve"
    : "deny:" + intent.violations.map((v) => `${v.rule_id}=${v.condition}`).join("|");
}

// A random intent: about half approvals, and denials mostly failing one rule.
export function drawIntent(rng: Rng, ctx: GenContext, force?: "approve" | "deny"): Intent {
  const rules = violableRules(ctx);
  if (force === "approve" || rules.length === 0 || (force === undefined && rng.chance(0.45))) {
    return { verdict: "approve" };
  }
  const count = Math.min(rules.length, rng.weighted([[1, 65], [2, 25], [3, 10]] as const));
  const chosen = rng.shuffle(rules).slice(0, count).sort((a, b) => (a.rule_id < b.rule_id ? -1 : 1));
  return {
    verdict: "deny",
    violations: chosen.map((p) => ({ rule_id: p.rule_id, condition: rng.pick(p.conditions(ctx)) })),
  };
}

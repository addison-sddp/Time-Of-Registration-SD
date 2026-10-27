import { monthOf } from "./dates";
import { lookupElection } from "./calendar";
import { isKnownFieldPath } from "./paths";
import type {
  Activation, Application, CheckResult, ElectionEntry, EngineError, EvalResult,
  ISODate, AnyRule, RuleResult,
} from "./types";

const invalid = (rule_id: string, reason: string): EngineError => ({
  code: "RULE_CONFIG_INVALID",
  rule_id,
  reason,
});

function validateRules(rules: readonly AnyRule[], activation: Activation): EngineError | null {
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) return invalid(r.id, "duplicate rule id");
    seen.add(r.id);
    const bad = r.applies_to.find((p) => !isKnownFieldPath(p));
    if (bad !== undefined) return invalid(r.id, `unknown field in applies_to: ${bad}`);
  }
  if (activation.mode === "sandbox") {
    const unknown = activation.rule_ids.find((id) => !seen.has(id));
    if (unknown !== undefined) return invalid(unknown, "sandbox rule id not in rule list");
  }
  return null;
}

function isActive(rule: AnyRule, as_of: ISODate, activation: Activation): boolean {
  return activation.mode === "sandbox"
    ? activation.rule_ids.includes(rule.id)
    : rule.introduced_month <= monthOf(as_of);
}

export function evaluate(
  app: Application,
  as_of: ISODate,
  calendar: readonly ElectionEntry[],
  rules: readonly AnyRule[],
  activation: Activation,
): EvalResult {
  const found = lookupElection(calendar, as_of);
  if (!found.ok) return { ok: false, error: { code: found.code, as_of } };

  const configError = validateRules(rules, activation);
  if (configError) return { ok: false, error: configError };

  const ctx = { application: app, as_of, next_election: found.entry };
  const results: RuleResult[] = [];
  for (const rule of rules) {
    if (!isActive(rule, as_of, activation)) continue;
    let result: CheckResult;
    try {
      result = rule.check(ctx, rule.params);
    } catch (e) {
      return { ok: false, error: invalid(rule.id, `check threw: ${String(e)}`) };
    }
    results.push({ rule_id: rule.id, result });
  }

  const violated_rule_ids = results
    .filter((r) => r.result.outcome === "fail")
    .map((r) => r.rule_id)
    .sort();

  return {
    ok: true,
    value: {
      verdict: violated_rule_ids.length > 0 ? "deny" : "approve",
      violated_rule_ids,
      results,
      next_election: found.entry,
    },
  };
}

import type { AnyRule, CheckContext, CheckResult } from "../engine/types";

interface R2Params {
  required_state: string;
}

const fail = (condition: string): CheckResult => ({ outcome: "fail", details: { condition } });

// Deliberately no comparison with any other document's address.
function check(ctx: CheckContext, params: R2Params): CheckResult {
  const { address_line, address_state } = ctx.application.residency_declaration;
  if (address_line === null || address_line.trim() === "") return fail("no address listed");
  if (address_state !== params.required_state) return fail("address state is not South Dakota");
  return { outcome: "pass" };
}

export const r2Residency: AnyRule = {
  id: "R2_RESIDENCY",
  introduced_month: "2025-10",
  applies_to: [
    "application.residency_declaration.address_state",
    "application.residency_declaration.address_line",
  ],
  check,
  params: { required_state: "SD" } satisfies R2Params,
  error_message: "Residency declaration: {condition}.",
  source: { citation: "UNSOURCED (owner: SD codified law, verify citation)" },
  verified: false,
};

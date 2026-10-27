import { perturberFor } from "./perturbers";
import { renderApplication } from "./render";
import type { Rng } from "./rng";
import { baseSpec } from "./spec";
import type { GenContext, GeneratedApplicant, Intent } from "./types";

// Builds one applicant from an intent: start from someone who passes everything, let each
// violated rule's perturber break its part, then render documents.
export function buildApplicant(
  rng: Rng,
  ctx: GenContext,
  intent: Intent,
  application_id: string,
): GeneratedApplicant {
  const spec = baseSpec(rng, ctx);
  if (intent.verdict === "deny") {
    for (const v of intent.violations) {
      const perturber = perturberFor(v.rule_id);
      if (perturber === undefined) throw new Error(`no perturber for ${v.rule_id}`);
      perturber.apply(spec, v.condition, rng, ctx);
    }
  }
  return { application: renderApplication(spec, rng, ctx, application_id), intent };
}

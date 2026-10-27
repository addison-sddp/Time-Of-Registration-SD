import type { RuleId } from "../engine/types";
import {
  R1_BELOW_ELIGIBILITY, R1_DIFFERS, R2_NO_ADDRESS, R2_NOT_SD, R3_EXPIRED, R3_NAME_DIFFERS,
  R3_NO_QUALIFYING, R3_PHOTOCOPY,
} from "./conditions";
import { OTHER_STATES } from "./content";
import { differentDate, randomDate } from "./dates";
import type { Rng } from "./rng";
import { ineligibleRange, type Spec } from "./spec";
import type { GenContext } from "./types";

// A perturber knows how to make one rule fail in each of the ways the rule can fail.
// Adding a rule (DESIGN 3.7) means adding one entry to `perturbers`; intent profiles,
// the generator and the property test then cover it with no other change. A rule with no
// perturber is never made to fail, and the generator does not guess whether it passes.
//
// Perturbers edit the Spec only and must not depend on each other's order: anything that
// depends on the final birth date (documents, ages) is resolved later, at render time.
export interface Perturber {
  rule_id: RuleId;
  // Exact condition strings this perturber can produce for the given shift.
  conditions(ctx: GenContext): string[];
  apply(spec: Spec, condition: string, rng: Rng, ctx: GenContext): void;
}

const r1Perturber: Perturber = {
  rule_id: "R1_AGE",
  conditions: (ctx) => [R1_BELOW_ELIGIBILITY(ctx.election_date), R1_DIFFERS],
  apply(spec, condition, rng, ctx) {
    if (condition === R1_DIFFERS) {
      // The true date stays adult-eligible; one place disagrees. The engine reports the
      // mismatch before it looks at age.
      spec.birth_mismatch = {
        target: rng.pick(["declared", "id", "citizenship"] as const),
        date: differentDate(rng, spec.birth_date),
      };
      return;
    }
    const [lo, hi] = ineligibleRange(ctx);
    spec.birth_date = rng.chance(0.15) ? lo : randomDate(rng, lo, hi); // lo = one day past the cutoff
  },
};

const r2Perturber: Perturber = {
  rule_id: "R2_RESIDENCY",
  conditions: () => [R2_NOT_SD, R2_NO_ADDRESS],
  apply(spec, condition, rng) {
    spec.residency =
      condition === R2_NO_ADDRESS
        ? { kind: "none" }
        : { kind: "other_state", state: rng.pick(OTHER_STATES).code };
  },
};

const r3Perturber: Perturber = {
  rule_id: "R3_CITIZENSHIP",
  conditions: () => [R3_NO_QUALIFYING, R3_PHOTOCOPY, R3_NAME_DIFFERS, R3_EXPIRED],
  apply(spec, condition) {
    spec.r3_condition = condition; // documents are chosen at render time, once age is final
  },
};

export const perturbers: readonly Perturber[] = [r1Perturber, r2Perturber, r3Perturber];

export const perturberFor = (rule_id: RuleId): Perturber | undefined =>
  perturbers.find((p) => p.rule_id === rule_id);

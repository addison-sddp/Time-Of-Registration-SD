import { minusYears } from "../engine/dates";
import type { AnyRule, CheckContext, CheckResult } from "../engine/types";

interface R1Params {
  min_age_years: number;
}

const fail = (condition: string): CheckResult => ({ outcome: "fail", details: { condition } });

function check(ctx: CheckContext, params: R1Params): CheckResult {
  const { id_document, declared_birth_date, citizenship_documents } = ctx.application;
  const idBirth = id_document?.birth_date ?? null;
  if (idBirth === null) return fail("no date of birth on identity document");

  // A mismatch is reported first: the age comparison is meaningless if the dates disagree.
  const others = [declared_birth_date, ...citizenship_documents.map((d) => d.birth_date)];
  if (others.some((b) => b !== null && b !== idBirth)) return fail("differs between documents");

  const election = ctx.next_election.election_date;
  const cutoff = minusYears(election, params.min_age_years);
  if (idBirth > cutoff) {
    return fail(`below eligibility date for the next election (${election})`);
  }
  return { outcome: "pass" };
}

export const r1Age: AnyRule = {
  id: "R1_AGE",
  introduced_month: "2025-10",
  applies_to: [
    "application.id_document.birth_date",
    "application.declared_birth_date",
    "application.citizenship_documents[].birth_date",
  ],
  check,
  params: { min_age_years: 18 } satisfies R1Params,
  error_message: "Date of birth: {condition}.",
  source: { citation: "UNSOURCED (owner: South Dakota codified law, verify citation)" },
  verified: false,
};

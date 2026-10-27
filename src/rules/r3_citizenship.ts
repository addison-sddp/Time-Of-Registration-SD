import { namesMatch } from "../engine/names";
import type { AnyRule, CheckContext, CheckResult, Document, DocumentType } from "../engine/types";

interface Tribe {
  key: string;
  name: string;
}

interface R3Params {
  sd_license_min_issue_date: string; // inclusive (Q2)
  other_state_types: DocumentType[];
  tier2_types: DocumentType[];
  // All tribes in South Dakota; owner confirmed the list 2026-10-27 (DESIGN.md
  // section 10). Whether each has an agreement with the Secretary of State is assumed.
  participating_tribes: Tribe[];
}

const params: R3Params = {
  sd_license_min_issue_date: "2025-07-01",
  other_state_types: ["other_state_drivers_license", "other_state_nondriver_id"],
  tier2_types: [
    "birth_certificate",
    "us_passport",
    "consular_report_of_birth_abroad",
    "certificate_of_naturalization",
  ],
  participating_tribes: [
    { key: "tribe:cheyenne-river-sioux", name: "Cheyenne River Sioux Tribe" },
    { key: "tribe:crow-creek-sioux", name: "Crow Creek Sioux Tribe" },
    { key: "tribe:flandreau-santee-sioux", name: "Flandreau Santee Sioux Tribe" },
    { key: "tribe:lower-brule-sioux", name: "Lower Brule Sioux Tribe" },
    { key: "tribe:oglala-sioux", name: "Oglala Sioux Tribe" },
    { key: "tribe:rosebud-sioux", name: "Rosebud Sioux Tribe" },
    { key: "tribe:sisseton-wahpeton-oyate", name: "Sisseton-Wahpeton Oyate" },
    { key: "tribe:standing-rock-sioux", name: "Standing Rock Sioux Tribe" },
    { key: "tribe:yankton-sioux", name: "Yankton Sioux Tribe" },
  ],
};

interface Classified {
  d: Document;
  tier: 1 | 2;
}

const fail = (condition: string): CheckResult => ({ outcome: "fail", details: { condition } });

// Document-type criteria only; originality, name and expiry are tested separately
// so the failure condition can say which one was missed.
function tier1Type(d: Document, p: R3Params): boolean {
  if (d.type === "sd_drivers_license") {
    return (
      d.issuing_jurisdiction === "SD" &&
      d.issue_date !== null &&
      d.issue_date >= p.sd_license_min_issue_date &&
      // owner decision 2026-10-27: printed "U.S. Citizen" (a non-citizen can hold a new SD license)
      d.citizenship_verified_marker === true
    );
  }
  if (p.other_state_types.includes(d.type)) {
    return d.issuing_jurisdiction !== "SD" && d.citizenship_verified_marker === true;
  }
  if (d.type === "tribal_id") {
    return p.participating_tribes.some((t) => t.key === d.issuing_jurisdiction);
  }
  return false;
}

const unexpired = (d: Document, as_of: string): boolean =>
  d.expiry_date === null || d.expiry_date >= as_of;

function check(ctx: CheckContext, p: R3Params): CheckResult {
  const { applicant_name, citizenship_documents: docs } = ctx.application;
  const { as_of } = ctx;

  // Which tier's type criteria each document meets, if any.
  const classified: Classified[] = docs.flatMap((d): Classified[] => {
    if (tier1Type(d, p)) return [{ d, tier: 1 }];
    if (p.tier2_types.includes(d.type)) return [{ d, tier: 2 }];
    return [];
  });
  // Tier 2 accepts photocopies (Q3), so is_photocopy only matters for tier 1.
  const originalOk = ({ d, tier }: Classified): boolean => tier === 2 || !d.is_photocopy;

  const qualifies = classified.some(
    (c) => originalOk(c) && namesMatch(c.d.name, applicant_name) && unexpired(c.d, as_of),
  );
  if (qualifies) return { outcome: "pass" };

  if (classified.some((c) => c.tier === 1 && c.d.is_photocopy)) {
    return fail("photocopy presented where original required");
  }
  const originals = classified.filter(originalOk);
  if (originals.some((c) => unexpired(c.d, as_of) && !namesMatch(c.d.name, applicant_name))) {
    return fail("name differs between documents");
  }
  if (originals.some((c) => namesMatch(c.d.name, applicant_name))) {
    return fail("document expired");
  }
  return fail("no qualifying document presented");
}

export const r3Citizenship: AnyRule = {
  id: "R3_CITIZENSHIP",
  introduced_month: "2026-04",
  applies_to: [
    "application.citizenship_documents[].type",
    "application.citizenship_documents[].is_photocopy",
    "application.citizenship_documents[].issue_date",
    "application.citizenship_documents[].expiry_date",
    "application.citizenship_documents[].issuing_jurisdiction",
    "application.citizenship_documents[].citizenship_verified_marker",
    "application.citizenship_documents[].name",
    "application.applicant_name",
  ],
  check,
  params,
  error_message: "Citizenship documentation: {condition}.",
  source: { citation: "SB 175 (2026 session), as quoted by owner; section number UNSOURCED" },
  verified: false,
};

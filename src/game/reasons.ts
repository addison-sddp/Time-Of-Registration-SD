import { narrative } from "../data";
import { namesMatch } from "../engine/names";
import type { Application, Document, ISODate, RuleResult } from "../engine/types";
import { r3Citizenship } from "../rules";
import { finePrintFor } from "./fineprint";

// Denial reasons (owner decision, build 4). Pure: the catalog is built from the active rules, and
// the valid-source mapping decides whether a clicked field really shows the problem. The rule
// engine still decides every verdict; this module only grades the stated reason and source.

export const FORM_TYPE = "application_form";

export type SourceKind =
  | "none" // the reason is an absence; no field is chosen
  | "birth_any" // any date-of-birth field
  | "birth_differs" // a date-of-birth field that disagrees with another one presented
  | "residency_address" // the address field of the residency declaration
  | "photocopy" // any part of a photocopied original-required document
  | "name_differs" // the name field of a qualifying-type document that does not match the form
  | "expired"; // the expiry field of an expired qualifying-type document

interface ReasonDef {
  key: string;
  condition: string; // the engine's details.condition; for R1 the part before " ("
  source: SourceKind;
}

// One entry per failure condition each rule can report (src/rules/*.ts).
const DEFS: Readonly<Record<string, readonly ReasonDef[]>> = {
  R1_AGE: [
    { key: "no_birth_date", condition: "no date of birth on identity document", source: "none" },
    { key: "differs", condition: "differs between documents", source: "birth_differs" },
    { key: "below_eligibility", condition: "below eligibility date for the next election", source: "birth_any" },
  ],
  R2_RESIDENCY: [
    { key: "not_sd", condition: "address state is not South Dakota", source: "residency_address" },
    { key: "no_address", condition: "no address listed", source: "residency_address" },
  ],
  R3_CITIZENSHIP: [
    { key: "photocopy", condition: "photocopy presented where original required", source: "photocopy" },
    { key: "name_differs", condition: "name differs between documents", source: "name_differs" },
    { key: "expired", condition: "document expired", source: "expired" },
    { key: "no_qualifying", condition: "no qualifying document presented", source: "none" },
  ],
};

export interface Reason {
  id: string; // "<rule_id>.<key>"
  rule_id: string;
  condition: string;
  text: string;
  source: SourceKind;
  needs_source: boolean;
}

export interface ReasonGroup {
  rule_id: string;
  heading: string;
  reasons: Reason[];
}

// The comparison key for an engine condition: R1's eligibility condition carries the election
// date in parentheses, which is dropped.
export const conditionKey = (condition: string): string => condition.split(" (")[0] ?? condition;

function build(rule_id: string, d: ReasonDef): Reason {
  const id = `${rule_id}.${d.key}`;
  return {
    id,
    rule_id,
    condition: d.condition,
    text: narrative.reasons[id] ?? d.condition,
    source: d.source,
    needs_source: d.source !== "none",
  };
}

// One group per active rule, in the order given. A rule with no entry has no reasons to list.
export function reasonCatalog(activeRuleIds: readonly string[]): ReasonGroup[] {
  const out: ReasonGroup[] = [];
  for (const rule_id of activeRuleIds) {
    const defs = DEFS[rule_id];
    if (defs === undefined) continue;
    out.push({
      rule_id,
      heading: narrative.briefing.rules[rule_id]?.heading ?? rule_id,
      reasons: defs.map((d) => build(rule_id, d)),
    });
  }
  return out;
}

export function findReason(id: string): Reason | null {
  const rule_id = id.split(".")[0] ?? "";
  const def = DEFS[rule_id]?.find((d) => `${rule_id}.${d.key}` === id);
  return def === undefined ? null : build(rule_id, def);
}

// ---- Documents and fields ------------------------------------------------------------------

export interface DocSource {
  doc_id: string;
  doc_type: string;
  field: string;
}

export interface PresentedDoc {
  doc_id: string;
  doc_type: string; // FORM_TYPE for the application form
  doc: Document | null; // null for the form
}

// The documents on the desk, in display order. The identity document that is also listed as
// citizenship evidence appears once.
export function presentedDocuments(app: Application): PresentedDoc[] {
  const out: PresentedDoc[] = [{ doc_id: app.application_id, doc_type: FORM_TYPE, doc: null }];
  const seen = new Set<string>();
  if (app.id_document !== null) {
    out.push({ doc_id: app.id_document.doc_id, doc_type: app.id_document.type, doc: app.id_document });
    seen.add(app.id_document.doc_id);
  }
  out.push({ doc_id: app.residency_declaration.doc_id, doc_type: "residency_declaration", doc: app.residency_declaration });
  seen.add(app.residency_declaration.doc_id);
  for (const d of app.citizenship_documents) {
    if (seen.has(d.doc_id)) continue;
    seen.add(d.doc_id);
    out.push({ doc_id: d.doc_id, doc_type: d.type, doc: d });
  }
  return out;
}

const filled = (v: string | null): boolean => v !== null && v !== "";

// The printed fields the player can pick on a sheet or card (the ui gives each one a data-field key
// with these names). "photocopy" stands for the whole sheet or card.
export function fieldsOfDoc(p: PresentedDoc): string[] {
  const d = p.doc;
  if (d === null) return ["name", "birth_date", "photocopy"];
  if (d.type === "residency_declaration") return ["name", "address", "photocopy"];
  const out: string[] = [];
  if (filled(d.name)) out.push("name");
  if (filled(d.birth_date)) out.push("birth_date");
  if (filled(d.address_line)) out.push("address");
  if (filled(d.issue_date)) out.push("issue_date");
  if (filled(d.expiry_date)) out.push("expiry_date");
  if (filled(d.issuing_jurisdiction)) out.push(d.type === "tribal_id" ? "tribe" : "issuing_jurisdiction");
  if (d.type === "sd_drivers_license" || finePrintFor(d) !== null) out.push("fine_print");
  out.push("photocopy");
  return out;
}

export function allSources(app: Application): DocSource[] {
  return presentedDocuments(app).flatMap((p) =>
    fieldsOfDoc(p).map((field) => ({ doc_id: p.doc_id, doc_type: p.doc_type, field })),
  );
}

// ---- Valid sources -------------------------------------------------------------------------

interface R3View {
  sd_license_min_issue_date: string;
  other_state_types: string[];
  tier2_types: string[];
  participating_tribes: { key: string }[];
}

// Document-type criteria of R3 (tier 1 or tier 2), ignoring originality, name and expiry.
function qualifyingType(d: Document): boolean {
  const p = r3Citizenship.params as R3View;
  if (p.tier2_types.includes(d.type)) return true;
  return tier1Type(d, p);
}

function tier1Type(d: Document, p: R3View): boolean {
  if (d.type === "sd_drivers_license") {
    return (
      d.issuing_jurisdiction === "SD" &&
      d.issue_date !== null &&
      d.issue_date >= p.sd_license_min_issue_date &&
      d.citizenship_verified_marker === true
    );
  }
  if (p.other_state_types.includes(d.type)) {
    return d.issuing_jurisdiction !== "SD" && d.citizenship_verified_marker === true;
  }
  if (d.type === "tribal_id") return p.participating_tribes.some((t) => t.key === d.issuing_jurisdiction);
  return false;
}

const birthOf = (app: Application, p: PresentedDoc): string | null =>
  p.doc === null ? app.declared_birth_date : p.doc.birth_date;

export function isValidSource(
  app: Application,
  as_of: ISODate,
  reason: Reason,
  source: DocSource | null,
): boolean {
  if (reason.source === "none") return source === null;
  if (source === null) return false;
  const docs = presentedDocuments(app);
  const p = docs.find((x) => x.doc_id === source.doc_id && x.doc_type === source.doc_type);
  if (p === undefined || !fieldsOfDoc(p).includes(source.field)) return false;
  const d = p.doc;
  switch (reason.source) {
    case "birth_any":
      return source.field === "birth_date";
    case "birth_differs": {
      if (source.field !== "birth_date") return false;
      if (app.id_document !== null && p.doc_id === app.id_document.doc_id) return true;
      const mine = birthOf(app, p);
      return docs.some((o) => {
        if (o.doc_id === p.doc_id) return false;
        const theirs = birthOf(app, o);
        return theirs !== null && theirs !== mine;
      });
    }
    case "residency_address":
      return p.doc_type === "residency_declaration" && source.field === "address";
    case "photocopy":
      return d !== null && d.is_photocopy && tier1Type(d, r3Citizenship.params as R3View);
    case "name_differs":
      if (source.field !== "name") return false;
      if (d === null) return true; // the form's name
      return qualifyingType(d) && !namesMatch(d.name, app.applicant_name);
    case "expired":
      return (
        d !== null && source.field === "expiry_date" && qualifyingType(d) &&
        d.expiry_date !== null && d.expiry_date < as_of
      );
    default:
      return false;
  }
}

// Every field on the desk that is a valid source for the reason.
export function validSources(app: Application, as_of: ISODate, reason: Reason): DocSource[] {
  if (reason.source === "none") return [];
  return allSources(app).filter((s) => isValidSource(app, as_of, reason, s));
}

// A denial's reason is confirmed when it names a rule that failed with that condition and, for a
// reason that needs one, a valid source.
export function reasonConfirmed(
  app: Application,
  as_of: ISODate,
  results: readonly RuleResult[],
  reason: Reason | null,
  source: DocSource | null,
): boolean {
  if (reason === null) return false;
  const failed = results.some(
    (r) =>
      r.rule_id === reason.rule_id &&
      r.result.outcome === "fail" &&
      conditionKey(r.result.details.condition) === reason.condition,
  );
  return failed && isValidSource(app, as_of, reason, source);
}

// The reasons the engine's failing results correspond to (for the reference answer in tests).
export function reasonsForResults(results: readonly RuleResult[]): Reason[] {
  const out: Reason[] = [];
  for (const r of results) {
    if (r.result.outcome !== "fail") continue;
    const key = conditionKey(r.result.details.condition);
    const def = DEFS[r.rule_id]?.find((d) => d.condition === key);
    if (def !== undefined) out.push(build(r.rule_id, def));
  }
  return out;
}

export type ISODate = string; // YYYY-MM-DD, no time or zone
export type YearMonth = string; // YYYY-MM
export type RuleId = string;
export type FieldPath = string;

export type DocumentType =
  | "sd_drivers_license"
  | "other_state_drivers_license"
  | "other_state_nondriver_id"
  | "tribal_id"
  | "birth_certificate"
  | "us_passport"
  | "consular_report_of_birth_abroad"
  | "certificate_of_naturalization"
  | "residency_declaration"
  | "other_unrecognized";

export type Sex = "M" | "F";

export interface Document {
  doc_id: string;
  type: DocumentType;
  is_photocopy: boolean;
  issue_date: ISODate | null;
  expiry_date: ISODate | null;
  issuing_jurisdiction: string | null;
  citizenship_verified_marker: boolean | null;
  name: string | null;
  birth_date: ISODate | null;
  // Printed sex marker. Display and portrait only: no rule reads it and no rule may declare it.
  sex: Sex | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal: string | null;
  portrait_seed: number | null;
}

export interface Application {
  application_id: string;
  applicant_name: string;
  declared_birth_date: ISODate;
  id_document: Document | null;
  residency_declaration: Document;
  citizenship_documents: Document[];
}

export interface ElectionEntry {
  from: ISODate | null; // inclusive
  to: ISODate | null; // exclusive
  election_date: ISODate;
  registration_deadline: ISODate; // inclusive
  label: string;
  verified: boolean;
}

export interface SourceRef {
  citation: string;
  url?: string;
  note?: string;
}

export interface CheckContext {
  application: Application;
  as_of: ISODate;
  next_election: ElectionEntry;
}

export type CheckResult =
  | { outcome: "pass" }
  | { outcome: "fail"; details: { condition: string } & Record<string, string> }
  | { outcome: "not_applicable" };

export interface Rule<P = unknown> {
  id: RuleId;
  introduced_month: YearMonth;
  applies_to: FieldPath[];
  check: (ctx: CheckContext, params: P) => CheckResult;
  params: P;
  error_message: string;
  source: SourceRef;
  verified: boolean;
}

export type Activation =
  | { mode: "calendar" }
  | { mode: "sandbox"; rule_ids: RuleId[] };

export interface RuleResult {
  rule_id: RuleId;
  result: CheckResult;
}

export interface Verdict {
  verdict: "approve" | "deny";
  violated_rule_ids: RuleId[];
  results: RuleResult[];
  next_election: ElectionEntry;
}

export type EngineError =
  | { code: "NO_ELECTION_CONFIGURED"; as_of: ISODate }
  | { code: "OVERLAPPING_CALENDAR_ENTRIES"; as_of: ISODate }
  | { code: "RULE_CONFIG_INVALID"; rule_id: RuleId; reason: string };

export type EvalResult =
  | { ok: true; value: Verdict }
  | { ok: false; error: EngineError };

// Rules are stored heterogeneously; params stay typed inside each rule file.
export type AnyRule = Rule<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

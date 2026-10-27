// Structural schema used for the applies_to guard (doc 3.2): a rule that
// declares a field the Application type does not have is a configuration error.
const DOCUMENT_FIELDS = [
  "doc_id", "type", "is_photocopy", "issue_date", "expiry_date",
  "issuing_jurisdiction", "citizenship_verified_marker", "name", "birth_date",
  "address_line", "address_city", "address_state", "address_postal", "portrait_seed",
] as const;

const APPLICATION_FIELDS: Record<string, "scalar" | "document"> = {
  application_id: "scalar",
  applicant_name: "scalar",
  declared_birth_date: "scalar",
  id_document: "document",
  residency_declaration: "document",
  citizenship_documents: "document",
};

export function isKnownFieldPath(path: string): boolean {
  const parts = path.replace(/\[\]/g, "").split(".");
  if (parts[0] !== "application") return false;
  const kind = APPLICATION_FIELDS[parts[1] ?? ""];
  if (kind === undefined) return false;
  if (parts.length === 2) return true;
  if (kind === "scalar" || parts.length > 3) return false;
  return (DOCUMENT_FIELDS as readonly string[]).includes(parts[2] ?? "");
}

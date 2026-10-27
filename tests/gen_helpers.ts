import type { Application, Document, ISODate } from "../src/engine/types";

const DATE_FIELDS = ["issue_date", "expiry_date", "birth_date"] as const;

export function isRealDate(s: unknown): boolean {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function docsOf(a: Application): Document[] {
  return [...(a.id_document ? [a.id_document] : []), a.residency_declaration, ...a.citizenship_documents];
}

// Returns a list of problems; an empty list means the application is well formed.
export function problemsWith(a: Application, as_of: ISODate): string[] {
  const out: string[] = [];
  const bad = (msg: string) => out.push(`${a.application_id}: ${msg}`);
  if (a.application_id === "") bad("empty application_id");
  if (a.applicant_name.trim() === "") bad("empty applicant_name");
  if (!isRealDate(a.declared_birth_date)) bad(`bad declared_birth_date ${a.declared_birth_date}`);
  if (a.id_document === null) bad("no id_document");
  if (a.residency_declaration.type !== "residency_declaration") bad("residency type");

  const seen = new Map<string, Document>();
  for (const d of docsOf(a)) {
    const prior = seen.get(d.doc_id);
    // The only legal repeat is the identity document also listed as citizenship evidence.
    if (prior !== undefined && d.doc_id !== a.id_document?.doc_id) bad(`duplicate doc_id ${d.doc_id}`);
    seen.set(d.doc_id, d);

    for (const f of DATE_FIELDS) {
      const v = d[f];
      if (v !== null && !isRealDate(v)) bad(`${d.doc_id}.${f} not a real date: ${v}`);
    }
    if (d.issue_date !== null && d.issue_date > as_of) bad(`${d.doc_id} issued after as_of`);
    if (d.issue_date !== null && d.expiry_date !== null && d.issue_date >= d.expiry_date) {
      bad(`${d.doc_id} expiry not after issue`);
    }
    if (d.issue_date !== null && d.birth_date !== null && d.issue_date <= d.birth_date) {
      bad(`${d.doc_id} issued before birth`);
    }
    if (d.address_state !== null && !/^[A-Z]{2}$/.test(d.address_state)) bad(`${d.doc_id} state code`);
    if (d.address_postal !== null && !/^\d{5}$/.test(d.address_postal)) bad(`${d.doc_id} postal code`);
    if (d.portrait_seed !== null && !Number.isInteger(d.portrait_seed)) bad(`${d.doc_id} portrait_seed`);
    if (d.name !== null && d.name.trim() === "") bad(`${d.doc_id} empty name`);
    if (d.type === "residency_declaration" && d.name === null) bad("residency without a name");
  }
  return out;
}

export const everyDocument = (apps: Application[]): Document[] => apps.flatMap(docsOf);

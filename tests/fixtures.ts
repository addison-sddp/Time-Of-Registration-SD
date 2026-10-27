import type { Application, Document } from "../src/engine/types";

export const NAME = "Jane Q. Public";

export function doc(over: Partial<Document> = {}): Document {
  return {
    doc_id: "d1",
    type: "sd_drivers_license",
    is_photocopy: false,
    issue_date: "2025-08-01",
    expiry_date: "2030-01-01",
    issuing_jurisdiction: "SD",
    citizenship_verified_marker: true,
    name: NAME,
    birth_date: "1990-01-01",
    address_line: "100 Example St",
    address_city: "Sioux Falls",
    address_state: "SD",
    address_postal: "57101",
    portrait_seed: 1,
    ...over,
  };
}

export function residency(over: Partial<Document> = {}): Document {
  return doc({
    doc_id: "res",
    type: "residency_declaration",
    issue_date: null,
    expiry_date: null,
    issuing_jurisdiction: null,
    name: NAME,
    birth_date: null,
    portrait_seed: null,
    ...over,
  });
}

// Passes R1, R2 and R3 on any date in the game.
export function app(over: Partial<Application> = {}): Application {
  return {
    application_id: "a1",
    applicant_name: NAME,
    declared_birth_date: "1990-01-01",
    id_document: doc({ doc_id: "id" }),
    residency_declaration: residency(),
    citizenship_documents: [doc({ doc_id: "c1" })],
    ...over,
  };
}

export function deepFreeze<T>(o: T): T {
  if (o !== null && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

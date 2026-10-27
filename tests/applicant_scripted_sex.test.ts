import { describe, expect, test } from "vitest";
import { shifts } from "../src/data";
import { FIRST_NAMES_F, FIRST_NAMES_M } from "../src/gen/content";
import { docsOf } from "./gen_helpers";

describe("scripted applicants carry sex", () => {
  const scripted = shifts.flatMap((s) => s.scripted_applicants ?? []);
  test("there are scripted applicants", () => expect(scripted.length).toBeGreaterThan(0));
  test("every document has a sex key, consistent per applicant and matching the first name", () => {
    for (const { application: a } of scripted) {
      const docs = docsOf(a);
      for (const d of docs) {
        expect("sex" in d, `${d.doc_id} missing sex`).toBe(true);
        if (d.type === "residency_declaration") expect(d.sex).toBeNull();
        else expect(["M", "F"]).toContain(d.sex);
      }
      const sexes = new Set(docs.map((d) => d.sex).filter((x) => x !== null));
      expect(sexes.size).toBe(1);
      const first = a.applicant_name.split(" ")[0]!;
      const list = [...sexes][0] === "F" ? FIRST_NAMES_F : FIRST_NAMES_M;
      const other = [...sexes][0] === "F" ? FIRST_NAMES_M : FIRST_NAMES_F;
      // Scripted names are owner placeholders and may not be on the generator lists; just never the opposite one.
      expect(other).not.toContain(first);
      void list;
    }
  });
});

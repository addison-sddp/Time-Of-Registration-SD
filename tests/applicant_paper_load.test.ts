import { describe, expect, test } from "vitest";
import { shifts } from "../src/data";
import { generateShift } from "../src/gen";

// Owner build-5 addendum: early shifts bring a license and nothing else; later shifts stay light.
const SALTS = Array.from({ length: 40 }, (_, i) => `load-${i}`);
const pre = shifts.filter((s) => s.shift_date < "2026-04-01");
const post = shifts.filter((s) => s.shift_date >= "2026-04-01");

function gather(list: typeof shifts) {
  return SALTS.flatMap((salt) => list.flatMap((s) => generateShift(salt, { ...s, scripted_applicants: undefined }))).map((g) => g.application);
}

describe("paper load", () => {
  test("before R3: nearly everyone brings only an identity document", () => {
    const apps = gather(pre);
    expect(apps.length).toBeGreaterThan(500);
    const empty = apps.filter((a) => a.citizenship_documents.length === 0).length / apps.length;
    const herring = apps.filter((a) => a.citizenship_documents.some((d) => d.type === "other_unrecognized")).length / apps.length;
    expect(empty).toBeGreaterThanOrEqual(0.9);
    expect(herring).toBeLessThanOrEqual(0.1);
    const lic = apps.filter((a) => a.id_document?.type === "sd_drivers_license" || a.id_document?.type === "other_state_drivers_license").length / apps.length;
    const sd = apps.filter((a) => a.id_document?.type === "sd_drivers_license").length / apps.length;
    expect(lic).toBeGreaterThanOrEqual(0.9);
    expect(sd).toBeGreaterThanOrEqual(0.78);
  });

  test("after R3: about one paper per applicant on average", () => {
    const apps = gather(post);
    const papers = apps.reduce((n, a) => n + new Set([a.id_document?.doc_id, ...a.citizenship_documents.map((d) => d.doc_id)].filter((x) => x !== undefined)).size, 0);
    expect(papers / apps.length).toBeLessThanOrEqual(1.6);
  });
});

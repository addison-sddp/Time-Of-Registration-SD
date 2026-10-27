import { describe, expect, test } from "vitest";
import type { Application, Document } from "../src/engine/types";
import { createContext, buildApplicant, createRng, hashSeed, listIntents } from "../src/gen";
import { FIRST_NAMES_F, FIRST_NAMES_M, SD_PLACES } from "../src/gen/content";
import { docsOf } from "./gen_helpers";

// Sex and South Dakota address content (owner build-5 items 23a and 24).
const AS_OF = "2026-06-03";
const ctx = createContext(AS_OF, { activation: { mode: "sandbox", rule_ids: ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"] } });
const intents = listIntents(ctx);

function many(n: number): Application[] {
  const out: Application[] = [];
  for (let i = 0; i < n; i++) {
    const intent = intents[i % intents.length]!;
    out.push(buildApplicant(createRng(hashSeed("sexaddr", i)), ctx, intent, `s${i}`).application);
  }
  return out;
}
const APPS = many(600);

const IDENTITY = new Set(["sd_drivers_license", "other_state_drivers_license", "other_state_nondriver_id", "tribal_id", "us_passport"]);

describe("sex on documents", () => {
  test("every applicant has one sex across all documents; identity documents always carry it", () => {
    for (const a of APPS) {
      const docs = docsOf(a);
      const sexes = new Set(docs.map((d) => d.sex).filter((s) => s !== null));
      expect(sexes.size).toBe(1);
      for (const d of docs) {
        expect(d.sex === null || d.sex === "M" || d.sex === "F").toBe(true);
        if (IDENTITY.has(d.type) || d.type === "birth_certificate") expect(d.sex).not.toBeNull();
        if (d.type === "residency_declaration" || d.type === "other_unrecognized") expect(d.sex).toBeNull();
      }
    }
  });

  test("both sexes occur, roughly evenly", () => {
    const f = APPS.filter((a) => a.id_document?.sex === "F").length;
    expect(f).toBeGreaterThan(200);
    expect(f).toBeLessThan(400);
  });

  test("first names come from the list matching the printed sex", () => {
    expect(FIRST_NAMES_F.filter((n) => FIRST_NAMES_M.includes(n))).toEqual([]);
    for (const a of APPS) {
      const first = a.applicant_name.split(" ")[0]!.toLowerCase();
      const f = FIRST_NAMES_F.some((n) => n.toLowerCase() === first);
      const m = FIRST_NAMES_M.some((n) => n.toLowerCase() === first);
      const sex = docsOf(a).find((d) => d.sex !== null)?.sex;
      expect(sex === "F" ? f : m, `${a.applicant_name} ${sex}`).toBe(true);
      expect(f !== m).toBe(true);
      for (const d of docsOf(a)) {
        const n = d.name?.split(" ")[0]?.toLowerCase();
        if (n !== undefined) expect(n).toBe(first);
      }
    }
  });

  test("generation is deterministic", () => {
    expect(many(30)).toEqual(many(30));
  });
});

describe("South Dakota addresses", () => {
  const cities = new Map(SD_PLACES.map((p) => [p.city, p]));
  const sdDocs: Document[] = APPS.flatMap(docsOf).filter((d) => d.address_state === "SD");

  test("every SD address uses a listed real city and a matching 57xxx ZIP", () => {
    expect(sdDocs.length).toBeGreaterThan(300);
    for (const d of sdDocs) {
      const place = cities.get(d.address_city ?? "");
      expect(place, `city ${d.address_city}`).toBeDefined();
      expect(d.address_postal).toMatch(/^57[0-7]\d\d$/);
      expect(place!.zips).toContain(d.address_postal);
      expect(d.address_line).toMatch(/^\d+ [A-Za-z ]+ [A-Za-z]+$/);
      expect(d.address_line!.toLowerCase()).not.toContain("box");
    }
  });

  test("the list is all 57[0-7]xx ZIPs, unique cities, weighted toward Sioux Falls", () => {
    expect(new Set(SD_PLACES.map((p) => p.city)).size).toBe(SD_PLACES.length);
    for (const p of SD_PLACES) for (const z of p.zips) expect(z).toMatch(/^57[0-7]\d\d$/);
    const sf = sdDocs.filter((d) => d.address_city === "Sioux Falls").length;
    expect(sf / sdDocs.length).toBeGreaterThan(0.25);
    expect(new Set(sdDocs.map((d) => d.address_city)).size).toBeGreaterThan(10);
  });
});

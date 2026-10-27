import { describe, expect, test } from "vitest";
import { narrative } from "../src/data";
import type { Document } from "../src/engine/types";
import { doc } from "./fixtures";
import {
  applicantPortraitSeed, backDigits, finePrintFor, sdBackRows, fill, formatDate, formatPrinted, isValidDate, monthYear,
  portraitParams, SKIN_TONES,
} from "../src/game";
import { rules } from "../src/rules";
import { app } from "./fixtures";

describe("narrative", () => {
  test("every rule has briefing text", () => {
    for (const r of rules) {
      const entry = narrative.briefing.rules[r.id];
      expect(entry, r.id).toBeDefined();
      expect(entry!.lines.length).toBeGreaterThan(0);
    }
  });

  test("the letter is headed by the office with no named signatory", () => {
    expect(narrative.briefing.header).toBe("Office of the South Dakota Secretary of State");
    expect(narrative.briefing.closing).toBe("Elections Division");
  });

  test("briefing text does not mention the 30-day clause", () => {
    const text = JSON.stringify(narrative.briefing);
    expect(text).not.toMatch(/\b30\b|thirty|consecutive|nights|sleep/i);
  });

  test("briefing states the R3 tier lists, date and exclusions", () => {
    const text = narrative.briefing.rules["R3_CITIZENSHIP"]!.lines.map((l) => l.text).join(" ");
    expect(text).toMatch(/U\.S\. Citizen/);
    expect(text).not.toMatch(/July 1, 2025/);
    expect(text).toMatch(/Photocopies are not accepted/);
    expect(text).toMatch(/Expired documents are not accepted/);
    expect(text).toMatch(/name/);
  });

  test("the only fine-print marking is the exact text U.S. Citizen", () => {
    expect(narrative.docs["fine_print_citizen"]).toBe("U.S. Citizen");
    expect(JSON.stringify(narrative)).not.toMatch(/CITIZENSHIP VERIFIED/);
  });
});

describe("format helpers", () => {
  test("dates", () => {
    expect(formatDate("2026-06-02")).toBe("June 2, 2026");
    expect(monthYear("2025-10-01")).toBe("October 2025");
    expect(formatPrinted("2026-06-02")).toBe("06/02/2026");
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2026-6-2")).toBe(false);
  });
  test("fill replaces known placeholders only", () => {
    expect(fill("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
  });
});

describe("portraits", () => {
  test("same seed gives identical parameters, different seeds vary", () => {
    expect(portraitParams(12345)).toEqual(portraitParams(12345));
    const seen = new Set<string>();
    const skins = new Set<string>();
    const hairs = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = portraitParams(i * 7919 + 3);
      seen.add(JSON.stringify(p));
      skins.add(p.skin);
      hairs.add(p.hair);
      expect(p.head_rx).toBeGreaterThanOrEqual(34);
      expect(p.head_ry).toBeLessThanOrEqual(50);
    }
    expect(seen.size).toBeGreaterThan(250);
    expect(skins.size).toBe(SKIN_TONES.length);
    expect(hairs.size).toBeGreaterThanOrEqual(6);
  });
  test("applicant seed falls back when no document has one", () => {
    expect(applicantPortraitSeed(app())).toBe(1);
    const bare = app({ id_document: null, citizenship_documents: [] });
    expect(applicantPortraitSeed(bare)).toBe(applicantPortraitSeed(bare));
  });
});

describe("fine print decision", () => {
  const MIN = "2025-07-01";
  const sd = (o: Partial<Document>) => doc({ type: "sd_drivers_license", ...o });
  test("SD license: only when issued on or after the date and the marker is true", () => {
    expect(finePrintFor(sd({ issue_date: "2025-06-30", citizenship_verified_marker: true }), MIN)).toBeNull();
    expect(finePrintFor(sd({ issue_date: "2025-07-01", citizenship_verified_marker: true }), MIN)).toEqual({ spot: "back_bottom_left" });
    expect(finePrintFor(sd({ issue_date: "2025-07-01", citizenship_verified_marker: false }), MIN)).toBeNull();
    expect(finePrintFor(sd({ issue_date: "2025-07-01", citizenship_verified_marker: null }), MIN)).toBeNull();
    expect(finePrintFor(sd({ issue_date: null, citizenship_verified_marker: true }), MIN)).toBeNull();
  });
  test("other-state license and ID: only when the marker is true, top left", () => {
    for (const type of ["other_state_drivers_license", "other_state_nondriver_id"] as const) {
      expect(finePrintFor(doc({ type, issuing_jurisdiction: "MN", citizenship_verified_marker: true }), MIN)).toEqual({ spot: "back_top_left" });
      expect(finePrintFor(doc({ type, issuing_jurisdiction: "MN", citizenship_verified_marker: false }), MIN)).toBeNull();
      expect(finePrintFor(doc({ type, issuing_jurisdiction: "MN", citizenship_verified_marker: null }), MIN)).toBeNull();
    }
  });
  test("a tribal ID and every other type never carry it", () => {
    expect(finePrintFor(doc({ type: "tribal_id", citizenship_verified_marker: true }), MIN)).toBeNull();
    for (const type of ["us_passport", "birth_certificate", "residency_declaration", "other_unrecognized"] as const) {
      expect(finePrintFor(doc({ type, citizenship_verified_marker: true, issue_date: "2026-01-01" }), MIN)).toBeNull();
    }
  });
});

describe("SD license back rows", () => {
  const sd = (o: Partial<Document>) => doc({ doc_id: "sd-1", type: "sd_drivers_license", birth_date: "1990-03-04", ...o });
  test("old license: Rev 2019, no citizen row", () => {
    const b = sdBackRows(sd({ issue_date: "2024-01-01", citizenship_verified_marker: false }));
    expect(b.bottom).toEqual(["Rev. 03/01/2019", "RENEWABLE 180 DAYS PRIOR TO EXPIRATION"]);
  });
  test("old license ignores the marker", () => {
    expect(sdBackRows(sd({ issue_date: "2024-01-01", citizenship_verified_marker: true })).bottom).not.toContain("U.S. Citizen");
  });
  test("new license with marker: Rev 2025 plus the citizen row", () => {
    const b = sdBackRows(sd({ issue_date: "2025-09-01", citizenship_verified_marker: true }));
    expect(b.bottom).toEqual(["Rev. 07/01/2025", "U.S. Citizen", "RENEWABLE 180 DAYS PRIOR TO EXPIRATION"]);
  });
  test("new license without marker: Rev 2025, no citizen row", () => {
    for (const m of [false, null]) {
      const b = sdBackRows(sd({ issue_date: "2025-09-01", citizenship_verified_marker: m }));
      expect(b.bottom).toEqual(["Rev. 07/01/2025", "RENEWABLE 180 DAYS PRIOR TO EXPIRATION"]);
    }
  });
  test("middle rows are the same on every SD license", () => {
    expect(sdBackRows(sd({ issue_date: "2025-09-01" })).middle).toEqual([
      "Class: 1 - car/light truck/moped", "Endorsements: none", "Restrictions: none",
    ]);
  });
  test("back birth date is the document's birth date in the front's format", () => {
    expect(sdBackRows(sd({ birth_date: "1990-03-04" })).birth_date).toBe(formatPrinted("1990-03-04"));
    expect(sdBackRows(sd({ birth_date: null })).birth_date).toBeNull();
  });
  test("the digit string is deterministic for a doc_id and varies between ids", () => {
    expect(backDigits("abc")).toBe(backDigits("abc"));
    expect(backDigits("abc")).not.toBe(backDigits("abd"));
    expect(backDigits("abc")).toMatch(/^\d{20}$/);
    expect(sdBackRows(sd({ doc_id: "abc" })).digits).toBe(backDigits("abc"));
  });
});
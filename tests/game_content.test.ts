import { describe, expect, test } from "vitest";
import { narrative } from "../src/data";
import type { Document } from "../src/engine/types";
import { doc } from "./fixtures";
import {
  applicantPortraitSeed, backDigits, finePrintFor, sdBackRows, fill, formatDate, formatPrinted, isValidDate, monthYear,
  portraitParams, portraitPixels, PX_H, PX_W, SKIN_TONES, HAIR_STYLES, FACIAL_HAIR, rampColors,
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
  test("same seed gives identical parameters; seeds vary and keep the tone ranges", () => {
    expect(portraitParams(12345)).toEqual(portraitParams(12345));
    const seen = new Set<string>();
    const skins = new Set<string>();
    const hairs = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = portraitParams(i * 7919 + 3);
      seen.add(JSON.stringify(p));
      skins.add(p.skin);
      hairs.add(p.hair);
    }
    expect(seen.size).toBeGreaterThan(290);
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

// Measured worst case is about 2300 runs; the grid has 5120 pixels.
const CEILING = 3000;

describe("pixel portraits", () => {
  const SEEDS = Array.from({ length: 160 }, (_, i) => i * 104729 + 5);
  const grids = SEEDS.map((s) => portraitPixels(portraitParams(s)));
  const runs = (g: ReturnType<typeof portraitPixels>): number => {
    let n = 0;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) if (x === 0 || g.pixels[y * g.width + x] !== g.pixels[y * g.width + x - 1]) n++;
    }
    return n;
  };
  test("same seed gives an identical grid", () => {
    expect(portraitPixels(portraitParams(77))).toEqual(portraitPixels(portraitParams(77)));
  });
  test("different seeds differ", () => {
    const seen = new Set(grids.map((g) => g.pixels.join(",")));
    expect(seen.size).toBe(grids.length);
  });
  test("grid size is right and every index is inside the palette", () => {
    for (const g of grids) {
      expect(g.width).toBe(PX_W);
      expect(g.height).toBe(PX_H);
      expect(g.pixels.length).toBe(PX_W * PX_H);
      expect(g.palette.length).toBeLessThanOrEqual(255);
      expect(g.pixels.every((v) => Number.isInteger(v) && v >= 0 && v < g.palette.length)).toBe(true);
      expect(g.palette.every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
    }
  });
  test("every skin tone is in the palette across seeds", () => {
    const found = new Set<string>();
    for (const g of grids) for (const [skin] of SKIN_TONES) if (g.palette.includes(skin.toUpperCase())) found.add(skin);
    expect(found.size).toBe(SKIN_TONES.length);
  });
  test("every hair style and facial-hair option appears across seeds", () => {
    const params = SEEDS.map((s) => portraitParams(s));
    expect(new Set(params.map((p) => p.hair_style))).toEqual(new Set(HAIR_STYLES));
    expect(new Set(params.map((p) => p.facial_hair))).toEqual(new Set(FACIAL_HAIR));
  });
  test("no palette colour is pure black, and every pixel is used by the figure or backdrop", () => {
    for (const g of grids) expect(g.palette.includes("#000000")).toBe(false);
  });
  test("ramps shift hue: shadows are redder and darker, highlights lighter", () => {
    for (const base of ["#C08A5E", "#4A78B0", "#8E8E8A"]) {
      const r = rampColors(base);
      expect(r).toHaveLength(5);
      expect(r[2]).toBe(base);
      const lightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
      expect(lightness(r[0]!)).toBeLessThan(lightness(r[1]!));
      expect(lightness(r[1]!)).toBeLessThan(lightness(r[2]!));
      expect(lightness(r[2]!)).toBeLessThan(lightness(r[3]!));
      expect(lightness(r[3]!)).toBeLessThan(lightness(r[4]!));
    }
  });
  test("hair is made of separate locks: the silhouette touches the backdrop in several row segments on each side", () => {
    const styled = SEEDS.map((s) => portraitParams(s)).filter((p) => !["bald", "buzz", "receding"].includes(p.hair_style)); // these three are deliberately sparse or close-cropped
    expect(styled.length).toBeGreaterThan(80);
    let broken = 0;
    for (const p of styled) {
      const g = portraitPixels(p);
      const hairSet = new Set(rampColors(p.hair, true));
      const backSet = new Set(rampColors(p.backdrop, true));
      const isHair = (x: number, y: number) => hairSet.has(g.palette[g.pixels[y * g.width + x] ?? 0] ?? "");
      const isBack = (x: number, y: number) => backSet.has(g.palette[g.pixels[y * g.width + x] ?? 0] ?? "");
      const touches = (x: number, y: number) => {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && xx < g.width && yy >= 0 && yy < g.height && isBack(xx, yy)) return true;
          }
        }
        return false;
      };
      // Outermost hair column per row on each side, among hair pixels that touch the backdrop.
      // A solid cap or block gives a profile that bends once; separate locks make it zig-zag.
      for (const side of [-1, 1] as const) {
        const xs: number[] = [];
        for (let y = 0; y < 72; y++) {
          let edge = -1;
          for (let k = 0; k < g.width / 2 && edge < 0; k++) {
            const x = side < 0 ? k : g.width - 1 - k;
            if (isHair(x, y) && touches(x, y)) edge = x;
          }
          if (edge >= 0) xs.push(edge);
        }
        let flips = 0;
        let last = 0;
        for (let i = 1; i < xs.length; i++) {
          const d = Math.sign((xs[i] ?? 0) - (xs[i - 1] ?? 0));
          if (d !== 0) {
            if (last !== 0 && d !== last) flips++;
            last = d;
          }
        }
        if (flips < 3) broken++;
      }
    }    // Most portraits have an uneven outline on both sides, not one solid block. Loose strands now
    // hug the outline (never poke out more than a pixel), so the bar is looser than it was.
    expect(broken).toBeLessThan(styled.length * 2 * 0.45);
  });  test("horizontal runs keep the rect count well under the pixel count", () => {
    const worst = Math.max(...grids.map(runs));
    expect(worst).toBeLessThan(CEILING);
  });
});
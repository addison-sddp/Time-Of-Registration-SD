import { describe, expect, test } from "vitest";
import { minusYears, monthOf, dateLte } from "../src/engine/dates";
import { namesMatch, normalizeName } from "../src/engine/names";

describe("dates", () => {
  test("minusYears keeps month and day", () => {
    expect(minusYears("2026-06-02", 18)).toBe("2008-06-02");
    expect(minusYears("2026-06-23", 18)).toBe("2008-06-23");
  });
  test("monthOf", () => expect(monthOf("2026-04-01")).toBe("2026-04"));
  test("dateLte compares calendar order", () => {
    expect(dateLte("2008-06-02", "2008-06-02")).toBe(true);
    expect(dateLte("2008-06-03", "2008-06-02")).toBe(false);
    expect(dateLte("2007-12-31", "2008-01-01")).toBe(true);
  });
});

describe("names", () => {
  test("case, whitespace and punctuation are ignored", () => {
    expect(namesMatch("Mary-Ann  O'Neil", "mary ann oneil")).toBe(false);
    expect(namesMatch("Mary Ann O'Neil", "  MARY  ANN   ONEIL ")).toBe(true);
    expect(namesMatch("J. Q. Public", "J Q Public")).toBe(true);
  });
  test("initials and nicknames mismatch", () => {
    expect(namesMatch("Jane Public", "J Public")).toBe(false);
    expect(namesMatch("Robert Smith", "Bob Smith")).toBe(false);
  });
  test("null and empty never match", () => {
    expect(namesMatch(null, "A")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
    expect(namesMatch("...", "!!!")).toBe(false);
  });
  test("normalizeName", () => expect(normalizeName("  A.B   C ")).toBe("ab c"));
});

import { describe, expect, test } from "vitest";
import { shifts } from "../src/data";
import { activeRuleIds } from "../src/gen";
import { rules } from "../src/rules";
import { bulletinEntries, newRuleIds, NO_NEW_RULES_LINE, rulebookEntries } from "../src/game/ruletext";

const all = ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"];
const activeOn = (date: string): string[] => activeRuleIds(rules, date, { mode: "calendar" });
const text = (e: { title: string; body: string[] }[]): string => e.map((x) => `${x.title}\n${x.body.join("\n")}`).join("\n");

describe("rulebook text", () => {
  test("no rule ids or Rule R headings, no placeholders, nothing empty", () => {
    for (const ids of [all, ["R1_AGE", "R2_RESIDENCY"], ["R1_AGE"], []]) {
      for (const e of rulebookEntries(ids)) {
        expect(e.title.trim()).not.toBe("");
        expect(e.body.length).toBeGreaterThan(0);
        for (const s of [e.title, ...e.body]) {
          expect(s.trim()).not.toBe("");
          expect(s).not.toMatch(/R\d_[A-Z]+/);
          expect(s).not.toMatch(/Rule R\d/);
          expect(s).not.toMatch(/[{}]/);
        }
      }
    }
  });

  test("entries are all active rules in stable order", () => {
    expect(rulebookEntries(["R3_CITIZENSHIP", "R1_AGE"]).map((e) => e.rule_id)).toEqual(["R1_AGE", "R3_CITIZENSHIP"]);
    expect(rulebookEntries([])).toEqual([]);
  });

  test("age text mentions citizenship documents only when R3 is active", () => {
    const without = text(rulebookEntries(["R1_AGE", "R2_RESIDENCY"])).toLowerCase();
    expect(without).not.toContain("citizenship");
    const withR3 = rulebookEntries(all).find((e) => e.rule_id === "R1_AGE");
    expect(withR3?.body.join(" ").toLowerCase()).toContain("citizenship document");
  });

  test("R3 prints the tribe list from rule data and the SD line as worded", () => {
    const r3 = rulebookEntries(all).find((e) => e.rule_id === "R3_CITIZENSHIP");
    const body = r3?.body.join("\n") ?? "";
    expect(body).toContain('A South Dakota driver license that reads "U.S. Citizen" on the back.');
    expect(body).toContain("Oglala Sioux Tribe");
  });

  test("the 30-day clause never appears", () => {
    expect(text(rulebookEntries(all)).toLowerCase()).not.toMatch(/30[- ]day|thirty/);
    for (const s of shifts) expect(text(bulletinEntries(s.shift_id, activeOn(s.shift_date), "calendar")).toLowerCase()).not.toMatch(/30[- ]day|thirty/);
  });
});

describe("new rules per shift", () => {
  const expected: Record<string, string[]> = { s01: ["R1_AGE", "R2_RESIDENCY"], s07: ["R3_CITIZENSHIP"] };
  test.each(shifts.map((s) => s.shift_id))("%s", (id) => {
    const s = shifts.find((x) => x.shift_id === id)!;
    const act = activeOn(s.shift_date);
    expect(newRuleIds(id, act, "calendar")).toEqual(expected[id] ?? []);
    expect(bulletinEntries(id, act, "calendar").map((e) => e.rule_id)).toEqual(expected[id] ?? []);
  });

  test("sandbox shows every active rule", () => {
    expect(newRuleIds("s01", all, "sandbox")).toEqual(all);
    expect(bulletinEntries("s05", all, "sandbox")).toHaveLength(3);
  });

  test("the no-new-rules line exists", () => expect(NO_NEW_RULES_LINE.length).toBeGreaterThan(0));
});

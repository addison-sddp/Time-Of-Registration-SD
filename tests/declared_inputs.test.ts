import { describe, expect, test } from "vitest";
import { rules } from "../src/rules";
import { calendar } from "../src/data";
import { lookupElection } from "../src/engine/calendar";
import type { Application } from "../src/engine/types";
import { app, doc, residency } from "./fixtures";

// Records every property path read through the proxy; array indexes become "[]".
function recorder(target: Application): { proxied: Application; seen: Set<string> } {
  const seen = new Set<string>();
  const wrap = <T extends object>(obj: T, path: string): T =>
    new Proxy(obj, {
      get(t, key, receiver) {
        const value = Reflect.get(t, key, receiver);
        if (typeof key === "symbol") return value;
        if (Array.isArray(t)) {
          if (!/^\d+$/.test(key)) return value; // length, map, some, ...
          return descend(value, `${path}[]`);
        }
        return descend(value, `${path}.${key}`);
      },
    });
  const descend = (value: unknown, path: string): unknown => {
    seen.add(path);
    return value !== null && typeof value === "object" ? wrap(value, path) : value;
  };
  return { proxied: wrap(structuredClone(target), "application"), seen };
}

const variants: Application[] = [
  app(),
  app({ id_document: null }),
  app({ declared_birth_date: "2010-01-01", id_document: doc({ birth_date: "2010-01-01" }) }),
  app({ declared_birth_date: "1991-01-01" }),
  app({ residency_declaration: residency({ address_state: "MN" }) }),
  app({ residency_declaration: residency({ address_line: "" }) }),
  app({ citizenship_documents: [] }),
  app({ citizenship_documents: [doc({ is_photocopy: true }), doc({ type: "tribal_id", issuing_jurisdiction: "tribe:x" })] }),
  app({ citizenship_documents: [doc({ type: "us_passport", expiry_date: "2020-01-01" }), doc({ type: "other_state_nondriver_id", issuing_jurisdiction: "MN", citizenship_verified_marker: true })] }),
  app({ citizenship_documents: [doc({ name: "Other Person" })] }),
];

describe("declared inputs", () => {
  for (const rule of rules) {
    test(`${rule.id} reads only fields listed in applies_to`, () => {
      const declared = new Set(rule.applies_to);
      // Reading a container on the way to a declared field is allowed.
      const allowed = (p: string): boolean =>
        declared.has(p) || rule.applies_to.some((d) => d.startsWith(`${p}.`) || d.startsWith(`${p}[]`));
      const found = lookupElection(calendar, "2026-05-01");
      if (!found.ok) throw new Error("no election");
      const reads = new Set<string>();
      for (const v of variants) {
        const { proxied, seen } = recorder(v);
        rule.check({ application: proxied, as_of: "2026-05-01", next_election: found.entry }, rule.params);
        seen.forEach((p) => reads.add(p));
      }
      expect([...reads].filter((p) => !allowed(p))).toEqual([]);
      expect(reads.size).toBeGreaterThan(0);
    });
  }

  test("the recorder detects an undeclared read", () => {
    const { proxied, seen } = recorder(app());
    void proxied.residency_declaration.address_city;
    expect(seen.has("application.residency_declaration.address_city")).toBe(true);
  });
});

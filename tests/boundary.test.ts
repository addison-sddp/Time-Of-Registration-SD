import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = join(__dirname, "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const forbidden: [string, RegExp][] = [
  ["import from ui/", /from\s+["'][^"']*\bui\//],
  ["window", /\bwindow\b/],
  ["document global", /\bdocument\./],
  ["localStorage", /\blocalStorage\b/],
  ["Math.random", /Math\.random/],
  ["Date.now", /Date\.now/],
];

describe("import boundary", () => {
  // The save layer gets its storage injected, so only the storage-global pattern is exempt there.
  const exempt: Record<string, string[]> = { save: ["localStorage"] };
  for (const dir of ["engine", "rules", "data", "gen", "save", "game"]) {
    for (const file of files(join(ROOT, dir))) {
      test(`${dir}/${basename(file)}`, () => {
        const text = readFileSync(file, "utf8");
        const skip = exempt[dir] ?? [];
        const hits = forbidden
          .filter(([n, re]) => !skip.includes(n) && re.test(text))
          .map(([n]) => n);
        expect(hits).toEqual([]);
      });
    }
  }
  test("scan finds source files", () => {
    expect(files(join(ROOT, "engine")).length).toBeGreaterThan(3);
  });
});

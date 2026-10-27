import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
  for (const dir of ["engine", "rules", "data"]) {
    for (const file of files(join(ROOT, dir))) {
      test(`${dir}/${file.split("/").pop()}`, () => {
        const text = readFileSync(file, "utf8");
        const hits = forbidden.filter(([, re]) => re.test(text)).map(([n]) => n);
        expect(hits).toEqual([]);
      });
    }
  }
  test("scan finds source files", () => {
    expect(files(join(ROOT, "engine")).length).toBeGreaterThan(3);
  });
});

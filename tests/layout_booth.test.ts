import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// Static checks on the stylesheet: fixed-stage geometry for the booth signs, and no selectable text.
const css = readFileSync("src/ui/style.css", "utf8") + readFileSync("src/ui/flow.css", "utf8");

function box(selector: string): Record<string, number> {
  const start = css.indexOf(`${selector} {`);
  const body = start < 0 ? "" : css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, number> = {};
  for (const [, k, v] of body.matchAll(/(?:^|[\s;])(left|top|width|height):\s*(-?\d+)px/g)) out[k as string] = Number(v);
  return out;
}

describe("booth layout", () => {
  const election = { ...box(".sign"), ...box(".sign-election") };
  const born = { ...box(".sign"), ...box(".sign-born") };
  const next = box(".next-wrap");
  const frame = box(".booth-frame");

  test("signs sit right of the glass, above the Next applicant button, without overlap", () => {
    expect(election.left).toBeGreaterThanOrEqual((frame.left ?? 0) + (frame.width ?? 0));
    expect(election.top! + election.height!).toBeLessThanOrEqual(born.top!);
    expect(born.top! + born.height!).toBeLessThanOrEqual(next.top!);
    expect(election.left! + election.width!).toBeLessThanOrEqual(box(".hud").left!);
  });

  test("desk items cannot be selected, text entry can", () => {
    expect(css).toMatch(/#stage \*[^}]*user-select: none/);
    expect(css).toMatch(/-moz-user-select: none/);
    expect(css).toMatch(/#stage textarea, #stage input[^}]*user-select: text/);
    expect(css).not.toMatch(/^[^#\n]*\.(letter|sheet)[^{]*\{[^}]*user-select: text/m);
  });
});

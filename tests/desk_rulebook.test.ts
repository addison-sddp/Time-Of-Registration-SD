import { describe, expect, test } from "vitest";
import { shouldOpenOnClick } from "../src/ui/rulebook";

describe("rulebook open/close click rule", () => {
  test("a click on the closed cover opens it", () => {
    expect(shouldOpenOnClick(false, false, 0)).toBe(true);
  });
  test("the close button's click bubbling to the element does not reopen the book", () => {
    // The button handler closes the book first (open becomes false), then the click reaches the element.
    expect(shouldOpenOnClick(false, true, 0)).toBe(false);
  });
  test("a drag does not open it, and an open book stays as it is", () => {
    expect(shouldOpenOnClick(false, false, 40)).toBe(false);
    expect(shouldOpenOnClick(true, false, 0)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFader } from "../src/ui/transitions";

describe("fader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const make = (reduced = false) =>
    createFader({
      reduced: () => reduced,
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      veil: () => {},
      ms: 600,
    });

  it("drops a button press mid-fade but queues a completion swap", () => {
    const f = make();
    const log: string[] = [];
    expect(f.run(() => log.push("a"))).toBe(true);
    expect(f.run(() => log.push("b"), { dropIfBusy: true })).toBe(false);
    expect(f.run(() => log.push("summary"))).toBe(true);
    vi.advanceTimersByTime(600);
    expect(log).toEqual(["a"]);
    vi.advanceTimersByTime(600 + 600);
    expect(log).toEqual(["a", "summary"]);
    vi.advanceTimersByTime(5000);
    expect(f.run(() => log.push("c"), { dropIfBusy: true })).toBe(true);
  });

  it("runs immediately under reduced motion", () => {
    const f = make(true);
    let n = 0;
    f.run(() => n++, { dropIfBusy: true });
    f.run(() => n++, { dropIfBusy: true });
    expect(n).toBe(2);
  });
});

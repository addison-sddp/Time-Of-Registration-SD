import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUE_GAP_MAX_S, CUE_GAP_MIN_S, createCueScheduler, cueGapSeconds, ignitionPlan, shouldIgnite,
  type ActiveCue,
} from "../src/ui/audio_sched";

describe("cue gap", () => {
  it("stays within 35-90 s", () => {
    expect(cueGapSeconds(() => 0)).toBe(CUE_GAP_MIN_S);
    expect(cueGapSeconds(() => 0.9999999)).toBeLessThanOrEqual(CUE_GAP_MAX_S);
    for (let i = 0; i < 100; i++) {
      const g = cueGapSeconds(() => i / 100);
      expect(g).toBeGreaterThanOrEqual(35);
      expect(g).toBeLessThanOrEqual(90);
    }
  });
});

describe("cue scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function make(durations: number[]) {
    let live = 0;
    let maxLive = 0;
    let starts = 0;
    const cancelled: number[] = [];
    const sched = createCueScheduler({
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      random: () => 0, // gap is always 35 s
      play: () => {
        const dur = durations[starts % durations.length] ?? 1;
        const idx = starts++;
        live++;
        maxLive = Math.max(maxLive, live);
        setTimeout(() => { live--; }, dur * 1000);
        const cue: ActiveCue = { duration: dur, cancel: () => { cancelled.push(idx); live--; } };
        return cue;
      },
    });
    return { sched, stats: () => ({ starts, maxLive, cancelled }) };
  }

  it("waits the gap, never overlaps, and measures the gap from the cue's end", () => {
    const { sched, stats } = make([8]);
    sched.start();
    vi.advanceTimersByTime(34_999);
    expect(stats().starts).toBe(0);
    vi.advanceTimersByTime(2);
    expect(stats().starts).toBe(1);
    expect(sched.cueActive).toBe(true);
    // cue ends at 43 s; next may not start before 43 + 35 = 78 s
    vi.advanceTimersByTime(42_000); // t = 77 s
    expect(stats().starts).toBe(1);
    vi.advanceTimersByTime(2_000); // t = 79 s
    expect(stats().starts).toBe(2);
    vi.advanceTimersByTime(600_000);
    expect(stats().maxLive).toBe(1);
  });

  it("start() twice still means one scheduler", () => {
    const { sched, stats } = make([2]);
    sched.start();
    sched.start();
    sched.start();
    vi.advanceTimersByTime(36_000);
    expect(stats().starts).toBe(1);
  });

  it("stop() clears the timer and cancels a sounding cue", () => {
    const { sched, stats } = make([10]);
    sched.start();
    vi.advanceTimersByTime(36_000);
    expect(sched.cueActive).toBe(true);
    sched.stop();
    expect(stats().cancelled).toEqual([0]);
    expect(sched.running).toBe(false);
    vi.advanceTimersByTime(1_000_000);
    expect(stats().starts).toBe(1);
  });

  it("restart after stop gives a fresh single scheduler", () => {
    const { sched, stats } = make([2]);
    sched.start();
    sched.stop();
    sched.start();
    vi.advanceTimersByTime(36_000);
    expect(stats().starts).toBe(1);
  });

  it("a null play (muted) just re-arms the gap", () => {
    let n = 0;
    const sched = createCueScheduler({
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      random: () => 0,
      play: () => { n++; return null; },
    });
    sched.start();
    vi.advanceTimersByTime(36_000 * 3);
    expect(n).toBe(3);
  });
});

describe("ignition", () => {
  it("is requested only for Continue to a new calendar shift", () => {
    expect(shouldIgnite(false, false)).toBe(true);
    expect(shouldIgnite(true, false)).toBe(false); // sandbox exit
    expect(shouldIgnite(false, true)).toBe(false); // return to title
  });
  it("plans 2-4 cranks and 2.5-3.5 s", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const p = ignitionPlan(i / 20, i / 20);
      seen.add(p.cranks);
      expect(p.cranks).toBeGreaterThanOrEqual(2);
      expect(p.cranks).toBeLessThanOrEqual(4);
      expect(p.total).toBeGreaterThanOrEqual(2.5);
      expect(p.total).toBeLessThan(3.5);
      expect(p.catchAt).toBeLessThan(p.total - 1);
    }
    expect(seen.size).toBe(3);
  });
});

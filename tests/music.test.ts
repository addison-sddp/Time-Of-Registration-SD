import { describe, expect, test } from "vitest";
import {
  MENU_SCORE, loopSeconds, schedule, startCursor, stepTime, stepsPerBar, takeDue, totalSteps,
} from "../src/game/music";

describe("menu score", () => {
  test("loop is a whole number of bars within 8-16", () => {
    expect(Number.isInteger(MENU_SCORE.bars)).toBe(true);
    expect(MENU_SCORE.bars).toBeGreaterThanOrEqual(8);
    expect(MENU_SCORE.bars).toBeLessThanOrEqual(16);
    expect(totalSteps(MENU_SCORE) % stepsPerBar(MENU_SCORE)).toBe(0);
    const barSeconds = (MENU_SCORE.beatsPerBar * 60) / MENU_SCORE.bpm;
    // Swing moves the "ands" but never the downbeat of a pair, so bar lengths stay exact.
    expect(loopSeconds(MENU_SCORE) / barSeconds).toBeCloseTo(MENU_SCORE.bars, 9);
    expect(MENU_SCORE.bpm).toBeGreaterThanOrEqual(92);
    expect(MENU_SCORE.bpm).toBeLessThanOrEqual(104);
  });

  test("every note sits within its channel range and the loop", () => {
    const total = totalSteps(MENU_SCORE);
    for (const n of MENU_SCORE.notes) {
      const ch = MENU_SCORE.channels.find((c) => c.id === n.ch);
      expect(ch, n.ch).toBeDefined();
      if (ch === undefined) continue;
      expect(n.midi, `${n.ch}@${n.step}`).toBeGreaterThanOrEqual(ch.min);
      expect(n.midi, `${n.ch}@${n.step}`).toBeLessThanOrEqual(ch.max);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.len).toBeGreaterThan(0);
      expect(n.step + n.len, `${n.ch}@${n.step}`).toBeLessThanOrEqual(total);
      expect(n.vel).toBeGreaterThan(0);
      expect(n.vel).toBeLessThanOrEqual(1);
    }
  });

  test("the score and its schedule are deterministic", () => {
    const again = JSON.stringify(schedule(MENU_SCORE));
    expect(JSON.stringify(schedule(MENU_SCORE))).toBe(again);
    expect(JSON.stringify(MENU_SCORE.notes)).toBe(JSON.stringify([...MENU_SCORE.notes]));
    const times = schedule(MENU_SCORE).map((e) => e.time);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test("no overlapping notes on monophonic channels", () => {
    for (const ch of MENU_SCORE.channels.filter((c) => c.mono)) {
      const notes = MENU_SCORE.notes.filter((n) => n.ch === ch.id).sort((a, b) => a.step - b.step);
      expect(notes.length, ch.id).toBeGreaterThan(0);
      for (let i = 1; i < notes.length; i++) {
        const prev = notes[i - 1];
        const cur = notes[i];
        if (prev === undefined || cur === undefined) continue;
        expect(prev.step + prev.len, `${ch.id} at step ${cur.step}`).toBeLessThanOrEqual(cur.step);
      }
    }
  });

  test("swing delays only the off-beat eighths", () => {
    expect(stepTime(MENU_SCORE, 0)).toBe(0);
    const eighth = 60 / MENU_SCORE.bpm / 2;
    expect(stepTime(MENU_SCORE, 2)).toBeCloseTo(2 * eighth, 9);
    expect(stepTime(MENU_SCORE, 1)).toBeGreaterThan(eighth);
  });

  test("cursor hands out notes in order and wraps at the loop end", () => {
    const events = schedule(MENU_SCORE);
    const len = loopSeconds(MENU_SCORE);
    const cur = startCursor(10);
    const first = takeDue(events, len, cur, 10 + len * 2.5);
    expect(first.length).toBeGreaterThan(events.length * 2);
    const ats = first.map((e) => e.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(first[events.length]?.at).toBeCloseTo(10 + len + (events[0]?.time ?? 0), 9);
  });
});

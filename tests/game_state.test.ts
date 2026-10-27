import { describe, expect, test } from "vitest";
import { calendar, economy, narrative, shifts } from "../src/data";
import { evaluate } from "../src/engine/evaluate";
import {
  acknowledgeNotice, currentApplicant, isFinalShift, saveFromState, startCalendarShift,
  startSandboxShift, type GameState,
} from "../src/game";
import { generateShift } from "../src/gen";
import { rules } from "../src/rules";
import { newSave, type Decision } from "../src/save";
import { decide } from "./flow_helpers";

const SALT = "unit-salt";
const save = () => newSave(SALT, "2026-01-01T00:00:00Z");

function begin(shift_id = "s01", over: Partial<ReturnType<typeof save>["progress"]> = {}): GameState {
  const s = save();
  s.progress = { ...s.progress, current_shift_id: shift_id, ...over };
  const r = startCalendarShift(s);
  if (!r.ok) throw new Error("start failed");
  return r.state;
}

// What the engine says about the applicant at the counter.
function verdictOf(s: GameState): Decision {
  const a = currentApplicant(s)!;
  const r = evaluate(a.application, s.as_of, calendar, rules, s.activation);
  if (!r.ok) throw new Error("engine error");
  return r.value.verdict;
}
const right = (s: GameState): Decision => verdictOf(s);
const wrong = (s: GameState): Decision => (verdictOf(s) === "approve" ? "deny" : "approve");

function playAll(s: GameState, pick: (s: GameState) => Decision): GameState {
  let cur = s;
  while (cur.status === "in_progress" && cur.restart_notice === null) cur = decide(cur, pick(cur));
  return cur;
}

describe("shift start", () => {
  test("calendar start reads the save and uses the shift-start balance", () => {
    const s = save();
    s.progress.current_shift_id = "s03";
    s.progress.attempt_number = 2;
    s.economy = { balance: 40, balance_at_shift_start: 30 };
    const r = startCalendarShift(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.shift.shift_id).toBe("s03");
    expect(r.state.attempt_number).toBe(2);
    expect(r.state.balance).toBe(30);
    expect(r.state.balance_at_shift_start).toBe(30);
    expect(r.state.applicants.length).toBeGreaterThanOrEqual(5);
    expect(r.state.index).toBe(0);
  });

  test("applicants equal generateShift ordered content", () => {
    const st = begin("s02");
    const gen = generateShift(SALT, shifts[1]!);
    expect(st.content.map((a) => a.application.application_id)).toEqual(gen.map((a) => a.application.application_id));
  });

  test("sandbox rejects a date with no election and a malformed date", () => {
    const base = { save_salt: SALT, shift_id: "s01", rule_ids: ["R1_AGE"], attempt_number: 1 };
    const none = startSandboxShift({ ...base, as_of: "2030-01-01" });
    expect(none).toEqual({ ok: false, message: "No election date is configured for this date." });
    const bad = startSandboxShift({ ...base, as_of: "2026-13-40" });
    expect(bad.ok).toBe(false);
  });

  test("sandbox activates exactly the listed rules, ignoring introduced_month", () => {
    const r = startSandboxShift({ save_salt: SALT, shift_id: "s01", as_of: "2025-10-01", rule_ids: ["R3_CITIZENSHIP"], attempt_number: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.activation).toEqual({ mode: "sandbox", rule_ids: ["R3_CITIZENSHIP"] });
  });
});

describe("decide", () => {
  test("a correct decision pays income, adds a ledger line and advances", () => {
    const s0 = begin();
    const dec = right(s0);
    const s1 = decide(s0, dec);
    expect(s1.balance).toBe(economy.income_per_correct_decision);
    expect(s1.correct).toBe(1);
    expect(s1.errors).toBe(0);
    expect(s1.index).toBe(1);
    expect(s1.note).toBeNull();
    expect(s1.ledger).toEqual([`Application 1: ${dec === "approve" ? "approved" : "denied"}`]);
  });

  test("an error costs the penalty, counts, and writes a procedural note", () => {
    let s = begin();
    s = decide(s, right(s)); // +7
    s = decide(s, right(s)); // +7
    const dec = wrong(s);
    const s1 = decide(s, dec);
    expect(s1.errors).toBe(1);
    expect(s1.balance).toBe(14 - economy.penalty_per_error);
    expect(s1.index).toBe(3);
    if (dec === "approve") {
      expect(s1.note).toMatch(/^Application 3 approved\. Condition not met: Rule R\d_[A-Z]+(, Rule R\d_[A-Z]+)*\.$/);
    } else {
      expect(s1.note).toBe("Application 3 denied. All active rules satisfied.");
    }
  });

  test("balance never falls below the floor", () => {
    const s0 = begin();
    const s1 = decide(s0, wrong(s0));
    expect(s1.errors).toBe(1);
    expect(s1.balance).toBe(economy.minimum_balance);
  });

  test("an approve error names every violated rule", () => {
    // Find a deny-verdict applicant in the shipped shifts and approve it.
    for (const sh of shifts) {
      let s = begin(sh.shift_id);
      while (s.status === "in_progress") {
        if (verdictOf(s) === "deny") {
          const a = currentApplicant(s)!;
          const r = evaluate(a.application, s.as_of, calendar, rules, s.activation);
          const ids = r.ok ? r.value.violated_rule_ids : [];
          const after = decide(s, "approve");
          expect(after.note).toBe(`Application ${s.index + 1} approved. Condition not met: ${ids.map((i) => `Rule ${i}`).join(", ")}.`);
          return;
        }
        s = decide(s, right(s));
      }
    }
    throw new Error("no deny applicant found");
  });

  test("three errors restart the shift and restore the shift-start balance", () => {
    const start = begin("s02");
    let s = decide(start, right(start));
    s = decide(s, right(s));
    expect(s.balance).toBe(14);
    for (let i = 0; i < 3; i++) s = decide(s, wrong(s));
    expect(s.restart_notice).toBe("Shift not completed. Errors: 3.");
    expect(s.attempt_number).toBe(2);
    expect(s.balance).toBe(start.balance_at_shift_start);
    expect(s.errors).toBe(0);
    expect(s.correct).toBe(0);
    expect(s.index).toBe(0);
    expect(s.ledger).toEqual([]);
    expect(s.status).toBe("in_progress");
    expect(s.completed_shift_ids).toEqual([]);
    // The notice must be acknowledged before the next decision counts.
    expect(decide(s, "approve")).toBe(s);
    const ack = acknowledgeNotice(s);
    expect(ack.restart_notice).toBeNull();
    expect(decide(ack, right(ack)).correct).toBe(1);
  });

  test("restart keeps the balance carried into the shift", () => {
    const s = save();
    s.progress.current_shift_id = "s02";
    s.economy = { balance: 50, balance_at_shift_start: 50 };
    const r = startCalendarShift(s);
    if (!r.ok) throw new Error("start");
    let st = decide(r.state, right(r.state));
    expect(st.balance).toBe(57);
    for (let i = 0; i < 3; i++) st = decide(st, wrong(st));
    expect(st.balance).toBe(50);
  });

  test("restart order differs but content is the same; pinned applicants stay", () => {
    const start = begin("s05");
    const pinned = start.content.findIndex((a) => a.pinned_position !== undefined);
    expect(pinned).toBeGreaterThanOrEqual(0);
    const ids = (s: GameState) => s.applicants.map((a) => a.application.application_id);
    const sorted = (s: GameState) => [...ids(s)].sort();
    let s = start;
    const orders = new Set<string>([ids(s).join()]);
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 3; i++) s = decide(s, wrong(s));
      s = acknowledgeNotice(s);
      expect(sorted(s)).toEqual(sorted(start));
      expect(s.content).toEqual(start.content);
      expect(s.applicants[3]?.dialogue_key).toBe("applicant.s05.thirty_day");
      orders.add(ids(s).join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  test("finishing a shift gives a plain summary and appends progress", () => {
    const start = begin("s01");
    const n = start.applicants.length;
    // All correct except the last decision.
    let s = start;
    for (let i = 0; i < n - 1; i++) s = decide(s, right(s));
    s = decide(s, wrong(s));
    expect(s.status).toBe("complete");
    expect(s.summary).toEqual({
      processed: n,
      correct: n - 1,
      errors: 1,
      reasons_not_confirmed: 0,
      earnings: 7 * (n - 1) - 12,
    });
    expect(s.balance).toBe(7 * (n - 1) - 12);
    expect(s.completed_shift_ids).toEqual(["s01"]);
    expect(currentApplicant(s)).toBeNull();
  });

  test("a finished shift keeps its penalties", () => {
    const start = begin("s01");
    const n = start.applicants.length;
    let s = start;
    for (let i = 0; i < n; i++) s = decide(s, i < 2 ? wrong(s) : right(s));
    expect(s.status).toBe("complete");
    expect(s.summary?.errors).toBe(2);
    expect(s.summary?.earnings).toBe(7 * (n - 2));
    expect(s.balance).toBe(7 * (n - 2));
  });

  test("decide does nothing after the shift is complete", () => {
    const done = playAll(begin("s01"), right);
    expect(decide(done, "approve")).toBe(done);
  });

  test("engine error shows the neutral message and counts nothing", () => {
    const s0 = { ...begin(), as_of: "2030-01-01" };
    const s1 = decide(s0, "approve");
    expect(s1.note).toBe("No election date is configured for this date.");
    expect(s1.errors).toBe(0);
    expect(s1.balance).toBe(s0.balance);
    expect(s1.index).toBe(0);
    expect(s1.ledger).toEqual([]);
    expect(s1.decision_log).toEqual([]);
  });
});

describe("decision log and save", () => {
  test("calendar decisions are logged with engine verdict and attempt", () => {
    let s = begin("s07");
    const a0 = currentApplicant(s)!;
    const dec = wrong(s);
    const r = evaluate(a0.application, s.as_of, calendar, rules, s.activation);
    if (!r.ok) throw new Error("engine");
    s = decide(s, dec);
    expect(s.decision_log).toHaveLength(1);
    expect(s.decision_log[0]).toMatchObject({
      shift_id: "s07",
      application_id: a0.application.application_id,
      as_of: "2026-04-01",
      player_decision: dec,
      engine_verdict: r.value.verdict,
      violated_rule_ids: r.value.violated_rule_ids,
      attempt_number: 1,
    });
  });

  test("a completed shift advances the save; mid-shift stores the shift-start balance", () => {
    const start = begin("s01");
    const mid = decide(start, right(start));
    const midSave = saveFromState(save(), mid);
    expect(midSave.progress).toEqual({ current_shift_id: "s01", completed_shift_ids: [], attempt_number: 1 });
    expect(midSave.economy).toEqual({ balance: 0, balance_at_shift_start: 0 });
    expect(midSave.decision_log).toHaveLength(1);

    const done = playAll(start, right);
    const doneSave = saveFromState(save(), done);
    expect(doneSave.progress.current_shift_id).toBe("s02");
    expect(doneSave.progress.completed_shift_ids).toEqual(["s01"]);
    expect(doneSave.progress.attempt_number).toBe(1);
    expect(doneSave.economy.balance).toBe(done.balance);
    expect(doneSave.economy.balance_at_shift_start).toBe(done.balance);
    expect(doneSave.decision_log).toHaveLength(done.applicants.length);
  });

  test("a restart saves the new attempt number and the restored balance", () => {
    let s = begin("s02");
    for (let i = 0; i < 3; i++) s = decide(s, wrong(s));
    const out = saveFromState(save(), s);
    expect(out.progress.attempt_number).toBe(2);
    expect(out.progress.current_shift_id).toBe("s02");
    expect(out.economy.balance).toBe(0);
  });

  test("a saved restart resumes at the same attempt and order", () => {
    let s = begin("s02");
    for (let i = 0; i < 3; i++) s = decide(s, wrong(s));
    const resumed = startCalendarShift(saveFromState(save(), s));
    if (!resumed.ok) throw new Error("start");
    expect(resumed.state.applicants.map((a) => a.application.application_id))
      .toEqual(s.applicants.map((a) => a.application.application_id));
  });

  test("s10 completion is recorded and the save stays on the final shift", () => {
    expect(isFinalShift("s10")).toBe(true);
    expect(isFinalShift("s09")).toBe(false);
    const done = playAll(begin("s10"), right);
    expect(done.status).toBe("complete");
    expect(done.completed_shift_ids).toContain("s10");
    const out = saveFromState(save(), done);
    expect(out.progress.completed_shift_ids).toContain("s10");
    expect(out.progress.current_shift_id).toBe("s10");
  });

  test("sandbox sessions never write progress, economy or decision_log", () => {
    const r = startSandboxShift({ save_salt: SALT, shift_id: "s09", as_of: "2026-06-01", rule_ids: ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"], attempt_number: 3 });
    if (!r.ok) throw new Error("start");
    expect(r.state.attempt_number).toBe(3);
    const done = playAll(r.state, (s) => (s.index % 2 === 0 ? right(s) : wrong(s)));
    expect(done.decision_log).toEqual([]);
    expect(done.completed_shift_ids).toEqual([]);
    const base = save();
    const frozen = JSON.stringify(base);
    const out = saveFromState(base, done.status === "complete" ? done : r.state);
    expect(JSON.stringify(out)).toBe(frozen);
    expect(JSON.stringify(saveFromState(base, r.state))).toBe(frozen);
  });
});

describe("thirty-day applicant", () => {
  test("s05 has one scripted applicant that evaluates to approve in calendar mode", () => {
    const s05 = shifts.find((s) => s.shift_id === "s05")!;
    const content = generateShift(SALT, s05);
    const thirty = content.filter((a) => a.dialogue_key === "applicant.s05.thirty_day");
    expect(thirty).toHaveLength(1);
    const r = evaluate(thirty[0]!.application, s05.shift_date, calendar, rules, { mode: "calendar" });
    expect(r.ok && r.value.verdict).toBe("approve");
    expect(r.ok && r.value.violated_rule_ids).toEqual([]);
  });

  test("it also approves with every rule active in sandbox mode", () => {
    const s05 = shifts.find((s) => s.shift_id === "s05")!;
    const a = s05.scripted_applicants![0]!;
    const r = evaluate(a.application, s05.shift_date, calendar, rules, {
      mode: "sandbox",
      rule_ids: ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"],
    });
    expect(r.ok && r.value.verdict).toBe("approve");
  });

  test("its dialogue is an unwritten placeholder in the narrative file", () => {
    expect("applicant.s05.thirty_day" in narrative.dialogue).toBe(true);
    expect(narrative.dialogue["applicant.s05.thirty_day"]).toBeNull();
  });

  test("no other shift carries a scripted applicant", () => {
    expect(shifts.filter((s) => s.scripted_applicants !== undefined).map((s) => s.shift_id)).toEqual(["s05"]);
  });
});

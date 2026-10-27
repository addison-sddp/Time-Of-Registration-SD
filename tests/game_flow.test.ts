import { describe, expect, test } from "vitest";
import { economy, shifts } from "../src/data";
import {
  acknowledgeNotice, backToReasons, callNext, canCallNext, cancelDenial, chooseReason, chooseSource, currentApplicant,
  deliverBulletin, fileForm, findReason, reasonCatalog, saveFromState, startCalendarShift, startDenial, startSandboxShift,
  stampApprove, stampDenied, validSources, activeRules, type GameState,
} from "../src/game";
import { newSave, type Decision } from "../src/save";
import { approve, choiceFor, decide, deny, ready, verdictOf, type DenyPlan } from "./flow_helpers";

const ALL = ["R1_AGE", "R2_RESIDENCY", "R3_CITIZENSHIP"];

function calendarShift(shift_id = "s01"): GameState {
  const s = newSave("flow-salt", "2026-01-01T00:00:00Z");
  s.progress.current_shift_id = shift_id;
  const r = startCalendarShift(s);
  if (!r.ok) throw new Error("start");
  return r.state;
}

// A sandbox shift (all rules) whose applicant list has at least `min` of the wanted verdict.
function sandboxWith(min: number, want: Decision = "deny", need: (s: GameState) => boolean = () => true): GameState {
  for (let i = 0; i < 300; i++) {
    for (const sh of shifts) {
      const r = startSandboxShift({ save_salt: `flow-${i}`, shift_id: sh.shift_id, as_of: sh.shift_date, rule_ids: ALL, attempt_number: 1 });
      if (!r.ok) continue;
      let count = 0;
      let cur = r.state;
      for (let k = 0; k < cur.applicants.length; k++) {
        const at: GameState = { ...cur, index: k };
        if (verdictOf(at).verdict === want) count++;
      }
      if (count >= min && need(r.state)) return r.state;
    }
  }
  throw new Error("no shift");
}

// Move to the first applicant for whom pick() is true, deciding the others correctly.
function advanceTo(s: GameState, pick: (s: GameState) => boolean): GameState {
  let cur = s;
  while (cur.status === "in_progress" && !pick(cur)) cur = decide(cur, verdictOf(cur).verdict);
  if (cur.status !== "in_progress") throw new Error("no such applicant");
  return cur;
}
const isDeny = (s: GameState): boolean => verdictOf(s).verdict === "deny";
const isApprove = (s: GameState): boolean => verdictOf(s).verdict === "approve";

describe("opening a shift", () => {
  test("the shift starts with the booth empty and no bulletin", () => {
    const s = calendarShift();
    expect(s.bulletin_delivered).toBe(false);
    expect(s.present).toBe(false);
    expect(s.pending).toBeNull();
    expect(s.draft).toBeNull();
    expect(s.unconfirmed).toBe(0);
  });

  test("no applicant can be called before the bulletin lands", () => {
    const s = calendarShift();
    expect(canCallNext(s)).toBe(false);
    expect(callNext(s)).toBe(s);
    const d = deliverBulletin(s);
    expect(d.bulletin_delivered).toBe(true);
    expect(deliverBulletin(d)).toBe(d);
    expect(canCallNext(d)).toBe(true);
  });

  test("calling the next applicant seats one, and the button is gated while one is present", () => {
    const s = ready(calendarShift());
    expect(s.present).toBe(true);
    expect(s.index).toBe(0);
    expect(canCallNext(s)).toBe(false);
    expect(callNext(s)).toBe(s);
  });

  test("nothing can be stamped or filed with the booth empty", () => {
    const s = deliverBulletin(calendarShift());
    expect(stampApprove(s)).toBe(s);
    expect(startDenial(s)).toBe(s);
    expect(fileForm(s)).toBe(s);
  });

  test("after filing the booth is empty and the next applicant can be called", () => {
    const s = approve(calendarShift());
    expect(s.present).toBe(false);
    expect(s.index).toBe(1);
    expect(canCallNext(s)).toBe(true);
    expect(s.bulletin_delivered).toBe(true);
  });

  test("a finished shift allows no further calls", () => {
    let s = calendarShift();
    while (s.status === "in_progress") s = decide(s, verdictOf(ready(s)).verdict);
    expect(s.status).toBe("complete");
    expect(canCallNext(s)).toBe(false);
    expect(callNext(s)).toBe(s);
  });

  test("a restart notice blocks calling until acknowledged; the bulletin stays delivered", () => {
    let s = calendarShift("s02");
    for (let i = 0; i < 3; i++) s = decide(s, verdictOf(ready(s)).verdict === "approve" ? "deny" : "approve");
    expect(s.restart_notice).not.toBeNull();
    expect(s.bulletin_delivered).toBe(true);
    expect(canCallNext(s)).toBe(false);
    expect(callNext(s)).toBe(s);
    const ack = acknowledgeNotice(s);
    expect(canCallNext(ack)).toBe(true);
  });
});

describe("stamps are pending until the form is filed", () => {
  test("approving stamps the form but changes no score", () => {
    const s0 = ready(calendarShift());
    const s1 = stampApprove(s0);
    expect(s1.pending).toEqual({ decision: "approve", reason_id: null, source: null });
    expect(s1.balance).toBe(s0.balance);
    expect(s1.correct).toBe(0);
    expect(s1.errors).toBe(0);
    expect(s1.index).toBe(0);
    expect(s1.ledger).toEqual([]);
    expect(s1.decision_log).toEqual([]);
    expect(s1.present).toBe(true);
  });

  test("a stamp cannot be changed or repeated", () => {
    const s1 = stampApprove(ready(calendarShift()));
    expect(stampApprove(s1)).toBe(s1);
    expect(startDenial(s1)).toBe(s1);
  });

  test("filing applies the pending decision", () => {
    const s0 = ready(advanceTo(calendarShift(), isApprove));
    const s1 = fileForm(stampApprove(s0));
    expect(s1.pending).toBeNull();
    expect(s1.correct).toBe(s0.correct + 1);
    expect(s1.balance).toBe(s0.balance + economy.income_per_correct_decision);
    expect(s1.ledger.at(-1)).toBe(`Application ${s0.index + 1}: approved`);
  });

  test("filing needs a stamped form", () => {
    const s0 = ready(calendarShift());
    expect(fileForm(s0)).toBe(s0);
    const drafted = startDenial(s0);
    expect(fileForm(drafted)).toBe(drafted);
  });
});

describe("denial checklist", () => {
  const open = (): GameState => startDenial(ready(advanceTo(calendarShift("s10"), isDeny)));

  test("opening it lists the reasons and does not stamp", () => {
    const s = open();
    expect(s.draft).toEqual({ step: "reasons", reason_id: null, source: null });
    expect(s.pending).toBeNull();
    expect(startDenial(s)).toBe(s);
    expect(stampApprove(s)).toBe(s);
    expect(reasonCatalog(activeRules(s)).length).toBeGreaterThan(0);
  });

  test("a reason that needs a source moves to the source step", () => {
    const s = chooseReason(open(), "R2_RESIDENCY.not_sd");
    expect(s.draft).toEqual({ step: "source", reason_id: "R2_RESIDENCY.not_sd", source: null });
    expect(stampDenied(s)).toBe(s); // not ready: no source yet
  });

  test("a reason that is an absence needs no source and is ready at once", () => {
    const s = chooseReason(open(), "R3_CITIZENSHIP.no_qualifying");
    expect(s.draft).toEqual({ step: "ready", reason_id: "R3_CITIZENSHIP.no_qualifying", source: null });
    expect(chooseSource(s, { doc_id: "x", doc_type: "y", field: "name" })).toBe(s);
  });

  test("an unknown reason, or one from an inactive rule, is ignored", () => {
    const s = open();
    expect(chooseReason(s, "R1_AGE.nope")).toBe(s);
    const sb = startSandboxShift({ save_salt: "x", shift_id: "s01", as_of: "2025-10-01", rule_ids: ["R2_RESIDENCY"], attempt_number: 1 });
    if (!sb.ok) throw new Error("start");
    const d = startDenial(ready(sb.state));
    expect(chooseReason(d, "R1_AGE.differs")).toBe(d);
    expect(chooseReason(d, "R2_RESIDENCY.no_address").draft?.step).toBe("source");
  });

  test("choosing a source makes the sheet ready; a source can be changed", () => {
    let s = chooseReason(open(), "R2_RESIDENCY.not_sd");
    const a = currentApplicant(s)!.application;
    const first = { doc_id: a.residency_declaration.doc_id, doc_type: "residency_declaration", field: "address" };
    s = chooseSource(s, first);
    expect(s.draft).toEqual({ step: "ready", reason_id: "R2_RESIDENCY.not_sd", source: first });
    const other = { doc_id: a.application_id, doc_type: "application_form", field: "name" };
    expect(chooseSource(s, other).draft?.source).toEqual(other);
  });

  test("Back returns to the reason list; Cancel abandons the denial without a stamp", () => {
    const picked = chooseReason(open(), "R2_RESIDENCY.not_sd");
    const back = backToReasons(picked);
    expect(back.draft).toEqual({ step: "reasons", reason_id: null, source: null });
    expect(backToReasons(back)).toBe(back);
    const cancelled = cancelDenial(picked);
    expect(cancelled.draft).toBeNull();
    expect(cancelled.pending).toBeNull();
    expect(cancelDenial(cancelled)).toBe(cancelled);
    expect(startDenial(cancelled).draft?.step).toBe("reasons");
  });

  test("stamping DENIED places a pending denial and closes the sheet", () => {
    let s = chooseReason(open(), "R3_CITIZENSHIP.no_qualifying");
    s = stampDenied(s);
    expect(s.draft).toBeNull();
    expect(s.pending).toEqual({ decision: "deny", reason_id: "R3_CITIZENSHIP.no_qualifying", source: null });
    expect(s.index).toBe(advanceTo(calendarShift("s10"), isDeny).index);
    expect(s.balance).toBe(advanceTo(calendarShift("s10"), isDeny).balance);
    expect(stampDenied(s)).toBe(s);
  });
});

describe("filing a denial", () => {
  test("a correct denial with the right reason and source is plain income", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isDeny));
    const s1 = deny(s0, "right");
    expect(s1.correct).toBe(s0.correct + 1);
    expect(s1.errors).toBe(s0.errors);
    expect(s1.unconfirmed).toBe(0);
    expect(s1.note).toBeNull();
    expect(s1.balance).toBe(s0.balance + economy.income_per_correct_decision);
    expect(s1.ledger.at(-1)).toBe(`Application ${s0.index + 1}: denied`);
  });

  test("denying an application that passes is an error, whatever the reason", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isApprove));
    const s1 = deny(s0, "right");
    expect(s1.errors).toBe(s0.errors + 1);
    expect(s1.correct).toBe(s0.correct);
    expect(s1.unconfirmed).toBe(0);
    expect(s1.note).toBe(`Application ${s0.index + 1} denied. All active rules satisfied.`);
    expect(s1.balance).toBe(Math.max(economy.minimum_balance, s0.balance - economy.penalty_per_error));
  });

  test("approving an application that fails is an error that names the rules", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isDeny));
    const s1 = approve(s0);
    expect(s1.errors).toBe(1);
    expect(s1.note).toMatch(/^Application \d+ approved\. Condition not met: [A-Z][a-z]+/);
  });

  for (const plan of ["wrong_reason", "wrong_source"] as DenyPlan[]) {
    test(`first unconfirmed reason (${plan}) in a shift: no penalty, income, neutral note`, () => {
      const s0 = ready(
        advanceTo(sandboxWith(2, "deny", (st) => verdictOf(st).verdict !== undefined), (st) => isDeny(st) && (plan === "wrong_reason" || choiceFor(st, plan).source !== null)),
      );
      // Confirm the plan really yields a wrong source (skip applicants for whom it cannot).
      const c = choiceFor(s0, plan);
      const s1 = deny(s0, plan);
      if (plan === "wrong_source" && c.reason.needs_source === false) return;
      expect(s1.unconfirmed).toBe(1);
      expect(s1.errors).toBe(0);
      expect(s1.correct).toBe(s0.correct + 1);
      expect(s1.balance).toBe(s0.balance + economy.income_per_correct_decision);
      expect(s1.note).toBe(`Application ${s0.index + 1} denied. Reason not confirmed.`);
      expect(s1.ledger.at(-1)).toBe(`Application ${s0.index + 1}: denied, reason not confirmed`);
    });
  }

  test("each later unconfirmed reason in the same shift counts as an error", () => {
    let s = sandboxWith(3, "deny");
    let expectedUnconfirmed = 0;
    let expectedErrors = 0;
    while (s.status === "in_progress" && s.restart_notice === null) {
      const at = ready(s);
      const v = verdictOf(at).verdict;
      const before = at;
      s = decide(at, v, "wrong_reason");
      if (v === "approve") continue;
      if (s.restart_notice !== null) break;
      expectedUnconfirmed += 1;
      if (expectedUnconfirmed > 1) {
        expectedErrors += 1;
        expect(s.note).toBe(`Application ${before.index + 1} denied. Reason not confirmed. Counted as error.`);
        expect(s.balance).toBe(Math.max(economy.minimum_balance, before.balance - economy.penalty_per_error));
        expect(s.correct).toBe(before.correct);
      } else {
        expect(s.note).toBe(`Application ${before.index + 1} denied. Reason not confirmed.`);
        expect(s.balance).toBe(before.balance + economy.income_per_correct_decision);
      }
      expect(s.errors).toBe(expectedErrors);
      expect(s.unconfirmed).toBe(expectedUnconfirmed);
    }
    expect(expectedUnconfirmed).toBeGreaterThanOrEqual(2);
  });

  test("the unconfirmed counter resets for a new shift and for each attempt", () => {
    let s = sandboxWith(2, "deny");
    s = advanceTo(s, isDeny);
    s = deny(s, "wrong_reason");
    expect(s.unconfirmed).toBe(1);
    // A new shift state starts at zero.
    expect(sandboxWith(2, "deny").unconfirmed).toBe(0);
    // A restart (three plain errors) resets it, so the first one is free again.
    let r = calendarShift("s02");
    for (let i = 0; i < 3; i++) r = decide(r, verdictOf(ready(r)).verdict === "approve" ? "deny" : "approve");
    expect(r.attempt_number).toBe(2);
    expect(r.unconfirmed).toBe(0);
    r = acknowledgeNotice(r);
    r = advanceTo(r, isDeny);
    const before = r;
    r = deny(r, "wrong_reason");
    expect(r.errors).toBe(0);
    expect(r.unconfirmed).toBe(1);
    expect(r.balance).toBe(before.balance + economy.income_per_correct_decision);
  });

  test("an unconfirmed reason that is an error counts toward the three-error restart", () => {
    const start = sandboxWith(4, "deny");
    let s = start;
    let restarted = false;
    let guard = 0;
    while (s.status === "in_progress" && guard++ < 40) {
      const at = ready(s);
      s = decide(at, verdictOf(at).verdict, "wrong_reason");
      if (s.restart_notice !== null) {
        restarted = true;
        break;
      }
    }
    expect(restarted).toBe(true);
    expect(s.restart_notice).toBe("Shift not completed. Errors: 3.");
    expect(s.attempt_number).toBe(2);
    expect(s.errors).toBe(0);
    expect(s.unconfirmed).toBe(0);
    expect(s.present).toBe(false);
    expect(s.pending).toBeNull();
    expect(s.draft).toBeNull();
    expect(s.index).toBe(0);
    expect(s.balance).toBe(s.balance_at_shift_start);
  });

  test("three plain errors restart at filing, not at the stamp", () => {
    let s = calendarShift("s02");
    const wrongOne = (st: GameState): GameState => {
      const at = ready(st);
      return verdictOf(at).verdict === "approve" ? stampDenyAny(at) : stampApprove(at);
    };
    for (let i = 0; i < 2; i++) s = fileForm(wrongOne(s));
    expect(s.errors).toBe(2);
    const stamped = wrongOne(s);
    expect(stamped.errors).toBe(2);
    expect(stamped.restart_notice).toBeNull();
    const filed = fileForm(stamped);
    expect(filed.restart_notice).toBe("Shift not completed. Errors: 3.");
  });
});

// A DENIED stamp using whatever reason comes first.
function stampDenyAny(s: GameState): GameState {
  let cur = startDenial(s);
  const first = reasonCatalog(activeRules(cur))[0]!.reasons.find((r) => !r.needs_source) ?? reasonCatalog(activeRules(cur))[0]!.reasons[0]!;
  cur = chooseReason(cur, first.id);
  if (cur.draft?.step === "source") {
    const a = currentApplicant(cur)!.application;
    cur = chooseSource(cur, { doc_id: a.application_id, doc_type: "application_form", field: "name" });
  }
  return stampDenied(cur);
}

describe("summary and completion", () => {
  test("reasons not confirmed are counted in the summary (free and later ones)", () => {
    let s = sandboxWith(2, "deny");
    let n = 0;
    let guard = 0;
    while (s.status === "in_progress" && s.restart_notice === null && guard++ < 40) {
      const at = ready(s);
      const v = verdictOf(at).verdict;
      s = decide(at, v, "wrong_reason");
      if (v === "deny" && s.restart_notice === null) n += 1;
    }
    if (s.status === "complete") {
      expect(s.summary?.reasons_not_confirmed).toBe(n);
      expect(s.summary?.processed).toBe(s.applicants.length);
      expect((s.summary?.correct ?? 0) + (s.summary?.errors ?? 0)).toBe(s.applicants.length);
    } else {
      expect(s.restart_notice).not.toBeNull();
    }
  });

  test("a clean shift reports zero reasons not confirmed", () => {
    let s = calendarShift("s01");
    while (s.status === "in_progress") {
      const at = ready(s);
      s = decide(at, verdictOf(at).verdict);
    }
    expect(s.summary).toEqual({
      processed: s.applicants.length,
      correct: s.applicants.length,
      errors: 0,
      reasons_not_confirmed: 0,
      earnings: s.applicants.length * economy.income_per_correct_decision,
    });
    expect(s.present).toBe(false);
  });

  test("exactly one free unconfirmed denial yields a summary count of 1", () => {
    let s = sandboxWith(1, "deny");
    let done = false;
    let guard = 0;
    let used = false;
    while (s.status === "in_progress" && guard++ < 40) {
      const at = ready(s);
      const v = verdictOf(at).verdict;
      if (v === "deny" && !used) {
        used = true;
        s = deny(at, "wrong_reason");
      } else {
        s = decide(at, v);
      }
      done = s.status === "complete";
    }
    expect(done).toBe(true);
    expect(s.summary?.reasons_not_confirmed).toBe(1);
    expect(s.summary?.errors).toBe(0);
  });
});

describe("decision log", () => {
  test("approvals log no denial fields", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isApprove));
    const s1 = fileForm(stampApprove(s0));
    const e = s1.decision_log.at(-1)!;
    expect(e.player_decision).toBe("approve");
    expect("denial_reason" in e).toBe(false);
    expect("denial_source" in e).toBe(false);
    expect("reason_confirmed" in e).toBe(false);
  });

  test("a confirmed denial logs the reason, the source and reason_confirmed true", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), (st) => isDeny(st) && choiceFor(st, "right").reason.needs_source));
    const c = choiceFor(s0, "right");
    const s1 = deny(s0, "right");
    const e = s1.decision_log.at(-1)!;
    expect(e.player_decision).toBe("deny");
    expect(e.denial_reason).toEqual({ rule_id: c.reason.rule_id, condition: c.reason.condition });
    expect(e.denial_source).toEqual({ doc_type: c.source!.doc_type, field: c.source!.field });
    expect(e.reason_confirmed).toBe(true);
  });

  test("an absence reason logs a null source", () => {
    const absence = (st: GameState): boolean => isDeny(st) && !choiceFor(st, "right").reason.needs_source;
    let start: GameState | null = null;
    for (let i = 0; i < 200 && start === null; i++) {
      const sv = newSave(`absence-${i}`, "2026-01-01T00:00:00Z");
      sv.progress.current_shift_id = "s10";
      const r = startCalendarShift(sv);
      if (r.ok && r.state.applicants.some((_, k) => absence({ ...r.state, index: k }))) start = r.state;
    }
    expect(start).not.toBeNull();
    const s0 = ready(advanceTo(start!, absence));
    const s1 = deny(s0, "right");
    const e = s1.decision_log.at(-1)!;
    expect(e.denial_source).toBeNull();
    expect(e.reason_confirmed).toBe(true);
    expect(e.denial_reason?.rule_id).toMatch(/^R\d_/);
  });

  test("an unconfirmed denial logs reason_confirmed false", () => {
    const s0 = ready(advanceTo(sandboxWith(1, "deny"), isDeny));
    const s1 = deny(s0, "wrong_reason");
    expect(s1.decision_log).toHaveLength(0); // sandbox never logs
    const c0 = ready(advanceTo(calendarShift("s10"), isDeny));
    const c1 = deny(c0, "wrong_reason");
    const e = c1.decision_log.at(-1)!;
    expect(e.reason_confirmed).toBe(false);
    expect(e.engine_verdict).toBe("deny");
    expect(e.denial_reason).toBeDefined();
  });

  test("logged conditions are the canonical form, without the election date", () => {
    for (const sh of shifts) {
      let s = calendarShift(sh.shift_id);
      let guard = 0;
      while (s.status === "in_progress" && guard++ < 20) {
        const at = ready(s);
        s = decide(at, verdictOf(at).verdict);
      }
      for (const e of s.decision_log) if (e.denial_reason) expect(e.denial_reason.condition).not.toMatch(/\(/);
    }
  });

  test("nothing is logged until the form is filed", () => {
    const s0 = ready(calendarShift());
    const stamped = stampApprove(s0);
    expect(stamped.decision_log).toEqual(s0.decision_log);
    expect(fileForm(stamped).decision_log).toHaveLength(s0.decision_log.length + 1);
  });

  test("the save carries the optional fields through", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isDeny));
    const s1 = deny(s0, "right");
    const out = saveFromState(newSave("flow-salt", "2026-01-01T00:00:00Z"), s1);
    expect(out.decision_log.at(-1)?.reason_confirmed).toBe(true);
  });

  test("valid sources exist for every needs-source reason of a right denial", () => {
    const s0 = ready(advanceTo(calendarShift("s10"), isDeny));
    const c = choiceFor(s0, "right");
    const a = currentApplicant(s0)!.application;
    if (c.reason.needs_source) expect(validSources(a, s0.as_of, findReason(c.reason.id)!).length).toBeGreaterThan(0);
  });
});

// Pure timing and decision helpers for the audio layer (no Web Audio, no DOM), so they can be tested.

export const CUE_GAP_MIN_S = 35;
export const CUE_GAP_MAX_S = 90;

/** Random gap between the END of one ambient cue and the start of the next. */
export function cueGapSeconds(random: () => number): number {
  const r = Math.min(0.999999, Math.max(0, random()));
  return CUE_GAP_MIN_S + r * (CUE_GAP_MAX_S - CUE_GAP_MIN_S);
}

export interface ActiveCue {
  duration: number; // seconds until the cue has fully ended
  cancel(): void; // silence it now
}

export interface CueSchedulerDeps {
  setTimer(fn: () => void, ms: number): number;
  clearTimer(id: number): void;
  random(): number;
  /** Start one cue, or return null when nothing can play right now (muted, suspended). */
  play(): ActiveCue | null;
}

export interface CueScheduler {
  start(): void; // idempotent: a running scheduler is left alone
  stop(): void; // clears the timer and silences any cue still sounding
  readonly running: boolean;
  readonly cueActive: boolean;
}

/**
 * One scheduler, one cue at a time. The next gap is measured from the end of the previous
 * cue, and a new cue can only start after the previous one has ended (or been cancelled).
 */
export function createCueScheduler(deps: CueSchedulerDeps): CueScheduler {
  let running = false;
  let timer: number | undefined;
  let current: ActiveCue | null = null;

  const clear = (): void => {
    if (timer !== undefined) deps.clearTimer(timer);
    timer = undefined;
  };
  const armGap = (): void => {
    clear();
    timer = deps.setTimer(fire, cueGapSeconds(deps.random) * 1000);
  };
  function fire(): void {
    timer = undefined;
    if (!running || current !== null) return;
    const cue = deps.play();
    if (cue === null) {
      armGap();
      return;
    }
    current = cue;
    timer = deps.setTimer(() => {
      timer = undefined;
      current = null;
      if (running) armGap();
    }, Math.max(0, cue.duration) * 1000);
  }

  return {
    start() {
      if (running) return;
      running = true;
      armGap();
    },
    stop() {
      running = false;
      clear();
      if (current !== null) current.cancel();
      current = null;
    },
    get running() { return running; },
    get cueActive() { return current !== null; },
  };
}

/** The car ignition plays only when Continue leads to a new calendar shift. */
export function shouldIgnite(sandbox: boolean, finalShift: boolean): boolean {
  return !sandbox && !finalShift;
}

export interface IgnitionPlan {
  cranks: number;
  crankPeriod: number; // seconds per crank
  catchAt: number; // seconds from start when the engine catches
  total: number; // seconds until everything has faded
}

/** r1, r2 are uniform [0,1) draws. 2-4 cranks, total 2.5-3.5 s. */
export function ignitionPlan(r1: number, r2: number): IgnitionPlan {
  const cranks = 2 + Math.min(2, Math.floor(r1 * 3));
  const crankPeriod = 0.34;
  const catchAt = cranks * crankPeriod + 0.1;
  const total = 2.5 + Math.min(0.999, Math.max(0, r2));
  return { cranks, crankPeriod, catchAt, total };
}

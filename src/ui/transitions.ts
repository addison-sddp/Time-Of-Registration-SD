// Fade-to-black sequencing, DOM-free so it can be tested.
export interface FaderDeps {
  reduced(): boolean;
  setTimer(fn: () => void, ms: number): number;
  veil(on: boolean): void;
  ms: number;
}

export interface Fader {
  /** Returns true when the swap will run. With dropIfBusy a swap requested mid-fade is dropped (false);
   *  otherwise it is queued and runs right after the current fade-out completes. */
  run(swap: () => void, opts?: { dropIfBusy?: boolean }): boolean;
}

export function createFader(d: FaderDeps): Fader {
  let busy = false;
  const queue: (() => void)[] = [];
  const cycle = (swap: () => void): void => {
    busy = true;
    d.veil(true);
    d.setTimer(() => {
      swap();
      d.veil(false);
      d.setTimer(() => {
        const next = queue.shift();
        if (next !== undefined) cycle(next);
        else busy = false;
      }, d.ms);
    }, d.ms);
  };
  return {
    run(swap, opts) {
      if (d.reduced()) {
        swap();
        return true;
      }
      if (busy) {
        if (opts?.dropIfBusy === true) return false;
        queue.push(swap);
        return true;
      }
      cycle(swap);
      return true;
    },
  };
}

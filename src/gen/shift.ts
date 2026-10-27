import type { Shift } from "../data";
import { buildApplicant } from "./applicant";
import { createContext, type GenOptions } from "./context";
import { drawIntent } from "./profiles";
import { createRng, hashSeed } from "./rng";
import type { GeneratedApplicant } from "./types";

// Shift data may later carry hand-written applicants (DESIGN 2.4). They count toward the
// 5 to 10 total and keep their pinned_position like any other entry.
export interface ShiftInput extends Shift {
  scripted_applicants?: readonly GeneratedApplicant[];
}

export const MIN_APPLICANTS = 5;
export const MAX_APPLICANTS = 10;

// The shift's content, in a fixed canonical order. Seeded only by hash(save_salt, shift_id),
// so it is identical on every attempt; orderShift decides who comes first.
export function generateShift(
  save_salt: string,
  shift: ShiftInput,
  opts: GenOptions = {},
): GeneratedApplicant[] {
  const ctx = createContext(shift.shift_date, opts);
  const master = createRng(hashSeed(save_salt, shift.shift_id));
  const scripted = shift.scripted_applicants ?? [];
  const total = Math.max(master.int(MIN_APPLICANTS, MAX_APPLICANTS), scripted.length);

  const out: GeneratedApplicant[] = [...scripted];
  const intents = Array.from({ length: total - scripted.length }, () => drawIntent(master, ctx));
  // A shift with nothing to approve or nothing to deny teaches nothing.
  if (intents.length >= 2) {
    if (!intents.some((i) => i.verdict === "approve")) intents[intents.length - 1] = drawIntent(master, ctx, "approve");
    if (!intents.some((i) => i.verdict === "deny")) intents[0] = drawIntent(master, ctx, "deny");
  }
  intents.forEach((intent, k) => {
    const index = scripted.length + k;
    // One sub-stream per applicant, so changing one builder never shifts the others.
    const rng = createRng(master.uint32());
    out.push(buildApplicant(rng, ctx, intent, `${shift.shift_id}-a${String(index + 1).padStart(2, "0")}`));
  });
  return out;
}

// The order the player sees on a given attempt, seeded by hash(save_salt, shift_id,
// attempt_number). An applicant with a valid, unclaimed pinned_position keeps that slot;
// the rest are shuffled into the free slots. An invalid or duplicate pin is treated as unpinned.
export function orderShift<T extends { pinned_position?: number }>(
  applicants: readonly T[],
  save_salt: string,
  shift_id: string,
  attempt_number: number,
): T[] {
  const rng = createRng(hashSeed(save_salt, shift_id, attempt_number));
  const slots: (T | undefined)[] = new Array<T | undefined>(applicants.length).fill(undefined);
  const loose: T[] = [];
  for (const a of applicants) {
    const p = a.pinned_position;
    if (p !== undefined && Number.isInteger(p) && p >= 0 && p < slots.length && slots[p] === undefined) {
      slots[p] = a;
    } else {
      loose.push(a);
    }
  }
  const shuffled = rng.shuffle(loose);
  let next = 0;
  return slots.map((s) => s ?? (shuffled[next++] as T));
}

// Menu music: pure score data plus a deterministic schedule. No audio calls live here.
// Original composition for this project (DESIGN 1.2): a polite, slightly cheesy
// hold-line bossa written from scratch. Key G major, 98 BPM, 16 bars, gentle swing.
// Form: A (bars 1-8), B bridge (bars 9-12), A' (bars 13-16). Time unit is one eighth note.

export type ChannelId = "lead" | "counter" | "comp" | "bass" | "hat" | "rim";

export interface Channel {
  id: ChannelId;
  kind: "pulse" | "triangle" | "noise";
  duty: number; // pulse width (0 for non-pulse)
  mono: boolean; // true: notes must not overlap
  min: number; // lowest allowed midi value (noise: sound index)
  max: number;
  gain: number; // mix level 0..1
}

export interface Note {
  ch: ChannelId;
  step: number; // start, in eighth notes from loop start
  len: number; // length in eighth notes
  midi: number; // pitch; for noise channels 0 = closed, 1 = open, 2 = stick
  vel: number; // 0..1
}

export interface Score {
  bpm: number;
  beatsPerBar: number;
  stepsPerBeat: number;
  bars: number;
  swing: number; // 0.5 straight, about 0.6 gently swung
  channels: readonly Channel[];
  notes: readonly Note[];
}

export interface ScheduledNote extends Note {
  time: number; // seconds from loop start
  dur: number; // seconds
}

export const CHANNELS: readonly Channel[] = [
  { id: "lead", kind: "pulse", duty: 0.25, mono: true, min: 64, max: 91, gain: 0.5 },
  { id: "counter", kind: "pulse", duty: 0.125, mono: true, min: 58, max: 79, gain: 0.26 },
  { id: "comp", kind: "pulse", duty: 0.5, mono: false, min: 48, max: 76, gain: 0.2 },
  { id: "bass", kind: "triangle", duty: 0, mono: true, min: 33, max: 57, gain: 0.75 },
  { id: "hat", kind: "noise", duty: 0, mono: true, min: 0, max: 1, gain: 0.3 },
  { id: "rim", kind: "noise", duty: 0, mono: true, min: 2, max: 2, gain: 0.35 },
];

// Chord qualities as semitone offsets above the root: third, seventh, ninth, fifth.
interface Quality { third: number; seventh: number; ninth: number; fifth: number }
const MAJ9: Quality = { third: 4, seventh: 11, ninth: 14, fifth: 7 };
const MIN9: Quality = { third: 3, seventh: 10, ninth: 14, fifth: 7 };
const MIN7: Quality = { third: 3, seventh: 10, ninth: 12, fifth: 7 };
const DOM9: Quality = { third: 4, seventh: 10, ninth: 14, fifth: 7 };
const DOM7: Quality = { third: 4, seventh: 10, ninth: 12, fifth: 7 };
const DOM7B9: Quality = { third: 4, seventh: 10, ninth: 13, fifth: 7 };
const DIM7: Quality = { third: 3, seventh: 9, ninth: 12, fifth: 6 };

type Chord = readonly [rootPitchClass: number, q: Quality];
const G = 7, A = 9, Bb = 10, B = 11, C = 0, D = 2, E = 4, F = 5;

// Two chords per bar (one per half bar); a whole-bar chord is written twice.
const HALVES: readonly Chord[] = [
  [G, MAJ9], [G, MAJ9], // 1
  [E, MIN9], [E, MIN9], // 2
  [A, MIN9], [A, MIN9], // 3
  [D, DOM9], [D, DOM9], // 4
  [B, MIN7], [B, MIN7], // 5
  [E, DOM9], [E, DOM9], // 6
  [A, MIN9], [A, MIN9], // 7
  [D, MIN7], [G, DOM7], // 8
  [C, MAJ9], [C, MAJ9], // 9
  [C, MIN7], [F, DOM9], // 10
  [Bb, MAJ9], [Bb, MAJ9], // 11
  [A, MIN7], [D, DOM7B9], // 12
  [G, MAJ9], [G, MAJ9], // 13
  [E, MIN7], [A, DOM9], // 14
  [B, MIN7], [Bb, DIM7], // 15
  [A, MIN7], [D, DOM9], // 16
];

// Lead melody per bar as [step in bar, length, midi]. Written by hand for this piece.
const LEAD: readonly (readonly (readonly [number, number, number])[])[] = [
  [[1, 2, 79], [3, 1, 78], [4, 3, 74]],
  [[0, 2, 76], [2, 1, 74], [3, 1, 71], [4, 4, 76]],
  [[1, 2, 81], [3, 1, 79], [4, 2, 76], [6, 2, 72]],
  [[0, 2, 78], [2, 2, 81], [4, 3, 76]],
  [[0, 2, 74], [2, 2, 78], [4, 2, 81], [6, 2, 78]],
  [[1, 2, 80], [3, 1, 78], [4, 4, 74]],
  [[0, 2, 72], [2, 2, 76], [4, 3, 81]],
  [[0, 2, 77], [2, 2, 74], [4, 2, 71], [6, 2, 77]],
  [[0, 3, 76], [3, 1, 79], [4, 2, 83], [6, 2, 79]],
  [[0, 2, 75], [2, 2, 70], [4, 2, 69], [6, 2, 75]],
  [[0, 3, 74], [3, 1, 77], [4, 4, 81]],
  [[0, 2, 76], [2, 2, 72], [4, 2, 78], [6, 2, 75]],
  [[1, 2, 79], [3, 1, 81], [4, 3, 83]],
  [[0, 2, 79], [2, 2, 76], [4, 2, 73], [6, 2, 76]],
  [[0, 2, 74], [2, 2, 71], [4, 2, 73], [6, 2, 79]],
  [[0, 2, 72], [2, 2, 76], [4, 2, 74], [6, 2, 78]],
];

const STEPS_PER_BAR = 8;

function foldInto(pc: number, lo: number): number {
  return lo + ((((pc - lo) % 12) + 12) % 12);
}

function buildNotes(): Note[] {
  const out: Note[] = [];
  const total = LEAD.length;
  for (let bar = 0; bar < total; bar++) {
    const base = bar * STEPS_PER_BAR;
    for (const [s, len, midi] of LEAD[bar] ?? []) {
      out.push({ ch: "lead", step: base + s, len, midi, vel: s === 0 || s === 4 ? 0.95 : 0.8 });
    }
    for (let half = 0; half < 2; half++) {
      const chord = HALVES[bar * 2 + half];
      if (chord === undefined) continue;
      const [pc, q] = chord;
      const hs = base + half * 4;
      // Bass: root, then fifth on the "and" of the second beat of the half (bossa feel).
      const root = foldInto(pc, 36);
      out.push({ ch: "bass", step: hs, len: 3, midi: root, vel: 0.9 });
      out.push({ ch: "bass", step: hs + 3, len: 1, midi: root + 7, vel: 0.7 });
      // Comp: a short stab on the swung "and" of beat two.
      const r = foldInto(pc, 48);
      for (const off of [q.third, q.seventh, q.ninth, q.fifth]) {
        out.push({ ch: "comp", step: hs + 3, len: 1, midi: r + off, vel: 0.75 });
      }
      // Counter line: the seventh held, on odd bars only.
      if (bar % 2 === 1) {
        out.push({ ch: "counter", step: hs, len: 3, midi: foldInto(r + q.seventh, 60), vel: 0.6 });
      }
    }
    // Hi-hat on the beats and the open hat at the end of every second bar.
    for (const s of [0, 2, 4, 6]) {
      out.push({ ch: "hat", step: base + s, len: 1, midi: 0, vel: s === 0 ? 0.55 : 0.35 });
    }
    out.push({ ch: "hat", step: base + 7, len: 1, midi: bar % 2 === 1 ? 1 : 0, vel: bar % 2 === 1 ? 0.45 : 0.25 });
  }
  // Rim click: a 3-2 bossa pattern over each pair of bars.
  for (let pair = 0; pair < total / 2; pair++) {
    for (const s of [0, 3, 6, 10, 12]) {
      out.push({ ch: "rim", step: pair * 16 + s, len: 1, midi: 2, vel: 0.7 });
    }
  }
  return out.sort((a, b) => a.step - b.step || a.ch.localeCompare(b.ch) || a.midi - b.midi);
}

export const MENU_SCORE: Score = {
  bpm: 98,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  swing: 0.6,
  channels: CHANNELS,
  notes: buildNotes(),
};

export const stepsPerBar = (s: Score): number => s.beatsPerBar * s.stepsPerBeat;
export const totalSteps = (s: Score): number => s.bars * stepsPerBar(s);
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

// Seconds from loop start to a step. Odd steps (the "ands") are pushed late by the swing ratio.
export function stepTime(s: Score, step: number): number {
  const eighth = 60 / s.bpm / s.stepsPerBeat;
  const pair = Math.floor(step / 2);
  return pair * 2 * eighth + (step % 2 === 1 ? 2 * eighth * s.swing : 0);
}

export const loopSeconds = (s: Score): number => stepTime(s, totalSteps(s));

// The loop as a flat, time-sorted list of notes with absolute times in seconds.
export function schedule(s: Score): ScheduledNote[] {
  return s.notes
    .map((n) => {
      const time = stepTime(s, n.step);
      return { ...n, time, dur: stepTime(s, n.step + n.len) - time };
    })
    .sort((a, b) => a.time - b.time);
}

// A cursor that hands out notes due before a horizon, wrapping at the loop end.
// The caller keeps its own audio clock; this holds no time source.
export interface Cursor { index: number; loopStart: number }

export function startCursor(at: number): Cursor {
  return { index: 0, loopStart: at };
}

export function takeDue(
  events: readonly ScheduledNote[],
  loopLen: number,
  cur: Cursor,
  horizon: number,
): { note: ScheduledNote; at: number }[] {
  const out: { note: ScheduledNote; at: number }[] = [];
  if (events.length === 0) return out;
  for (;;) {
    const ev = events[cur.index];
    if (ev === undefined) return out;
    const at = cur.loopStart + ev.time;
    if (at >= horizon) return out;
    out.push({ note: ev, at });
    cur.index++;
    if (cur.index >= events.length) {
      cur.index = 0;
      cur.loopStart += loopLen;
    }
  }
}

import { createRng } from "../gen/rng";
import { createCueScheduler, ignitionPlan, type ActiveCue } from "./audio_sched";
import {
  MENU_SCORE, loopSeconds, midiToHz, schedule, startCursor, takeDue,
  type Channel, type Cursor, type ScheduledNote,
} from "../game/music";

// Procedural audio (DESIGN 7.4). No files. The context is created only after a user gesture.
// Variance comes from the seeded generator rather than Math.random.
//
// Graph: sources -> bus (sfx / music / ambience) -> master (volume) -> compressor -> gate (mute) -> out.
// Mute closes the gate, stops all scheduling and suspends the context, so nothing can leak through.

export type Sfx =
  | "ui_click" | "button_press" | "paper_pickup" | "paper_drop" | "card_pickup" | "card_drop"
  | "card_flip" | "stamp_approve" | "stamp_deny" | "bulletin_print" | "footsteps_in"
  | "footsteps_out" | "select_field" | "error_tone";

export type MusicTrack = "menu";

export interface Audio {
  unlock(): void; // call from a user gesture; no AudioContext exists before this
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  ambience(on: boolean): void; // quiet room tone with sparse far-off office sounds (shifts only)
  music(track: MusicTrack | null): void; // looping menu music; null fades it out
  sfx(name: Sfx): void;
  stamp(): void; // same as sfx("stamp_approve")
  type(chars: number): void; // typewriter clicks for text that just appeared
  ignition(): void; // car starting up, ~3 s; only for Continue to a new shift
}

const LOOKAHEAD = 0.3; // seconds of music scheduled ahead of the audio clock
const TICK_MS = 40;

export function createAudio(initialVolume: number, initialMuted: boolean): Audio {
  const rng = createRng(0x5eed1e5);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let gate: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let ambBus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let volume = initialVolume;
  let muted = initialMuted;
  let wantAmbience = false;
  let wantMusic: MusicTrack | null = null;

  const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
  const vary = (spread: number): number => 1 + (rng.next() * 2 - 1) * spread;
  const range = (lo: number, hi: number): number => lo + rng.next() * (hi - lo);

  function ramp(p: AudioParam, c: AudioContext, target: number, tc: number): void {
    const t = c.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.setTargetAtTime(target, t, tc);
  }

  function noiseBuffer(c: AudioContext): AudioBuffer {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;
    return buf;
  }

  // ---- Synthesis helpers ----

  interface ToneOpts {
    at: number; dur: number; gain: number; type?: OscillatorType; f0: number; f1?: number;
    attack?: number; lowpass?: number; wave?: PeriodicWave; detune?: number;
  }
  function tone(c: AudioContext, out: AudioNode, o: ToneOpts): void {
    const osc = c.createOscillator();
    if (o.wave !== undefined) osc.setPeriodicWave(o.wave);
    else osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f0, o.at);
    if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), o.at + o.dur);
    if (o.detune !== undefined) osc.detune.value = o.detune;
    const g = c.createGain();
    const attack = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, o.at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), o.at + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, o.at + o.dur);
    let node: AudioNode = osc;
    if (o.lowpass !== undefined) {
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = o.lowpass;
      osc.connect(lp);
      node = lp;
    }
    node.connect(g).connect(out);
    osc.start(o.at);
    osc.stop(o.at + o.dur + 0.03);
  }

  interface NoiseOpts {
    at: number; dur: number; gain: number; type?: BiquadFilterType; f0: number; f1?: number;
    q?: number; attack?: number;
  }
  function burst(c: AudioContext, out: AudioNode, o: NoiseOpts): void {
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.f0, o.at);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.at + o.dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const attack = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, o.at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), o.at + attack);
    g.gain.exponentialRampToValueAtTime(0.0003, o.at + o.dur);
    src.connect(f).connect(g).connect(out);
    src.start(o.at, rng.next() * 1.5, o.dur + 0.02);
  }

  // ---- Sound effects ----

  function stampSound(c: AudioContext, out: AudioNode, t: number, pitch: number, clack: number): void {
    // Spring-loaded clack, then the thud of the stamp body, then a small rebound tick.
    burst(c, out, { at: t, dur: 0.035, gain: 0.5, f0: clack, f1: clack * 0.7, q: 1.2 });
    tone(c, out, { at: t, dur: 0.05, gain: 0.16, type: "square", f0: pitch * 6.2, f1: pitch * 3.4, lowpass: 3000 });
    tone(c, out, { at: t + 0.045, dur: 0.22, gain: 0.9, f0: pitch, f1: pitch * 0.42, attack: 0.006 });
    burst(c, out, { at: t + 0.045, dur: 0.06, gain: 0.35, type: "lowpass", f0: 700, q: 0.7 });
    burst(c, out, { at: t + 0.16, dur: 0.02, gain: 0.14, f0: clack * 1.2, q: 2 });
  }

  function printer(c: AudioContext, out: AudioNode, t: number): void {
    // A dot-matrix head: buzzing sweeps per line, a zip back, then a tear at the end.
    const total = range(1.6, 2.3);
    const lines = Math.floor(total / 0.16);
    let at = t;
    for (let i = 0; i < lines; i++) {
      const len = range(0.09, 0.125);
      const base = range(150, 190);
      tone(c, out, { at, dur: len, gain: 0.1, type: "sawtooth", f0: base, f1: base * 1.5, lowpass: 3200, attack: 0.004 });
      burst(c, out, { at, dur: len, gain: 0.12, f0: range(2600, 3600), q: 3, attack: 0.004 });
      tone(c, out, { at: at + len, dur: 0.04, gain: 0.05, type: "sawtooth", f0: base * 1.6, f1: base * 0.7, lowpass: 2500 });
      at += 0.16;
    }
    // Tear: a ragged high-passed rip.
    for (let k = 0; k < 4; k++) {
      burst(c, out, { at: at + 0.03 + k * 0.035, dur: 0.04, gain: range(0.18, 0.34), type: "highpass", f0: range(1800, 3200), q: 0.9 });
    }
    burst(c, out, { at: at + 0.02, dur: 0.18, gain: 0.2, f0: 1400, f1: 5200, q: 0.8 });
  }

  function footsteps(c: AudioContext, out: AudioNode, t: number, coming: boolean): void {
    const n = 4 + Math.floor(rng.next() * 3);
    const gap = 1.2 / n;
    for (let i = 0; i < n; i++) {
      const p = n === 1 ? 1 : i / (n - 1);
      const near = coming ? p : 1 - p;
      const at = t + i * gap * vary(0.06);
      const gain = 0.06 + 0.44 * near;
      const lp = 450 + 1500 * near;
      const f = (i % 2 === 0 ? 78 : 66) * vary(0.1);
      burst(c, out, { at, dur: 0.07, gain, type: "lowpass", f0: lp, q: 0.7 });
      tone(c, out, { at, dur: 0.09, gain: gain * 0.9, f0: f * 1.3, f1: f * 0.6, attack: 0.004 });
    }
  }

  function playSfx(c: AudioContext, out: AudioNode, name: Sfx): void {
    const t = c.currentTime + 0.01;
    switch (name) {
      case "ui_click":
        tone(c, out, { at: t, dur: 0.07, gain: 0.22, type: "triangle", f0: 740 * vary(0.02), lowpass: 3500 });
        tone(c, out, { at: t + 0.035, dur: 0.07, gain: 0.18, type: "triangle", f0: 988 * vary(0.02), lowpass: 3500 });
        break;
      case "button_press":
        burst(c, out, { at: t, dur: 0.025, gain: 0.5, f0: 1300, q: 1.5 });
        tone(c, out, { at: t, dur: 0.07, gain: 0.5, type: "square", f0: 170 * vary(0.05), f1: 80, lowpass: 900 });
        burst(c, out, { at: t + 0.1, dur: 0.02, gain: 0.3, f0: 2100, q: 2 });
        tone(c, out, { at: t + 0.1, dur: 0.05, gain: 0.22, type: "square", f0: 240, f1: 130, lowpass: 1200 });
        break;
      case "paper_pickup": {
        const len = range(0.2, 0.28);
        burst(c, out, { at: t, dur: len, gain: 0.2, f0: 1600, f1: 4200, q: 0.8, attack: 0.03 });
        for (let i = 0; i < 5; i++) {
          burst(c, out, { at: t + rng.next() * len, dur: 0.03, gain: range(0.08, 0.2), f0: range(2000, 5200), q: 1.5 });
        }
        break;
      }
      case "paper_drop":
        burst(c, out, { at: t, dur: 0.15, gain: 0.3, f0: 1100, f1: 450, q: 0.7, attack: 0.012 });
        burst(c, out, { at: t + 0.06, dur: 0.05, gain: 0.12, f0: range(2500, 4000), q: 1.5 });
        tone(c, out, { at: t + 0.09, dur: 0.1, gain: 0.14, f0: 120, f1: 65 });
        break;
      case "card_pickup":
        tone(c, out, { at: t, dur: 0.025, gain: 0.2, type: "square", f0: 2600 * vary(0.03), f1: 1900, lowpass: 5000 });
        burst(c, out, { at: t, dur: 0.018, gain: 0.25, type: "highpass", f0: 4200, q: 0.7 });
        break;
      case "card_drop":
        burst(c, out, { at: t, dur: 0.025, gain: 0.35, f0: 3000, q: 1.5 });
        tone(c, out, { at: t, dur: 0.04, gain: 0.22, type: "triangle", f0: 1500 * vary(0.03), f1: 1000 });
        burst(c, out, { at: t + 0.04, dur: 0.02, gain: 0.2, f0: 2200, q: 2 });
        tone(c, out, { at: t + 0.04, dur: 0.035, gain: 0.14, type: "triangle", f0: 1100, f1: 800 });
        break;
      case "card_flip":
        burst(c, out, { at: t, dur: 0.07, gain: 0.1, f0: 2500, f1: 5000, q: 0.8 });
        tone(c, out, { at: t, dur: 0.02, gain: 0.2, type: "square", f0: 2700, f1: 2100, lowpass: 5000 });
        tone(c, out, { at: t + 0.06, dur: 0.02, gain: 0.2, type: "square", f0: 1900, f1: 1500, lowpass: 5000 });
        burst(c, out, { at: t + 0.06, dur: 0.015, gain: 0.2, type: "highpass", f0: 3600 });
        break;
      case "stamp_approve":
        stampSound(c, out, t, 105 * vary(0.08), 2300 * vary(0.06));
        break;
      case "stamp_deny":
        stampSound(c, out, t, 78 * vary(0.08), 1700 * vary(0.06));
        break;
      case "bulletin_print":
        printer(c, out, t);
        break;
      case "footsteps_in":
        footsteps(c, out, t, true);
        break;
      case "footsteps_out":
        footsteps(c, out, t, false);
        break;
      case "select_field":
        tone(c, out, { at: t, dur: 0.02, gain: 0.16, type: "triangle", f0: 1900 * vary(0.04), f1: 2300 });
        burst(c, out, { at: t, dur: 0.012, gain: 0.14, f0: 4500, q: 2 });
        tone(c, out, { at: t + 0.012, dur: 0.04, gain: 0.05, f0: 2800, f1: 3500 });
        break;
      case "error_tone":
        // Neutral descending third: a low office chime, not a buzzer.
        tone(c, out, { at: t, dur: 0.38, gain: 0.22, f0: 330, attack: 0.008 });
        tone(c, out, { at: t, dur: 0.2, gain: 0.05, f0: 660, attack: 0.008 });
        tone(c, out, { at: t + 0.22, dur: 0.5, gain: 0.22, f0: 262, attack: 0.008 });
        tone(c, out, { at: t + 0.22, dur: 0.25, gain: 0.05, f0: 524, attack: 0.008 });
        break;
    }
  }

  // ---- Ambience ----

  let ambBuilt = false;

  function buildAmbient(c: AudioContext, out: AudioNode): void {
    ambBuilt = true;
    // A low, soft hum that slowly swells and recedes.
    const swell = c.createGain();
    swell.gain.value = 0.55;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth).connect(swell.gain);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 150;
    const humGain = c.createGain();
    humGain.gain.value = 0.05;
    const hum = c.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 50;
    const hum2 = c.createOscillator();
    hum2.type = "sine";
    hum2.frequency.value = 100.3;
    const h2 = c.createGain();
    h2.gain.value = 0.35;
    hum.connect(lp);
    hum2.connect(h2).connect(lp);
    lp.connect(humGain).connect(swell).connect(out);
    // A thin bed of low-passed room noise, drifting on its own slower cycle.
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const nf = c.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 320;
    const ng = c.createGain();
    ng.gain.value = 0.014;
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.031;
    const lfo2Depth = c.createGain();
    lfo2Depth.gain.value = 0.009;
    lfo2.connect(lfo2Depth).connect(ng.gain);
    src.connect(nf).connect(ng).connect(out);
    for (const n of [hum, hum2, lfo, lfo2, src]) n.start();
  }

  // Far-off office sounds, kept quiet and muffled to read as another desk. Each cue gets its own
  // output node so it can be silenced on the spot; its length is returned for the single-cue lock.
  function distantSound(c: AudioContext, out: AudioNode): ActiveCue {
    const far = c.createGain();
    far.gain.value = 1;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    far.connect(lp).connect(out);
    const t = c.currentTime + 0.05;
    const kind = rng.weighted<"phone" | "chair" | "vent" | "tick">([
      ["phone", 3], ["chair", 3], ["vent", 2], ["tick", 3],
    ]);
    let dur: number;
    if (kind === "phone") dur = phoneRing(c, far, t);
    else if (kind === "chair") dur = chairCreak(c, far, t);
    else if (kind === "vent") dur = ventWhoosh(c, far, t);
    else dur = fluorescentTick(c, far, t);
    return {
      duration: dur + 0.15,
      cancel() {
        const now = c.currentTime;
        far.gain.cancelScheduledValues(now);
        far.gain.setTargetAtTime(0, now, 0.02);
        window.setTimeout(() => {
          try { far.disconnect(); lp.disconnect(); } catch { /* already gone */ }
        }, 200);
      },
    };
  }

  // Classic desk phone: 440 + 480 Hz, amplitude-modulated near 20 Hz, ~2 s on / ~4 s off, 1-2 rings,
  // muffled by a low-pass as if from across the room. Returns seconds until it has ended.
  function phoneRing(c: AudioContext, out: AudioNode, t: number): number {
    const rings = rng.chance(0.5) ? 1 : 2;
    const on = 2;
    const off = 4;
    const total = rings * on + (rings - 1) * off;
    const sum = c.createGain();
    const trem = c.createGain(); // 20 Hz amplitude modulation: gain = 0.5 + 0.5 * sin
    trem.gain.value = 0;
    const env = c.createGain(); // ring cadence
    env.gain.value = 0;
    const muffle = c.createBiquadFilter();
    muffle.type = "lowpass";
    muffle.frequency.value = 900;
    const level = c.createGain();
    level.gain.value = 0.05;
    sum.connect(trem).connect(env).connect(muffle).connect(level).connect(out);
    for (const f of [440, 480]) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(sum);
      o.start(t);
      o.stop(t + total + 0.05);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = rng.chance(0.5) ? 20 : 21;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(trem.gain);
    const bias = c.createConstantSource();
    bias.offset.value = 0.5;
    bias.connect(trem.gain);
    for (const n of [lfo, bias]) {
      n.start(t);
      n.stop(t + total + 0.05);
    }
    for (let r = 0; r < rings; r++) {
      const a = t + r * (on + off);
      env.gain.setValueAtTime(0, a);
      env.gain.linearRampToValueAtTime(1, a + 0.03);
      env.gain.setValueAtTime(1, a + on - 0.05);
      env.gain.linearRampToValueAtTime(0, a + on);
    }
    return total + 0.05;
  }

  // Office chair: a sawtooth through a narrow band-pass whose centre glides 300-900 Hz, with
  // stick-slip amplitude jitter. 0.4-0.9 s.
  function chairCreak(c: AudioContext, out: AudioNode, t: number): number {
    const dur = range(0.4, 0.9);
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(range(150, 210), t);
    osc.frequency.linearRampToValueAtTime(range(190, 260), t + dur);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 9;
    const up = rng.chance(0.6);
    const lo = range(300, 420);
    const hi = range(700, 900);
    bp.frequency.setValueAtTime(up ? lo : hi, t);
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const base = up ? lo + (hi - lo) * p : hi - (hi - lo) * p;
      bp.frequency.linearRampToValueAtTime(Math.max(300, Math.min(900, base * (1 + range(-0.12, 0.12)))), t + dur * p);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.05);
    let at = t + 0.05;
    while (at < t + dur - 0.12) {
      at += range(0.03, 0.08);
      g.gain.linearRampToValueAtTime(range(0.15, 1), Math.min(at, t + dur - 0.07)); // stick, slip, stick
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const level = c.createGain();
    level.gain.value = 0.2;
    osc.connect(bp).connect(g).connect(level).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    return dur + 0.03;
  }

  // HVAC kicking on and off: band-passed noise (300-1200 Hz), ~0.8 s attack, sustain, slow release.
  function ventWhoosh(c: AudioContext, out: AudioNode, t: number): number {
    const sustain = range(1.6, 2.6);
    const attack = 0.8;
    const release = 1.2;
    const dur = attack + sustain + release;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.linearRampToValueAtTime(1200, t + attack + sustain * 0.5);
    bp.frequency.linearRampToValueAtTime(600, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + attack);
    g.gain.setValueAtTime(0.16, t + attack + sustain);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, rng.next() * 1.5);
    src.stop(t + dur + 0.03);
    return dur + 0.03;
  }

  // Fluorescent ballast flicker: a short burst of clicks and a brief 120 Hz buzz swell.
  function fluorescentTick(c: AudioContext, out: AudioNode, t: number): number {
    const clicks = 3 + Math.floor(rng.next() * 4);
    let at = t;
    for (let k = 0; k < clicks; k++) {
      burst(c, out, { at, dur: 0.012, gain: 0.16, type: "highpass", f0: 2800, q: 0.7 });
      tone(c, out, { at, dur: 0.02, gain: 0.03, type: "square", f0: 1900, f1: 1200, lowpass: 3000 });
      at += range(0.05, 0.16);
    }
    const buzzLen = 0.5;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 120;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + buzzLen * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + buzzLen);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + buzzLen + 0.03);
    return Math.max(at - t + 0.03, buzzLen + 0.03);
  }

  // Exactly one scheduler exists for the life of the Audio object; start/stop are idempotent.
  const cues = createCueScheduler({
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    random: () => rng.next(),
    play: () => {
      if (!wantAmbience || muted || ctx === null || ambBus === null || ctx.state !== "running") return null;
      return distantSound(ctx, ambBus);
    },
  });

  function applyAmbience(): void {
    if (ctx === null || ambBus === null) return;
    if (wantAmbience && !muted) {
      if (!ambBuilt) buildAmbient(ctx, ambBus);
      ramp(ambBus.gain, ctx, 1, 0.9);
      cues.start();
    } else {
      if (!wantAmbience) ramp(ambBus.gain, ctx, 0, 0.35);
      cues.stop();
    }
  }

  // ---- Car ignition ----

  // Starter-motor crank (2-4 low chugs), then the engine catches, revs once and settles into an
  // idle rumble that fades. Total 2.5-3.5 s. Runs on the sfx bus, so master volume and mute apply.
  function carIgnition(c: AudioContext, out: AudioNode): void {
    const plan = ignitionPlan(rng.next(), rng.next());
    const t = c.currentTime + 0.03;
    const bus = c.createGain();
    bus.gain.value = 0.55;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    bus.connect(lp).connect(out);
    for (let i = 0; i < plan.cranks; i++) {
      const at = t + i * plan.crankPeriod;
      tone(c, bus, { at, dur: plan.crankPeriod * 0.9, gain: 0.5, type: "sawtooth", f0: 78 * vary(0.05), f1: 52, attack: 0.04, lowpass: 380 });
      tone(c, bus, { at, dur: plan.crankPeriod * 0.8, gain: 0.07, type: "square", f0: 310, f1: 240, attack: 0.05, lowpass: 900 });
      burst(c, bus, { at, dur: plan.crankPeriod * 0.7, gain: 0.1, f0: 700, f1: 1000, q: 1.2, attack: 0.05 });
    }
    const at = t + plan.catchAt;
    const idleLen = plan.total - plan.catchAt;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(34, at);
    osc.frequency.linearRampToValueAtTime(88, at + 0.22);
    osc.frequency.linearRampToValueAtTime(46, at + 0.7);
    osc.frequency.linearRampToValueAtTime(40, at + idleLen);
    const eng = c.createBiquadFilter();
    eng.type = "lowpass";
    eng.frequency.value = 260;
    const pulse = c.createGain(); // cylinder firing: amplitude chop
    pulse.gain.value = 0.6;
    const chop = c.createOscillator();
    chop.type = "sine";
    chop.frequency.setValueAtTime(10, at);
    chop.frequency.linearRampToValueAtTime(24, at + 0.22);
    chop.frequency.linearRampToValueAtTime(15, at + 0.7);
    const chopDepth = c.createGain();
    chopDepth.gain.value = 0.4;
    chop.connect(chopDepth).connect(pulse.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(0.9, at + 0.08);
    env.gain.linearRampToValueAtTime(0.5, at + 0.8);
    env.gain.linearRampToValueAtTime(0.0001, at + idleLen);
    osc.connect(eng).connect(pulse).connect(env).connect(bus);
    for (const n of [osc, chop]) {
      n.start(at);
      n.stop(at + idleLen + 0.05);
    }
    burst(c, bus, { at, dur: 0.25, gain: 0.12, type: "lowpass", f0: 500, q: 0.7 });
  }

  // ---- Music ----

  const events: ScheduledNote[] = schedule(MENU_SCORE);
  const loopLen = loopSeconds(MENU_SCORE);
  const waves = new Map<number, PeriodicWave>();
  let cursor: Cursor | null = null;
  let musicTimer: number | undefined;
  let musicLp: BiquadFilterNode | null = null;

  function pulseWave(c: AudioContext, duty: number): PeriodicWave {
    const hit = waves.get(duty);
    if (hit !== undefined) return hit;
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    const w = c.createPeriodicWave(real, imag);
    waves.set(duty, w);
    return w;
  }

  function chanOf(id: string): Channel | undefined {
    return MENU_SCORE.channels.find((ch) => ch.id === id);
  }

  function playNote(c: AudioContext, out: AudioNode, n: ScheduledNote, at: number): void {
    const ch = chanOf(n.ch);
    if (ch === undefined) return;
    const g = ch.gain * n.vel;
    if (ch.kind === "noise") {
      if (n.ch === "hat") {
        const open = n.midi === 1;
        burst(c, out, { at, dur: open ? 0.16 : 0.035, gain: g * 0.5, type: "highpass", f0: 7200, q: 0.8 });
      } else {
        burst(c, out, { at, dur: 0.03, gain: g * 0.6, f0: 2400, q: 3 });
        tone(c, out, { at, dur: 0.03, gain: g * 0.4, type: "triangle", f0: 820, f1: 600 });
      }
      return;
    }
    const f = midiToHz(n.midi);
    const hold = Math.max(0.05, n.dur * 0.9);
    if (ch.kind === "triangle") {
      tone(c, out, { at, dur: hold, gain: g * 0.55, type: "triangle", f0: f, attack: 0.006 });
      return;
    }
    const wave = pulseWave(c, ch.duty);
    // Pulse voice plus a faintly detuned twin at another duty cycle gives the soft chorus.
    tone(c, out, { at, dur: hold, gain: g * 0.34, f0: f, wave, attack: 0.008 });
    if (ch.id === "lead" || ch.id === "counter") {
      tone(c, out, { at, dur: hold, gain: g * 0.24, f0: f, wave: pulseWave(c, ch.duty === 0.25 ? 0.5 : 0.25), detune: 9, attack: 0.012 });
    }
  }

  function musicTick(): void {
    if (ctx === null || musicBus === null || cursor === null || musicLp === null) return;
    if (wantMusic === null || muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (const { note, at } of takeDue(events, loopLen, cursor, now + LOOKAHEAD)) {
      if (at < now - 0.03) continue; // fell behind (a throttled timer); skip rather than burst
      playNote(ctx, musicLp, note, Math.max(at, now));
    }
  }

  function applyMusic(): void {
    if (ctx === null || musicBus === null) return;
    if (wantMusic !== null) {
      if (musicTimer === undefined && !muted) {
        cursor = startCursor(ctx.currentTime + 0.12);
        musicTimer = window.setInterval(musicTick, TICK_MS);
      }
      ramp(musicBus.gain, ctx, 1, 0.5);
    } else {
      ramp(musicBus.gain, ctx, 0, 0.35);
      window.setTimeout(() => {
        if (wantMusic === null && musicTimer !== undefined) {
          window.clearInterval(musicTimer);
          musicTimer = undefined;
          cursor = null;
        }
      }, 1800);
    }
  }

  // ---- Level, mute, lifecycle ----

  let suspendTimer: number | undefined;

  function applyLevel(): void {
    if (ctx === null || master === null || gate === null) return;
    ramp(master.gain, ctx, clamp01(volume), 0.03);
    ramp(gate.gain, ctx, muted ? 0 : 1, 0.02);
    window.clearTimeout(suspendTimer);
    applyAmbience();
    if (muted) {
      // Hard silence: stop the music clock, then suspend the whole context once the gate has closed.
      if (musicTimer !== undefined) {
        window.clearInterval(musicTimer);
        musicTimer = undefined;
        cursor = null;
      }
      suspendTimer = window.setTimeout(() => {
        if (muted && ctx !== null) void ctx.suspend();
      }, 200);
    } else {
      void ctx.resume();
      applyMusic();
    }
  }

  function ensureCtx(): boolean {
    if (ctx !== null) return true;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return false;
    try {
      const c = new Ctor();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = c.createGain();
      master.gain.value = clamp01(volume);
      gate = c.createGain();
      gate.gain.value = muted ? 0 : 1;
      master.connect(comp).connect(gate).connect(c.destination);
      sfxBus = c.createGain();
      sfxBus.connect(master);
      ambBus = c.createGain();
      ambBus.gain.value = 0;
      ambBus.connect(master);
      musicBus = c.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      // Music chain: soft low-pass, then dry plus a quiet echo.
      musicLp = c.createBiquadFilter();
      musicLp.type = "lowpass";
      musicLp.frequency.value = 4800;
      musicLp.connect(musicBus);
      const delay = c.createDelay(1);
      delay.delayTime.value = (60 / MENU_SCORE.bpm) * 0.75;
      const fb = c.createGain();
      fb.gain.value = 0.3;
      const echoTone = c.createBiquadFilter();
      echoTone.type = "lowpass";
      echoTone.frequency.value = 2200;
      const echoOut = c.createGain();
      echoOut.gain.value = 0.28;
      musicLp.connect(delay);
      delay.connect(echoTone).connect(fb).connect(delay);
      echoTone.connect(echoOut).connect(musicBus);
      noise = noiseBuffer(c);
      ctx = c;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  const live = (): boolean => ctx !== null && sfxBus !== null && !muted && ctx.state === "running";

  return {
    unlock() {
      if (ctx === null) {
        if (!ensureCtx()) return;
        applyLevel();
        applyAmbience();
        applyMusic();
        return;
      }
      if (!muted) void ctx.resume();
    },
    setVolume(v) {
      volume = v;
      applyLevel();
    },
    setMuted(m) {
      muted = m;
      applyLevel();
    },
    ambience(on) {
      wantAmbience = on;
      applyAmbience();
    },
    music(track) {
      wantMusic = track;
      applyMusic();
    },
    sfx(name) {
      if (!live() || ctx === null || sfxBus === null) return;
      playSfx(ctx, sfxBus, name);
    },
    stamp() {
      if (!live() || ctx === null || sfxBus === null) return;
      playSfx(ctx, sfxBus, "stamp_approve");
    },
    ignition() {
      if (!live() || ctx === null || sfxBus === null) return;
      carIgnition(ctx, sfxBus);
    },
    type(chars) {
      if (!live() || ctx === null || sfxBus === null) return;
      const n = Math.max(1, Math.min(14, Math.round(chars / 5)));
      let t = ctx.currentTime + 0.02;
      for (let i = 0; i < n; i++) {
        burst(ctx, sfxBus, { at: t, dur: 0.014, gain: 0.12 + rng.next() * 0.12, f0: 2400 + rng.next() * 1400, q: 4 });
        t += 0.04 + rng.next() * 0.06;
      }
    },
  };
}

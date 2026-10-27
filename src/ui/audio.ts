import { createRng } from "../gen/rng";

// Procedural audio (DESIGN 7.4). No files. The context is created only after a user gesture.
// Variance comes from the seeded generator rather than Math.random.

export interface Audio {
  unlock(): void; // call from a user gesture; starts the ambient bed once
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  stamp(): void;
  type(chars: number): void; // typewriter clicks for text that just appeared
}

export function createAudio(initialVolume: number, initialMuted: boolean): Audio {
  const rng = createRng(0x5eed1e5);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let volume = initialVolume;
  let muted = initialMuted;

  const level = (): number => (muted ? 0 : Math.max(0, Math.min(1, volume)));

  function noiseBuffer(c: AudioContext): AudioBuffer {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;
    return buf;
  }

  function startAmbient(c: AudioContext, out: AudioNode): void {
    const bed = c.createGain();
    bed.gain.value = 0.5;
    bed.connect(out);

    // Hum: a sine and a slightly detuned saw through a slowly drifting low-pass.
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 260;
    const humGain = c.createGain();
    humGain.gain.value = 0.07;
    filter.connect(humGain).connect(bed);
    const sine = c.createOscillator();
    sine.type = "sine";
    sine.frequency.value = 55;
    const saw = c.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 55.4;
    sine.connect(filter);
    saw.connect(filter);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain).connect(filter.frequency);

    // Low-passed noise bed.
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const nf = c.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 420;
    const ng = c.createGain();
    ng.gain.value = 0.05;
    src.connect(nf).connect(ng).connect(bed);

    for (const n of [sine, saw, lfo, src]) n.start();
  }

  function burst(c: AudioContext, out: AudioNode, at: number, dur: number, freq: number, q: number, gain: number): void {
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(at, rng.next() * 1.5, dur + 0.02);
  }

  return {
    unlock() {
      if (ctx !== null) {
        void ctx.resume();
        return;
      }
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = level();
        master.connect(ctx.destination);
        noise = noiseBuffer(ctx);
        startAmbient(ctx, master);
        void ctx.resume();
      } catch {
        ctx = null;
      }
    },
    setVolume(v) {
      volume = v;
      if (master !== null && ctx !== null) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
    },
    setMuted(m) {
      muted = m;
      if (master !== null && ctx !== null) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03);
    },
    stamp() {
      if (ctx === null || master === null || muted) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const f0 = 95 * (0.9 + rng.next() * 0.2);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.25);
      burst(ctx, master, t, 0.05, 1400, 0.8, 0.5);
    },
    type(chars) {
      if (ctx === null || master === null || muted) return;
      const n = Math.max(1, Math.min(14, Math.round(chars / 5)));
      let t = ctx.currentTime + 0.02;
      for (let i = 0; i < n; i++) {
        burst(ctx, master, t, 0.014, 2400 + rng.next() * 1400, 4, 0.12 + rng.next() * 0.12);
        t += 0.04 + rng.next() * 0.06;
      }
    },
  };
}

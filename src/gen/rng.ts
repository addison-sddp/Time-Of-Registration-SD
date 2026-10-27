// Seedable randomness for the generator. Nothing here reads a clock or a global source.

export interface Rng {
  next(): number; // float in [0, 1)
  uint32(): number; // integer in [0, 2^32)
  int(min: number, max: number): number; // inclusive on both ends
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  shuffle<T>(items: readonly T[]): T[]; // Fisher-Yates on a copy
}

// Mulberry32: returns the raw 32-bit stream.
export function mulberry32Uint32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// The usual float form of mulberry32, in [0, 1).
export function mulberry32(seed: number): () => number {
  const raw = mulberry32Uint32(seed);
  return () => raw() / 4294967296;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// 32-bit FNV-1a. Code units above 0xff contribute both bytes.
export function fnv1a(text: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), FNV_PRIME);
    if (c > 0xff) h = Math.imul(h ^ (c >>> 8), FNV_PRIME);
  }
  return h >>> 0;
}

// Murmur3 finalizer: spreads FNV's weak low-bit differences across all bits.
function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// hash(save_salt, shift_id) and hash(save_salt, shift_id, attempt_number) are both this.
// Parts are joined with a separator so ("ab", "c") and ("a", "bc") differ.
export function hashSeed(...parts: ReadonlyArray<string | number>): number {
  return mix32(fnv1a(parts.map(String).join("\u001f")));
}

export function createRng(seed: number): Rng {
  const raw = mulberry32Uint32(seed);
  const next = (): number => raw() / 4294967296;
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new Error(`int range invalid: ${min}..${max}`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("pick from empty list");
    return items[int(0, items.length - 1)] as T;
  };
  const weighted = <T>(entries: readonly (readonly [T, number])[]): T => {
    const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) throw new Error("weighted pick needs a positive weight");
    let roll = next() * total;
    for (const [item, w] of entries) {
      roll -= Math.max(0, w);
      if (roll < 0) return item;
    }
    return (entries[entries.length - 1] as readonly [T, number])[0];
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  };
  return { next, uint32: raw, int, chance: (p) => next() < p, pick, weighted, shuffle };
}

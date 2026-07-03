// ===========================================================================
// Seeded pseudo-random number generator (RNG)
// Port of com.watabou.utils.Random from TownGeneratorOS/Dwellings
// ===========================================================================

export class RNG {
  seed: number;
  static readonly G = 48271;
  static readonly N = 2147483647;

  constructor(seed: number) {
    this.seed = seed;
  }

  private next(): number {
    this.seed = Math.floor((this.seed * RNG.G) % RNG.N);
    return this.seed;
  }

  /** Float in [0, 1) */
  float(): number { return this.next() / RNG.N; }

  /** Average of 3 floats (approximate normal distribution) */
  normal(): number { return (this.float() + this.float() + this.float()) / 3; }

  /** Boolean with given probability */
  chance(p: number = 0.5): boolean { return this.float() < p; }

  /** Integer in [min, max) */
  int(min: number, max: number): number {
    return Math.floor(min + ((this.next() / RNG.N) * (max - min)));
  }

  /** Integer in [0, max) */
  intMax(max: number): number { return Math.floor(this.float() * max); }

  /** Pick random element */
  pick<T>(arr: T[]): T { return arr[this.intMax(arr.length)]; }

  /** Weighted random pick */
  weighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.float() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Pick n random elements without replacement */
  subset<T>(arr: T[], n: number): T[] {
    const pool = [...arr];
    const result: T[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) {
      result.push(pool.splice(this.intMax(pool.length), 1)[0]);
    }
    return result;
  }

  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.intMax(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Clamp value between min and max */
  static gate(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
  }
}

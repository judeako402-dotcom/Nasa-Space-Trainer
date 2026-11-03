export interface Rng {
  next(): number;
  int(max: number): number;
  pick<T>(items: T[]): T;
  shuffle<T>(items: T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(max: number): number {
      return Math.floor(next() * Math.max(1, max));
    },
    pick<T>(items: T[]): T {
      return items[Math.floor(next() * items.length)] ?? items[0]!;
    },
    shuffle<T>(items: T[]): T[] {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
      }
      return copy;
    },
  };
}

export function seedFor(day: number, penaltyDay: number, salt = 0): number {
  return (day * 7919 + penaltyDay * 104729 + salt * 1543 + 3042) >>> 0;
}

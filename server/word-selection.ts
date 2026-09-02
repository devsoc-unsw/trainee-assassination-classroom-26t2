// T10: per-room word selection.

import type { WordDeck } from "@/shared/types";
import { WORDS, type WordEntry } from "./words";

// mulberry32: small, fast, and deterministic for a given seed.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(seed: number): number[] {
  const random = createRandom(seed);
  const order = WORDS.map((_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function createWordDeck(
  seed: number = Math.floor(Math.random() * 2 ** 32),
): WordDeck {
  return { seed, order: shuffledIndices(seed), cursor: 0 };
}

export function drawWord(deck: WordDeck): WordEntry {
  if (deck.cursor >= deck.order.length) {
    deck.seed = (deck.seed + 1) >>> 0;
    deck.order = shuffledIndices(deck.seed);
    deck.cursor = 0;
  }
  return WORDS[deck.order[deck.cursor++]];
}

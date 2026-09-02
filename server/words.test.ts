// T10: A failure here means fix the list, not the test.

import { describe, expect, it } from "vitest";
import {
  ALLOWED_S_ENDINGS,
  CATEGORY_HINTS,
  WORDS,
  normaliseWord,
} from "./words";
import { createWordDeck, drawWord } from "./word-selection";

const MIN_WORDS_PER_CATEGORY = 8;
const MIN_TOTAL_WORDS = 200;
const MIN_CATEGORIES = 15;

function byCategory(): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const entry of WORDS) {
    const words = grouped.get(entry.category) ?? [];
    words.push(entry.word);
    grouped.set(entry.category, words);
  }
  return grouped;
}

describe("word list size", () => {
  it("has at least 200 entries across at least 15 categories", () => {
    expect(
      WORDS.length,
      `only ${WORDS.length} entries, need ${MIN_TOTAL_WORDS}`,
    ).toBeGreaterThanOrEqual(MIN_TOTAL_WORDS);
    expect(
      CATEGORY_HINTS.length,
      `only ${CATEGORY_HINTS.length} categories, need ${MIN_CATEGORIES}`,
    ).toBeGreaterThanOrEqual(MIN_CATEGORIES);
  });

  it("never drops below eight words in a category", () => {
    const thin = [...byCategory()]
      .filter(([, words]) => words.length < MIN_WORDS_PER_CATEGORY)
      .map(([category, words]) => `${category} (${words.length})`);

    expect(thin, `categories below ${MIN_WORDS_PER_CATEGORY}`).toEqual([]);
  });
});

describe("harsh matching constraints", () => {
  it("has no plural outside the allowed exceptions", () => {
    const plurals = WORDS.map((entry) => entry.word).filter(
      (word) => word.endsWith("s") && !ALLOWED_S_ENDINGS.has(word),
    );

    expect(plurals, "add to ALLOWED_S_ENDINGS only if singular").toEqual([]);
  });

  it("has no two entries in a category that normalise the same", () => {
    const clashes: string[] = [];
    for (const [category, words] of byCategory()) {
      const seen = new Set<string>();
      for (const word of words) {
        const key = normaliseWord(word);
        if (seen.has(key)) {
          clashes.push(`${category}: ${key}`);
        }
        seen.add(key);
      }
    }

    expect(clashes).toEqual([]);
  });

  it("has no word in more than one category", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const entry of WORDS) {
      const key = normaliseWord(entry.word);
      const existing = owner.get(key);
      if (existing && existing !== entry.category) {
        clashes.push(`${key}: ${existing} + ${entry.category}`);
      }
      owner.set(key, entry.category);
    }

    expect(clashes).toEqual([]);
  });

  it("stores words without articles and already normalised", () => {
    const bad = WORDS.map((entry) => entry.word).filter(
      (word) => /^(a|an|the) /.test(word) || normaliseWord(word) !== word,
    );

    expect(bad).toEqual([]);
  });

  // Anything outside plain lowercase letters and single spaces is a guess the
  // player cannot reliably type: curly apostrophes, digits, colons, accents.
  it("uses only lowercase letters and single spaces", () => {
    const bad = WORDS.map((entry) => entry.word).filter(
      (word) => !/^[a-z]+( [a-z]+)*$/.test(word),
    );

    expect(bad).toEqual([]);
  });

  it("gives every category an article in its hint", () => {
    const bad = CATEGORY_HINTS.filter(
      (hint) => !/^(a|an|the|something) /.test(hint),
    );

    expect(bad).toEqual([]);
  });
});

describe("word selection", () => {
  it("never repeats until the whole list is drawn", () => {
    const deck = createWordDeck(1234);
    const seen = new Set<string>();
    for (let i = 0; i < WORDS.length; i++) {
      seen.add(drawWord(deck).word);
    }

    expect(seen.size).toBe(WORDS.length);
  });

  // A game longer than the list must keep dealing, not crash or spin.
  it("keeps dealing past the end of the list", () => {
    const deck = createWordDeck(1234);
    for (let i = 0; i < WORDS.length * 3 + 7; i++) {
      expect(drawWord(deck).word.length).toBeGreaterThan(0);
    }
  });

  it("gives concurrent rooms independent sequences", () => {
    const a = createWordDeck(1);
    const b = createWordDeck(2);
    const drawTen = (deck: ReturnType<typeof createWordDeck>) =>
      Array.from({ length: 10 }, () => drawWord(deck).word).join(",");

    expect(drawTen(a)).not.toBe(drawTen(b));
  });

  it("is reproducible for a given seed", () => {
    expect(drawWord(createWordDeck(99)).word).toBe(
      drawWord(createWordDeck(99)).word,
    );
  });
});

import { WORD_BANK, Word } from './words';

function shuffle<T>(array: T[]): T[] {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class WordSelector {
  roomId: string;
  private wordBank: Word[];
  private deck: Word[];
  private cursor: number;

  constructor(roomId: string, wordBank: Word[] = WORD_BANK) {
    this.roomId = roomId;
    this.wordBank = wordBank;
    this.deck = shuffle(this.wordBank);
    this.cursor = 0;
  }

  next(): Word {
    if (this.cursor >= this.deck.length) {
      this.deck = shuffle(this.wordBank);
      this.cursor = 0;
    }
    const entry = this.deck[this.cursor];
    this.cursor += 1;
    return entry;
  }

  get cursorPosition(): number {
    return this.cursor;
  }
}

export { shuffle };
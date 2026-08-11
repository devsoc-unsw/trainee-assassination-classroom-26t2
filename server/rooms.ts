import type { GameState, Room, RoomCode } from "@/shared/types";

const CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const rooms = new Map<RoomCode, Room>();

export function generateUniqueCode(): RoomCode {
  let code: RoomCode;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
    ).join("");
  } while (rooms.has(code));
  return code;
}

export function createInitialGameState(): GameState {
  return {
    phase: "LOBBY",
    roundNumber: 0,
    pass: 1,
    turnIndex: 0,
    turnOrder: [],
    word: "",
    category: "",
    imposterId: null,
    strokes: [],
    votes: [],
    accusedId: null,
    finalGuess: null,
    scores: { groupRoundsWon: 0, imposterRoundsWon: 0, perPlayer: {} },
    phaseEndsAt: null,
  };
}

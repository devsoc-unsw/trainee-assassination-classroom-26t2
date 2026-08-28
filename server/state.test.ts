import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Room } from "@/shared/types";
import { createInitialGameState } from "./rooms";
import {
  assertPhase,
  beginDrawing,
  endDrawing,
  endGame,
  endRoundReveal,
  resolveRoundWinner,
  serialiseStateFor,
  startRound,
  toFinalGuess,
  toRoundRevealFromFinalGuess,
  toRoundRevealFromVoting,
} from "./state";

const PLAYERS = ["alice", "bob", "carol", "dave"];

function stateAt(phase: GameState["phase"], overrides: Partial<GameState> = {}): GameState {
  return {
    ...createInitialGameState(),
    phase,
    turnOrder: PLAYERS,
    imposterId: PLAYERS[1],
    word: "cat",
    category: "an animal",
    ...overrides,
  };
}

function roomWith(state: GameState): Room {
  return {
    code: "ABC123",
    hostId: PLAYERS[0],
    players: PLAYERS.map((id) => ({
      id,
      nickname: id,
      colour: "#000",
      connected: true,
      ready: true,
    })),
    state,
  };
}

describe("assertPhase", () => {
  it("accepts an event whose phase is in the allowed list", () => {
    const result = assertPhase(stateAt("DRAWING"), ["DRAWING"], "stroke_start");
    expect(result.ok).toBe(true);
  });

  it("rejects and logs a client event that arrives in the wrong phase", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = assertPhase(stateAt("LOBBY"), ["DRAWING"], "submit_stroke");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WRONG_PHASE");
    }
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("valid transitions", () => {
  it("LOBBY -> ROUND_STARTING via startRound", () => {
    const result = startRound(stateAt("LOBBY"), {
      roundNumber: 1,
      turnOrder: PLAYERS,
      imposterId: PLAYERS[0],
      word: "cat",
      category: "an animal",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("ROUND_STARTING");
      expect(result.data.roundNumber).toBe(1);
      expect(result.data.strokes).toEqual([]);
    }
  });

  it("SCORING -> ROUND_STARTING via startRound (the game loop)", () => {
    const result = startRound(stateAt("SCORING"), {
      roundNumber: 2,
      turnOrder: PLAYERS,
      imposterId: PLAYERS[0],
      word: "dog",
      category: "an animal",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("ROUND_STARTING");
  });

  it("ROUND_STARTING -> DRAWING via beginDrawing", () => {
    const result = beginDrawing(stateAt("ROUND_STARTING"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("DRAWING");
  });

  it("DRAWING -> VOTING via endDrawing", () => {
    const result = endDrawing(stateAt("DRAWING"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("VOTING");
  });

  it("VOTING -> FINAL_GUESS when the accused is the imposter (caught branch)", () => {
    const state = stateAt("VOTING");
    const result = toFinalGuess(state, state.imposterId!);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("FINAL_GUESS");
      expect(result.data.accusedId).toBe(state.imposterId);
    }
  });

  it("VOTING -> ROUND_REVEAL when the accused is not the imposter (survival branch)", () => {
    const state = stateAt("VOTING");
    const result = toRoundRevealFromVoting(state, PLAYERS[2]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("ROUND_REVEAL");
      expect(result.data.accusedId).toBe(PLAYERS[2]);
    }
  });

  it("VOTING -> ROUND_REVEAL on a tie (accusedId null also counts as survival)", () => {
    const result = toRoundRevealFromVoting(stateAt("VOTING"), null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("ROUND_REVEAL");
      expect(result.data.accusedId).toBeNull();
    }
  });

  it("FINAL_GUESS -> ROUND_REVEAL via toRoundRevealFromFinalGuess", () => {
    const result = toRoundRevealFromFinalGuess(stateAt("FINAL_GUESS"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("ROUND_REVEAL");
  });

  it("ROUND_REVEAL -> SCORING via endRoundReveal, tallying the round", () => {
    const state = stateAt("ROUND_REVEAL", { accusedId: null });
    const result = endRoundReveal(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("SCORING");
      // survival branch: imposter wins outright
      expect(result.data.scores.imposterRoundsWon).toBe(1);
    }
  });

  it("SCORING -> GAME_OVER via endGame", () => {
    const result = endGame(stateAt("SCORING"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("GAME_OVER");
  });
});

describe("invalid transitions", () => {
  it("rejects beginDrawing from LOBBY", () => {
    const result = beginDrawing(stateAt("LOBBY"));
    expect(result.ok).toBe(false);
  });

  it("rejects endDrawing from VOTING", () => {
    const result = endDrawing(stateAt("VOTING"));
    expect(result.ok).toBe(false);
  });

  it("rejects startRound from DRAWING", () => {
    const result = startRound(stateAt("DRAWING"), {
      roundNumber: 2,
      turnOrder: PLAYERS,
      imposterId: PLAYERS[0],
      word: "dog",
      category: "an animal",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects toFinalGuess out of VOTING when the accused is not the imposter", () => {
    const state = stateAt("VOTING");
    const result = toFinalGuess(state, PLAYERS[2]);
    expect(result.ok).toBe(false);
  });

  it("rejects toRoundRevealFromVoting out of VOTING when the accused is the imposter", () => {
    const state = stateAt("VOTING");
    const result = toRoundRevealFromVoting(state, state.imposterId!);
    expect(result.ok).toBe(false);
  });

  it("toFinalGuess reports the phase as the cause when phase and accusation are both wrong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = stateAt("DRAWING");
    const result = toFinalGuess(state, PLAYERS[2]); // not the imposter either
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("DRAWING");
    expect(warn.mock.calls[0][0]).toContain("to_final_guess");
    expect(warn.mock.calls[0][0]).toContain("DRAWING");
    warn.mockRestore();
  });

  it("toRoundRevealFromVoting reports the phase as the cause when phase and accusation are both wrong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = stateAt("DRAWING");
    const result = toRoundRevealFromVoting(state, state.imposterId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("DRAWING");
    warn.mockRestore();
  });
});

describe("resolveRoundWinner", () => {
  it("imposter wins when nobody was accused", () => {
    const state = stateAt("ROUND_REVEAL", { accusedId: null });
    expect(resolveRoundWinner(state)).toBe("IMPOSTER");
  });

  it("imposter wins when caught but guessed correctly", () => {
    const state = stateAt("ROUND_REVEAL", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "Cat!", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("IMPOSTER");
  });

  it("group wins when caught and guessed wrong", () => {
    const state = stateAt("ROUND_REVEAL", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "dog", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("GROUP");
  });

  it("group wins when caught and the guess timed out empty", () => {
    const state = stateAt("ROUND_REVEAL", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("GROUP");
  });

  it("does not give the group a match on a plural", () => {
    const state = stateAt("ROUND_REVEAL", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "cats", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("GROUP");
  });
});

describe("serialiseStateFor", () => {
  let room: Room;

  beforeEach(() => {
    room = roomWith(stateAt("DRAWING"));
  });

  it("gives the imposter isImposter and category, never the word", () => {
    const view = serialiseStateFor(room.state.imposterId!, room);
    expect(view.secret).toEqual({ isImposter: true, category: "an animal" });
    expect(view.secret).not.toHaveProperty("word");
  });

  it("gives a non-imposter the word and category, never isImposter", () => {
    const nonImposter = PLAYERS.find((id) => id !== room.state.imposterId)!;
    const view = serialiseStateFor(nonImposter, room);
    expect(view.secret).toEqual({ category: "an animal", word: "cat" });
    expect(view.secret).not.toHaveProperty("isImposter");
  });

  it("withholds the reveal before ROUND_REVEAL", () => {
    const view = serialiseStateFor(PLAYERS[0], room);
    expect(view.reveal).toBeNull();
  });

  it("exposes only a vote count, never the vote mapping, before reveal", () => {
    room.state.votes = [{ voterId: PLAYERS[0], targetId: PLAYERS[1] }];
    const view = serialiseStateFor(PLAYERS[0], room);
    expect(view.voteCount).toBe(1);
    expect(view).not.toHaveProperty("votes");
  });

  it("includes the full reveal, including imposterId and votes, once in ROUND_REVEAL", () => {
    room = roomWith(
      stateAt("ROUND_REVEAL", {
        accusedId: room.state.imposterId,
        votes: [{ voterId: PLAYERS[0], targetId: room.state.imposterId! }],
        finalGuess: { text: "cat", submittedAt: 0 },
      }),
    );
    const view = serialiseStateFor(PLAYERS[0], room);
    expect(view.reveal).not.toBeNull();
    expect(view.reveal?.imposterId).toBe(room.state.imposterId);
    expect(view.reveal?.winner).toBe("IMPOSTER");
  });

  it("never leaves phase undefined on the returned view", () => {
    for (const phase of [
      "LOBBY",
      "ROUND_STARTING",
      "DRAWING",
      "VOTING",
      "FINAL_GUESS",
      "ROUND_REVEAL",
      "SCORING",
      "GAME_OVER",
    ] as const) {
      const view = serialiseStateFor(PLAYERS[0], roomWith(stateAt(phase)));
      expect(view.phase).toBe(phase);
    }
  });
});

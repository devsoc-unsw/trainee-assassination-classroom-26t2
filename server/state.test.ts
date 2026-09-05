import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Room } from "@/shared/types";
import { createInitialGameState, createRoom, joinRoom, promoteSpectators } from "./rooms";
import {
  advanceTurn,
  allConnectedVoted,
  assertPhase,
  beginDrawing,
  castVote,
  dropFromTurnOrder,
  endDrawing,
  endGame,
  endRoundReveal,
  isCurrentDrawer,
  isGameOver,
  pickImposter,
  resolveRoundWinner,
  serialiseStateFor,
  settleVoting,
  startRound,
  submitGuess,
  tallyVotes,
  toFinalGuess,
  toRoundRevealFromFinalGuess,
  toRoundRevealFromVoting,
} from "./state";
import { createWordDeck } from "./word-selection";

const PLAYERS = ["alice", "bob", "carol", "dave"];

function stateAt(
  phase: GameState["phase"],
  overrides: Partial<GameState> = {},
): GameState {
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
      isSpectator: false,
    })),
    state,
    deck: createWordDeck(1),
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

  it("startRound carries scores across rounds but resets the canvas and votes", () => {
    const previous = stateAt("SCORING", {
      scores: { groupRoundsWon: 3, imposterRoundsWon: 1, perPlayer: {} },
      strokes: [{ id: "s1", playerId: PLAYERS[0], colour: "#000", points: [] }],
      votes: [{ voterId: PLAYERS[1], targetId: PLAYERS[2] }],
    });
    const result = startRound(previous, {
      roundNumber: previous.roundNumber + 1,
      turnOrder: PLAYERS,
      imposterId: PLAYERS[0],
      word: "dog",
      category: "an animal",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.scores).toEqual(previous.scores);
      expect(result.data.strokes).toEqual([]);
      expect(result.data.votes).toEqual([]);
    }
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

describe("advanceTurn", () => {
  it("moves to the next player inside a pass", () => {
    const result = advanceTurn(stateAt("DRAWING", { turnIndex: 0, pass: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("DRAWING");
      expect(result.data.turnIndex).toBe(1);
      expect(result.data.pass).toBe(1);
    }
  });

  it("clears strokeSubmittedThisTurn for the next player, whether or not the outgoing turn drew", () => {
    for (const outgoing of [true, false]) {
      const result = advanceTurn(
        stateAt("DRAWING", {
          turnIndex: 0,
          pass: 1,
          strokeSubmittedThisTurn: outgoing,
        }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.strokeSubmittedThisTurn).toBe(false);
    }
  });

  it("wraps off the end of pass 1 into pass 2", () => {
    const result = advanceTurn(
      stateAt("DRAWING", { turnIndex: PLAYERS.length - 1, pass: 1 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("DRAWING");
      expect(result.data.turnIndex).toBe(0);
      expect(result.data.pass).toBe(2);
      expect(result.data.strokeSubmittedThisTurn).toBe(false);
    }
  });

  it("DRAWING -> VOTING off the end of pass 2", () => {
    const result = advanceTurn(
      stateAt("DRAWING", { turnIndex: PLAYERS.length - 1, pass: 2 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("VOTING");
  });

  it("DRAWING -> VOTING when everyone has left the rotation", () => {
    const result = advanceTurn(
      stateAt("DRAWING", { turnOrder: [], turnIndex: 0, pass: 1 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phase).toBe("VOTING");
  });

  it("is rejected outside DRAWING", () => {
    expect(advanceTurn(stateAt("VOTING")).ok).toBe(false);
  });
});

describe("dropFromTurnOrder", () => {
  it("keeps the current drawer when someone earlier leaves", () => {
    const state = dropFromTurnOrder(
      stateAt("DRAWING", { turnIndex: 2 }),
      PLAYERS[0],
    );
    expect(state.turnOrder).toEqual(["bob", "carol", "dave"]);
    expect(state.turnOrder[state.turnIndex]).toBe(PLAYERS[2]);
  });

  it("keeps the current drawer when someone later leaves", () => {
    const state = dropFromTurnOrder(
      stateAt("DRAWING", { turnIndex: 1 }),
      PLAYERS[3],
    );
    expect(state.turnOrder).toEqual(["alice", "bob", "carol"]);
    expect(state.turnOrder[state.turnIndex]).toBe(PLAYERS[1]);
  });

  it("leaves the index on the next player when the current drawer leaves", () => {
    const state = dropFromTurnOrder(
      stateAt("DRAWING", { turnIndex: 1 }),
      PLAYERS[1],
    );
    expect(state.turnOrder).toEqual(["alice", "carol", "dave"]);
    expect(state.turnOrder[state.turnIndex]).toBe(PLAYERS[2]);
  });

  it("wraps to the start when the last player in the order leaves", () => {
    const state = dropFromTurnOrder(
      stateAt("DRAWING", { turnIndex: PLAYERS.length - 1 }),
      PLAYERS[PLAYERS.length - 1],
    );
    expect(state.turnIndex).toBe(0);
  });

  it("ignores a player who is not in the rotation", () => {
    const before = stateAt("DRAWING", { turnIndex: 2 });
    expect(dropFromTurnOrder(before, "mallory")).toBe(before);
  });
});

describe("isCurrentDrawer", () => {
  it("is true only for the player at turnIndex", () => {
    const state = stateAt("DRAWING", { turnIndex: 1 });
    expect(isCurrentDrawer(state, PLAYERS[1])).toBe(true);
    expect(isCurrentDrawer(state, PLAYERS[0])).toBe(false);
  });

  it("is false outside DRAWING", () => {
    const state = stateAt("VOTING", { turnIndex: 1 });
    expect(isCurrentDrawer(state, PLAYERS[1])).toBe(false);
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

  it('"The Cat!" matches the word "the cat" after normalisation', () => {
    const state = stateAt("ROUND_REVEAL", {
      word: "the cat",
      accusedId: PLAYERS[1],
      finalGuess: { text: "The Cat!", submittedAt: 0 },
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

  it("an empty guess never matches an empty (malformed) word", () => {
    const state = stateAt("ROUND_REVEAL", {
      word: "",
      accusedId: PLAYERS[1],
      finalGuess: { text: "", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("GROUP");
  });

  it("a real guess never matches an empty (malformed) word", () => {
    const state = stateAt("ROUND_REVEAL", {
      word: "   ",
      accusedId: PLAYERS[1],
      finalGuess: { text: "anything", submittedAt: 0 },
    });
    expect(resolveRoundWinner(state)).toBe("GROUP");
  });
});

describe("isGameOver", () => {
  it("is false before the last round has been played", () => {
    expect(isGameOver(stateAt("SCORING", { roundNumber: 2 }))).toBe(false);
  });

  it("is true once ROUNDS_PER_GAME rounds have been played", () => {
    expect(isGameOver(stateAt("SCORING", { roundNumber: 3 }))).toBe(true);
  });
});

describe("roundWinner is frozen when the terminal phase completes", () => {
  it("survival branch: toRoundRevealFromVoting stores the winner (imposter)", () => {
    const result = toRoundRevealFromVoting(stateAt("VOTING"), PLAYERS[2]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.roundWinner).toBe("IMPOSTER");
  });

  it("tie (accusedId null) also freezes an imposter win", () => {
    const result = toRoundRevealFromVoting(stateAt("VOTING"), null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.roundWinner).toBe("IMPOSTER");
  });

  it("caught branch: a correct guess freezes an imposter win", () => {
    const state = stateAt("FINAL_GUESS", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "cat", submittedAt: 0 },
    });
    const result = toRoundRevealFromFinalGuess(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.roundWinner).toBe("IMPOSTER");
  });

  it("caught branch: a wrong guess freezes a group win", () => {
    const state = stateAt("FINAL_GUESS", {
      accusedId: PLAYERS[1],
      finalGuess: { text: "dog", submittedAt: 0 },
    });
    const result = toRoundRevealFromFinalGuess(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.roundWinner).toBe("GROUP");
  });

  it("startRound clears the previous round's winner", () => {
    const result = startRound(stateAt("SCORING", { roundWinner: "IMPOSTER" }), {
      roundNumber: 2,
      turnOrder: PLAYERS,
      imposterId: PLAYERS[0],
      word: "dog",
      category: "an animal",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.roundWinner).toBeNull();
  });
});

describe("running tally across rounds", () => {
  it("accumulates group/imposter wins and per-imposter records", () => {
    // Round 1: imposter caught and guessed wrong -> GROUP.
    const round1 = endRoundReveal(
      stateAt("ROUND_REVEAL", {
        roundNumber: 1,
        accusedId: PLAYERS[1],
        roundWinner: "GROUP",
      }),
    );
    expect(round1.ok).toBe(true);
    if (!round1.ok) return;
    expect(round1.data.scores.groupRoundsWon).toBe(1);
    expect(round1.data.scores.imposterRoundsWon).toBe(0);
    expect(round1.data.scores.perPlayer[PLAYERS[1]]).toEqual({
      roundsAsImposter: 1,
      roundsWonAsImposter: 0,
    });

    // Round 2: same imposter survives the vote -> IMPOSTER.
    const round2 = endRoundReveal(
      stateAt("ROUND_REVEAL", {
        roundNumber: 2,
        accusedId: null,
        roundWinner: "IMPOSTER",
        scores: round1.data.scores,
      }),
    );
    expect(round2.ok).toBe(true);
    if (!round2.ok) return;
    expect(round2.data.scores.groupRoundsWon).toBe(1);
    expect(round2.data.scores.imposterRoundsWon).toBe(1);
    expect(round2.data.scores.perPlayer[PLAYERS[1]]).toEqual({
      roundsAsImposter: 2,
      roundsWonAsImposter: 1,
    });
  });
});

describe("castVote", () => {
  const CONNECTED = PLAYERS;

  it("records a vote during VOTING", () => {
    const result = castVote(
      stateAt("VOTING"),
      PLAYERS[0],
      PLAYERS[2],
      CONNECTED,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.votes).toEqual([
        { voterId: PLAYERS[0], targetId: PLAYERS[2] },
      ]);
    }
  });

  it("rejects a self vote", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = castVote(
      stateAt("VOTING"),
      PLAYERS[0],
      PLAYERS[0],
      CONNECTED,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SELF_VOTE");
    warn.mockRestore();
  });

  it("rejects a vote for a player who is no longer connected", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = castVote(stateAt("VOTING"), PLAYERS[0], PLAYERS[3], [
      PLAYERS[0],
      PLAYERS[1],
      PLAYERS[2],
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_VOTE_TARGET");
    warn.mockRestore();
  });

  it("counts only the latest vote after three changes of mind", () => {
    let state = stateAt("VOTING");
    for (const target of [PLAYERS[1], PLAYERS[2], PLAYERS[3], PLAYERS[2]]) {
      const result = castVote(state, PLAYERS[0], target, CONNECTED);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.data;
    }
    expect(state.votes).toEqual([
      { voterId: PLAYERS[0], targetId: PLAYERS[2] },
    ]);
  });

  it("is rejected outside VOTING", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = castVote(
      stateAt("DRAWING"),
      PLAYERS[0],
      PLAYERS[1],
      CONNECTED,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_PHASE");
    warn.mockRestore();
  });
});

describe("tallyVotes", () => {
  it("returns the plurality winner", () => {
    expect(
      tallyVotes([
        { voterId: PLAYERS[0], targetId: PLAYERS[1] },
        { voterId: PLAYERS[2], targetId: PLAYERS[1] },
        { voterId: PLAYERS[3], targetId: PLAYERS[0] },
      ]),
    ).toBe(PLAYERS[1]);
  });

  it("returns null on a tie for the lead", () => {
    expect(
      tallyVotes([
        { voterId: PLAYERS[0], targetId: PLAYERS[1] },
        { voterId: PLAYERS[2], targetId: PLAYERS[3] },
      ]),
    ).toBeNull();
  });

  it("returns null when nobody voted", () => {
    expect(tallyVotes([])).toBeNull();
  });
});

describe("allConnectedVoted", () => {
  it("is false while a connected player still has not voted", () => {
    expect(
      allConnectedVoted(
        [
          { voterId: PLAYERS[0], targetId: PLAYERS[1] },
          { voterId: PLAYERS[1], targetId: PLAYERS[0] },
        ],
        PLAYERS,
      ),
    ).toBe(false);
  });

  it("is true once every connected player has voted", () => {
    expect(
      allConnectedVoted(
        PLAYERS.map((id, i) => ({
          voterId: id,
          targetId: PLAYERS[(i + 1) % PLAYERS.length],
        })),
        PLAYERS,
      ),
    ).toBe(true);
  });

  it("ignores a disconnected player who left the denominator", () => {
    expect(
      allConnectedVoted(
        [
          { voterId: PLAYERS[0], targetId: PLAYERS[1] },
          { voterId: PLAYERS[1], targetId: PLAYERS[0] },
          { voterId: PLAYERS[2], targetId: PLAYERS[0] },
        ],
        [PLAYERS[0], PLAYERS[1], PLAYERS[2]],
      ),
    ).toBe(true);
  });
});

describe("settleVoting", () => {
  it("takes the caught branch to FINAL_GUESS when the imposter has the plurality", () => {
    const state = stateAt("VOTING", {
      votes: [
        { voterId: PLAYERS[0], targetId: PLAYERS[1] },
        { voterId: PLAYERS[2], targetId: PLAYERS[1] },
        { voterId: PLAYERS[3], targetId: PLAYERS[0] },
      ],
    });
    const result = settleVoting(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("FINAL_GUESS");
      expect(result.data.accusedId).toBe(PLAYERS[1]);
    }
  });

  it("takes the survival branch to ROUND_REVEAL when a non-imposter is accused", () => {
    const state = stateAt("VOTING", {
      votes: [
        { voterId: PLAYERS[0], targetId: PLAYERS[2] },
        { voterId: PLAYERS[1], targetId: PLAYERS[2] },
      ],
    });
    const result = settleVoting(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("ROUND_REVEAL");
      expect(result.data.accusedId).toBe(PLAYERS[2]);
    }
  });

  it("treats a tie as no accusation and the imposter surviving", () => {
    const state = stateAt("VOTING", {
      votes: [
        { voterId: PLAYERS[0], targetId: PLAYERS[1] },
        { voterId: PLAYERS[2], targetId: PLAYERS[3] },
      ],
    });
    const result = settleVoting(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phase).toBe("ROUND_REVEAL");
      expect(result.data.accusedId).toBeNull();
    }
  });

  it("is rejected outside VOTING", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(settleVoting(stateAt("DRAWING")).ok).toBe(false);
    warn.mockRestore();
  });
});

describe("submitGuess", () => {
  it("stores the imposter's guess, normalised, during FINAL_GUESS", () => {
    const state = stateAt("FINAL_GUESS", { accusedId: PLAYERS[1] });
    const result = submitGuess(state, PLAYERS[1], "  The   Cat! ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.finalGuess?.text).toBe("the cat");
      expect(typeof result.data.finalGuess?.submittedAt).toBe("number");
    }
  });

  it("rejects and logs a non-imposter, leaving the guess untouched", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = stateAt("FINAL_GUESS", { accusedId: PLAYERS[1] });
    const result = submitGuess(state, PLAYERS[0], "cat");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_IMPOSTER");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(state.finalGuess).toBeNull();
    warn.mockRestore();
  });

  it("is rejected outside FINAL_GUESS", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = submitGuess(stateAt("VOTING"), PLAYERS[1], "cat");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_PHASE");
    warn.mockRestore();
  });

  it("rejects a second guess once the phase has moved on (one guess only)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = submitGuess(
      stateAt("ROUND_REVEAL", {
        accusedId: PLAYERS[1],
        finalGuess: { text: "cat", submittedAt: 0 },
      }),
      PLAYERS[1],
      "dog",
    );
    expect(result.ok).toBe(false);
    warn.mockRestore();
  });

  it("caught branch end to end: settle -> guess -> reveal -> winner", () => {
    const voting = stateAt("VOTING", {
      votes: [
        { voterId: PLAYERS[0], targetId: PLAYERS[1] },
        { voterId: PLAYERS[2], targetId: PLAYERS[1] },
      ],
    });
    const settled = settleVoting(voting);
    expect(settled.ok && settled.data.phase).toBe("FINAL_GUESS");
    if (!settled.ok) return;

    for (const [guess, winner] of [
      ["a horse", "GROUP"],
      ["Cat!", "IMPOSTER"],
    ] as const) {
      const guessed = submitGuess(settled.data, PLAYERS[1], guess);
      expect(guessed.ok).toBe(true);
      if (!guessed.ok) continue;
      const revealed = toRoundRevealFromFinalGuess(guessed.data);
      expect(revealed.ok).toBe(true);
      if (!revealed.ok) continue;
      expect(revealed.data.phase).toBe("ROUND_REVEAL");
      expect(resolveRoundWinner(revealed.data)).toBe(winner);
    }
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

  it("exposes only who has voted, never the vote mapping, before reveal", () => {
    room = roomWith(stateAt("VOTING"));
    room.state.votes = [
      { voterId: PLAYERS[0], targetId: PLAYERS[1] },
      { voterId: PLAYERS[2], targetId: PLAYERS[1] },
    ];
    const view = serialiseStateFor(PLAYERS[0], room);
    expect(view.votedPlayerIds).toEqual([PLAYERS[0], PLAYERS[2]]);
    expect(view).not.toHaveProperty("votes");
    expect(JSON.stringify(view)).not.toContain("targetId");
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

  it("reveal.winner reflects the frozen roundWinner, identically for both views", () => {
    room = roomWith(
      stateAt("ROUND_REVEAL", {
        accusedId: PLAYERS[1],
        roundWinner: "GROUP",
        finalGuess: { text: "dog", submittedAt: 0 },
        votes: [{ voterId: PLAYERS[0], targetId: PLAYERS[1] }],
      }),
    );
    const imposterView = serialiseStateFor(room.state.imposterId!, room);
    const groupView = serialiseStateFor(PLAYERS[0], room);
    expect(imposterView.reveal?.winner).toBe("GROUP");
    expect(groupView.reveal?.winner).toBe("GROUP");
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

describe("pickImposter", () => {
  it("never repeats the previous imposter when another player exists", () => {
    const players = ["p1", "p2", "p3", "p4", "p5"];
    let previous: string | null = null;
    for (let i = 0; i < 200; i++) {
      const picked = pickImposter(players, previous);
      if (previous !== null) {
        expect(picked).not.toBe(previous);
      }
      previous = picked;
    }
  });

  it("distributes picks within a reasonable margin of even over many rounds", () => {
    const players = ["p1", "p2", "p3", "p4", "p5"];
    const rounds = 1000;
    const counts: Record<string, number> = {};
    let previous: string | null = null;
    for (let i = 0; i < rounds; i++) {
      const picked = pickImposter(players, previous);
      counts[picked] = (counts[picked] ?? 0) + 1;
      previous = picked;
    }
    const expected = rounds / players.length;
    for (const player of players) {
      expect(counts[player]).toBeGreaterThan(expected * 0.75);
      expect(counts[player]).toBeLessThan(expected * 1.25);
    }
  });

  it("falls back to the only player when there is just one", () => {
    expect(pickImposter(["p1"], "p1")).toBe("p1");
  });
});

describe("joinRoom mid game", () => {
  it("adds a mid game joiner as a spectator instead of rejecting them", () => {
    const room = createRoom("host", "Host");
    const started = startRound(room.state, {
      roundNumber: 1,
      turnOrder: ["host"],
      imposterId: "host",
      word: "cat",
      category: "animals",
    });
    if (started.ok) {
      room.state = started.data;
    }

    const result = joinRoom(room.code, "latecomer", "Latecomer");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const joined = result.data.players.find((p) => p.id === "latecomer");
      expect(joined?.isSpectator).toBe(true);
    }
  });

  it("still lets a normal lobby join happen as a full player", () => {
    const room = createRoom("host", "Host");

    const result = joinRoom(room.code, "p2", "Player Two");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const joined = result.data.players.find((p) => p.id === "p2");
      expect(joined?.isSpectator).toBe(false);
    }
  });
});

describe("promoteSpectators", () => {
  it("flips every spectator to a full player", () => {
    const room = createRoom("host", "Host");
    joinRoom(room.code, "watcher", "Watcher");
    const watcher = room.players.find((p) => p.id === "watcher");
    if (watcher) {
      watcher.isSpectator = true;
    }

    promoteSpectators(room);

    expect(room.players.every((p) => !p.isSpectator)).toBe(true);
  });
});

// T07: the server-authoritative game state machine.
//
// LOBBY → ROUND_STARTING → DRAWING → VOTING ┬→ FINAL_GUESS → ROUND_REVEAL → SCORING ┬→ GAME_OVER
//   ↑                                       └────────────────→ ROUND_REVEAL ─┘      │
//   └─────────────────────── (SCORING → ROUND_STARTING, next round) ─────────────-──┘
//
// Two jobs live here, and they turn out to be the same check:
//   1. A transition between phases is only legal from certain source phases.
//   2. A client event (submit a stroke, cast a vote...) is only legal during
//      certain phases.
// Both are answered by assertPhase. Transition functions use it to guard
// their own mutation; event handlers in index.ts use it directly to decide whether
// to accept an incoming event.
//
// serialiseStateFor is the only function allowed to read imposterId, word,
// or votes and turn them into something a specific client may see. Every
// socket emission of game state must go through it - never emit GameState.

import type { Result } from "@/shared/events";
import type {
  GameState,
  Phase,
  PlayerId,
  PlayerSecret,
  PublicGameState,
  Room,
  RoundReveal,
  Scores,
} from "@/shared/types";

export function assertPhase(
  state: GameState,
  allowed: Phase[],
  eventName: string,
): Result<void> {
  if (allowed.includes(state.phase)) {
    return { ok: true, data: undefined };
  }
  console.warn(
    `[state] rejected "${eventName}": phase is ${state.phase}, expected ${allowed.join(" or ")}`,
  );
  return {
    ok: false,
    code: "WRONG_PHASE",
    message: `${eventName} is not valid during ${state.phase}.`,
  };
}

function commitTransition(
  state: GameState,
  allowedFrom: Phase[],
  to: Phase,
  eventName: string,
  build: (state: GameState) => GameState,
): Result<GameState> {
  const guard = assertPhase(state, allowedFrom, eventName);
  if (!guard.ok) {
    return guard;
  }
  return { ok: true, data: { ...build(state), phase: to } };
}

export interface RoundStartParams {
  roundNumber: number;
  turnOrder: PlayerId[];
  imposterId: PlayerId;
  word: string;
  category: string;
}

// LOBBY -> ROUND_STARTING (first round) or SCORING -> ROUND_STARTING (every
// round after).
export function startRound(
  state: GameState,
  params: RoundStartParams,
): Result<GameState> {
  return commitTransition(
    state,
    ["LOBBY", "SCORING"],
    "ROUND_STARTING",
    "start_round",
    () => ({
      ...state,
      roundNumber: params.roundNumber,
      pass: 1,
      turnIndex: 0,
      turnOrder: params.turnOrder,
      word: params.word,
      category: params.category,
      imposterId: params.imposterId,
      strokes: [],
      votes: [],
      accusedId: null,
      finalGuess: null,
      phaseEndsAt: null,
    }),
  );
}

// ROUND_STARTING -> DRAWING
export function beginDrawing(state: GameState): Result<GameState> {
  return commitTransition(
    state,
    ["ROUND_STARTING"],
    "DRAWING",
    "begin_drawing",
    (s) => s,
  );
}

// DRAWING -> VOTING
export function endDrawing(state: GameState): Result<GameState> {
  return commitTransition(
    state,
    ["DRAWING"],
    "VOTING",
    "end_drawing",
    (s) => s,
  );
}

// VOTING -> FINAL_GUESS
export function toFinalGuess(
  state: GameState,
  accusedId: PlayerId,
): Result<GameState> {
  const guard = assertPhase(state, ["VOTING"], "to_final_guess");
  if (!guard.ok) {
    return guard;
  }
  if (accusedId !== state.imposterId) {
    console.warn(
      `[state] rejected "to_final_guess": accused ${accusedId} is not the imposter`,
    );
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "Final guess only follows accusing the actual imposter.",
    };
  }
  return { ok: true, data: { ...state, accusedId, phase: "FINAL_GUESS" } };
}

// VOTING -> ROUND_REVEAL
export function toRoundRevealFromVoting(
  state: GameState,
  accusedId: PlayerId | null,
): Result<GameState> {
  const guard = assertPhase(state, ["VOTING"], "to_round_reveal_from_voting");
  if (!guard.ok) {
    return guard;
  }
  if (accusedId !== null && accusedId === state.imposterId) {
    console.warn(
      `[state] rejected "to_round_reveal_from_voting": accused ${accusedId} is the imposter, final guess must run first`,
    );
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "The imposter was caught; final guess runs before reveal.",
    };
  }
  return { ok: true, data: { ...state, accusedId, phase: "ROUND_REVEAL" } };
}

// FINAL_GUESS -> ROUND_REVEAL
export function toRoundRevealFromFinalGuess(
  state: GameState,
): Result<GameState> {
  return commitTransition(
    state,
    ["FINAL_GUESS"],
    "ROUND_REVEAL",
    "to_round_reveal_from_final_guess",
    (s) => s,
  );
}

// ROUND_REVEAL -> SCORING
export function endRoundReveal(state: GameState): Result<GameState> {
  return commitTransition(
    state,
    ["ROUND_REVEAL"],
    "SCORING",
    "end_round_reveal",
    (s) => ({ ...s, scores: applyRoundResult(s) }),
  );
}

// SCORING -> GAME_OVER
export function endGame(state: GameState): Result<GameState> {
  return commitTransition(
    state,
    ["SCORING"],
    "GAME_OVER",
    "end_game",
    (s) => s,
  );
}

function normaliseGuess(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

export function resolveRoundWinner(state: GameState): "GROUP" | "IMPOSTER" {
  const caught =
    state.accusedId !== null && state.accusedId === state.imposterId;
  if (!caught) {
    return "IMPOSTER";
  }
  const guess = state.finalGuess?.text ?? "";
  return normaliseGuess(guess) === normaliseGuess(state.word)
    ? "IMPOSTER"
    : "GROUP";
}

function applyRoundResult(state: GameState): Scores {
  const winner = resolveRoundWinner(state);
  const scores: Scores = {
    groupRoundsWon: state.scores.groupRoundsWon,
    imposterRoundsWon: state.scores.imposterRoundsWon,
    perPlayer: { ...state.scores.perPlayer },
  };

  if (winner === "GROUP") {
    scores.groupRoundsWon += 1;
  } else {
    scores.imposterRoundsWon += 1;
  }

  if (state.imposterId) {
    const record = scores.perPlayer[state.imposterId] ?? {
      roundsAsImposter: 0,
      roundsWonAsImposter: 0,
    };
    scores.perPlayer[state.imposterId] = {
      roundsAsImposter: record.roundsAsImposter + 1,
      roundsWonAsImposter:
        record.roundsWonAsImposter + (winner === "IMPOSTER" ? 1 : 0),
    };
  }

  return scores;
}

export function serialiseStateFor(
  playerId: PlayerId,
  room: Room,
): PublicGameState {
  const { state } = room;
  const isImposter = state.imposterId === playerId;

  const secret: PlayerSecret = isImposter
    ? { isImposter: true, category: state.category }
    : { category: state.category, word: state.word };

  const revealed =
    state.phase === "ROUND_REVEAL" ||
    state.phase === "SCORING" ||
    state.phase === "GAME_OVER";

  const reveal: RoundReveal | null =
    revealed && state.imposterId
      ? {
          imposterId: state.imposterId,
          word: state.word,
          votes: state.votes,
          finalGuess: state.finalGuess,
          winner: resolveRoundWinner(state),
        }
      : null;

  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    pass: state.pass,
    turnIndex: state.turnIndex,
    turnOrder: state.turnOrder,
    strokes: state.strokes,
    accusedId: state.accusedId,
    phaseEndsAt: state.phaseEndsAt,
    scores: state.scores,
    voteCount: state.votes.length,
    secret,
    reveal,
  };
}

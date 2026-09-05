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
import { ROUNDS_PER_GAME } from "@/shared/types";
import type {
  GameState,
  ImposterGuess,
  Phase,
  PlayerId,
  PlayerSecret,
  PublicGameState,
  Room,
  RoundReveal,
  RoundWinner,
  Scores,
  Vote,
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
      strokeSubmittedThisTurn: false,
      word: params.word,
      category: params.category,
      imposterId: params.imposterId,
      strokes: [],
      votes: [],
      accusedId: null,
      finalGuess: null,
      roundWinner: null,
      phaseEndsAt: null,
    }),
  );
}

// Picks who's gonna be the imposter this round.
// Avoids repeating the same player two rounds in a row
export function pickImposter(
  playerIds: PlayerId[],
  previousImposterId: PlayerId | null,
): PlayerId {
  let eligible: PlayerId[];
  if (playerIds.length > 1) {
    eligible = playerIds.filter((id) => id !== previousImposterId);
  } else {
    eligible = playerIds;
  }
  return eligible[Math.floor(Math.random() * eligible.length)];
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

// Whose turn it is.
export function isCurrentDrawer(state: GameState, playerId: PlayerId): boolean {
  return (
    state.phase === "DRAWING" && state.turnOrder[state.turnIndex] === playerId
  );
}

// Hand the turn to the next player. Running off the end of the order starts
// pass 2; running off the end a second time ends the drawing phase (DRAWING -> VOTING edge).
export function advanceTurn(state: GameState): Result<GameState> {
  const guard = assertPhase(state, ["DRAWING"], "advance_turn");
  if (!guard.ok) {
    return guard;
  }

  const nextIndex = state.turnIndex + 1;
  if (nextIndex < state.turnOrder.length) {
    return {
      ok: true,
      data: { ...state, turnIndex: nextIndex, strokeSubmittedThisTurn: false },
    };
  }

  if (state.pass === 1 && state.turnOrder.length > 0) {
    return {
      ok: true,
      data: {
        ...state,
        turnIndex: 0,
        pass: 2,
        strokeSubmittedThisTurn: false,
      },
    };
  }

  return endDrawing(state);
}

// Take a player out of the rotation, leaving turnIndex on whoever it already
// pointed at.
export function dropFromTurnOrder(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const removedIndex = state.turnOrder.indexOf(playerId);
  if (removedIndex === -1) {
    return state;
  }

  const turnOrder = state.turnOrder.filter((id) => id !== playerId);
  let turnIndex =
    removedIndex < state.turnIndex ? state.turnIndex - 1 : state.turnIndex;
  if (turnIndex >= turnOrder.length) {
    turnIndex = 0;
  }

  return { ...state, turnOrder, turnIndex };
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
  // VOTING end on the survival branch: the round is decided here.
  const data = { ...state, accusedId, phase: "ROUND_REVEAL" as const };
  return { ok: true, data: { ...data, roundWinner: resolveRoundWinner(data) } };
}

// T18: record a player's accusation/vote.
export function castVote(
  state: GameState,
  voterId: PlayerId,
  targetId: PlayerId,
  connectedPlayerIds: PlayerId[],
): Result<GameState> {
  //TODO: Make sure front end receives error messages
  const guard = assertPhase(state, ["VOTING"], "cast_vote");
  if (!guard.ok) {
    return guard;
  }
  if (voterId === targetId) {
    console.warn(
      `[state] rejected "cast_vote": ${voterId} voted for themselves`,
    );
    return {
      ok: false,
      code: "SELF_VOTE",
      message: "You cannot vote for yourself.",
    };
  }
  if (!connectedPlayerIds.includes(targetId)) {
    console.warn(
      `[state] rejected "cast_vote": target ${targetId} is not a connected player`,
    );
    return {
      ok: false,
      code: "INVALID_VOTE_TARGET",
      message: "That player is no longer in the game.",
    };
  }
  const votes = [
    ...state.votes.filter((vote) => vote.voterId !== voterId),
    { voterId, targetId },
  ];
  return { ok: true, data: { ...state, votes } };
}

// Note: no votes/tie leads to no accusation, so the imposter is still alive!
export function tallyVotes(votes: Vote[]): PlayerId | null {
  const counts = new Map<PlayerId, number>();
  for (const vote of votes) {
    counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
  }

  let leader: PlayerId | null = null;
  let leadCount = 0;
  let tied = false;
  for (const [targetId, count] of counts) {
    if (count > leadCount) {
      leader = targetId;
      leadCount = count;
      tied = false;
    } else if (count === leadCount) {
      tied = true;
    }
  }

  return tied ? null : leader;
}

export function allConnectedVoted(
  votes: Vote[],
  connectedPlayerIds: PlayerId[],
): boolean {
  const voters = new Set(votes.map((vote) => vote.voterId));
  return connectedPlayerIds.every((id) => voters.has(id));
}

export function settleVoting(state: GameState): Result<GameState> {
  const guard = assertPhase(state, ["VOTING"], "settle_voting");
  if (!guard.ok) {
    return guard;
  }
  const accusedId = tallyVotes(state.votes);
  return accusedId !== null && accusedId === state.imposterId
    ? toFinalGuess(state, accusedId)
    : toRoundRevealFromVoting(state, accusedId);
}

// T29: imposter's one shot at the word.
export function submitGuess(
  state: GameState,
  guesserId: PlayerId,
  text: string,
): Result<GameState> {
  const guard = assertPhase(state, ["FINAL_GUESS"], "submit_guess");
  if (!guard.ok) {
    return guard;
  }
  if (guesserId !== state.imposterId) {
    console.warn(
      `[state] rejected "submit_guess": ${guesserId} is not the imposter`,
    );
    return {
      ok: false,
      code: "NOT_IMPOSTER",
      message: "Only the imposter can make the final guess.",
    };
  }
  const finalGuess: ImposterGuess = {
    text: normaliseGuess(text),
    submittedAt: Date.now(),
  };
  return { ok: true, data: { ...state, finalGuess } };
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
    (s) => ({ ...s, roundWinner: resolveRoundWinner(s) }),
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

export function resolveRoundWinner(state: GameState): RoundWinner {
  const caught =
    state.accusedId !== null && state.accusedId === state.imposterId;
  if (!caught) {
    return "IMPOSTER";
  }
  const guess = normaliseGuess(state.finalGuess?.text ?? "");
  const word = normaliseGuess(state.word);
  return guess.length > 0 && guess === word ? "IMPOSTER" : "GROUP";
}

export function isGameOver(state: GameState): boolean {
  return state.roundNumber >= ROUNDS_PER_GAME;
}

function applyRoundResult(state: GameState): Scores {
  const winner = state.roundWinner ?? resolveRoundWinner(state);
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
          winner: state.roundWinner ?? resolveRoundWinner(state),
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
    votedPlayerIds: state.votes.map((vote) => vote.voterId),
    secret,
    reveal,
  };
}

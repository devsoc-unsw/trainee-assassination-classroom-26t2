import { ROUNDS_PER_GAME } from "@/shared/types";
import type { Player, PlayerId, RoundWinner, Vote } from "@/shared/types";

export interface VoteTally {
  player: Player;
  count: number;
}

export function tallyVotesForDisplay(
  votes: Vote[],
  players: Player[],
): VoteTally[] {
  const counts = new Map<PlayerId, number>();
  for (const vote of votes) {
    counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
  }

  return players
    .filter((player) => counts.has(player.id))
    .map((player) => ({ player, count: counts.get(player.id)! }))
    .sort((a, b) => b.count - a.count);
}

export function resultCopy(winner: RoundWinner, isCaught: boolean): string {
  if (!isCaught) {
    return "The imposter got away...";
  }
  return winner === "IMPOSTER"
    ? "Caught red-handed, and they guessed the word anyway!! The imposter wins the round."
    : "Caught red-handed, and they guessed wrong. The group wins the round.";
}

export function isLastRound(roundNumber: number): boolean {
  return roundNumber >= ROUNDS_PER_GAME;
}

export const SURVIVAL_STAGE_DURATIONS_MS = [2500, 2000, 2500, 2000, 2500];
export const SURVIVAL_IMPOSTER_STAGE = 2;
export const SURVIVAL_RESULT_STAGE = SURVIVAL_STAGE_DURATIONS_MS.length - 1;

export const CAUGHT_STAGE_DURATIONS_MS = [2000, 2000];
export const CAUGHT_RESULT_STAGE = CAUGHT_STAGE_DURATIONS_MS.length - 1;

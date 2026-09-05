import { describe, expect, it } from "vitest";
import type { Player } from "@/shared/types";
import { isLastRound, resultCopy, tallyVotesForDisplay } from "./reveal";

const PLAYERS: Player[] = ["alice", "bob", "carol", "dave"].map((id) => ({
  id,
  nickname: id,
  colour: "#000",
  connected: true,
  ready: true,
}));

describe("tallyVotesForDisplay", () => {
  it("groups by target and sorts by count descending", () => {
    const tally = tallyVotesForDisplay(
      [
        { voterId: "alice", targetId: "bob" },
        { voterId: "carol", targetId: "bob" },
        { voterId: "dave", targetId: "alice" },
      ],
      PLAYERS,
    );
    expect(tally).toEqual([
      { player: PLAYERS[1], count: 2 },
      { player: PLAYERS[0], count: 1 },
    ]);
  });

  it("omits players who received zero votes", () => {
    const tally = tallyVotesForDisplay(
      [{ voterId: "alice", targetId: "bob" }],
      PLAYERS,
    );
    expect(tally.map((t) => t.player.id)).toEqual(["bob"]);
  });

  it("keeps a tie in stable room-list order", () => {
    const tally = tallyVotesForDisplay(
      [
        { voterId: "alice", targetId: "carol" },
        { voterId: "bob", targetId: "dave" },
      ],
      PLAYERS,
    );
    expect(tally.map((t) => t.player.id)).toEqual(["carol", "dave"]);
  });

  it("still resolves a vote for a player who has since disconnected", () => {
    const disconnected = { ...PLAYERS[1], connected: false };
    const tally = tallyVotesForDisplay(
      [{ voterId: "alice", targetId: "bob" }],
      [PLAYERS[0], disconnected, PLAYERS[2], PLAYERS[3]],
    );
    expect(tally).toEqual([{ player: disconnected, count: 1 }]);
  });

  it("returns an empty list when nobody voted", () => {
    expect(tallyVotesForDisplay([], PLAYERS)).toEqual([]);
  });
});

describe("resultCopy", () => {
  it("survival branch: imposter got away regardless of the winner field", () => {
    expect(resultCopy("IMPOSTER", false)).toBe("The imposter got away...");
  });

  it("caught branch, imposter guessed right: imposter still wins", () => {
    expect(resultCopy("IMPOSTER", true)).toBe(
      "Caught red-handed, and they guessed the word anyway!! The imposter wins the round.",
    );
  });

  it("caught branch, imposter guessed wrong: group wins", () => {
    expect(resultCopy("GROUP", true)).toBe(
      "Caught red-handed, and they guessed wrong. The group wins the round.",
    );
  });
});

describe("isLastRound", () => {
  it("is false before the final round", () => {
    expect(isLastRound(1)).toBe(false);
    expect(isLastRound(2)).toBe(false);
  });

  it("is true on and after the final round", () => {
    expect(isLastRound(3)).toBe(true);
    expect(isLastRound(4)).toBe(true);
  });
});

// T10: the word must never reach the imposter and the isImposter flag must
// never reach anyone else.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRoom, joinRoom, startRound, toPublicGameState } from "./rooms";
import type { Room } from "@/shared/types";

function roomOfFour(): Room {
  const room = createRoom("p1", "Ana");
  for (const [id, name] of [
    ["p2", "Bo"],
    ["p3", "Cy"],
    ["p4", "Di"],
  ]) {
    const result = joinRoom(room.code, id, name);
    assert.ok(result.ok);
  }
  return room;
}

function wirePayload(room: Room, playerId: string) {
  return JSON.parse(JSON.stringify(toPublicGameState(room, playerId)));
}

describe("round secrets", () => {
  it("never sends the word to the imposter", () => {
    const room = roomOfFour();
    startRound(room);

    const payload = wirePayload(room, room.state.imposterId!);
    assert.equal(payload.secret.isImposter, true);
    assert.equal(payload.secret.category, room.state.category);
    assert.ok(!("word" in payload.secret));
    assert.ok(!JSON.stringify(payload).includes(room.state.word));
  });

  it("never sends the isImposter flag to a non-imposter", () => {
    const room = roomOfFour();
    startRound(room);

    for (const player of room.players) {
      if (player.id === room.state.imposterId) {
        continue;
      }
      const payload = wirePayload(room, player.id);
      assert.equal(payload.secret.word, room.state.word);
      assert.equal(payload.secret.category, room.state.category);
      assert.ok(!("isImposter" in payload.secret));
    }
  });

  it("leaks no server-only state to anyone", () => {
    const room = roomOfFour();
    startRound(room);

    for (const player of room.players) {
      const payload = wirePayload(room, player.id);
      for (const field of ["imposterId", "word", "votes", "finalGuess"]) {
        assert.ok(!(field in payload), `${field} leaked to ${player.id}`);
      }
    }
  });
});

describe("round setup", () => {
  it("picks the imposter from the players in the room", () => {
    const room = roomOfFour();
    startRound(room);

    const ids = room.players.map((player) => player.id);
    assert.ok(ids.includes(room.state.imposterId!));
  });

  it("gives concurrent rooms independent words", () => {
    const first: string[] = [];
    const second: string[] = [];
    const a = roomOfFour();
    const b = roomOfFour();
    for (let i = 0; i < 20; i++) {
      startRound(a);
      first.push(a.state.word);
      startRound(b);
      second.push(b.state.word);
    }

    assert.notDeepEqual(first, second);
  });

  it("does not repeat a word within a game", () => {
    const room = roomOfFour();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      startRound(room);
      assert.ok(!seen.has(room.state.word), `repeated ${room.state.word}`);
      seen.add(room.state.word);
    }
  });

  it("carries scores across rounds but resets the canvas", () => {
    const room = roomOfFour();
    startRound(room);
    room.state.scores.groupRoundsWon = 3;
    room.state.strokes.push({
      id: "s1",
      playerId: "p1",
      colour: "#000",
      points: [],
    });

    startRound(room);
    assert.equal(room.state.scores.groupRoundsWon, 3);
    assert.deepEqual(room.state.strokes, []);
    assert.equal(room.state.roundNumber, 2);
  });
});

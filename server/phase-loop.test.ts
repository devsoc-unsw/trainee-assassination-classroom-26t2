import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Room } from "@/shared/types";
import { createPhaseLoop } from "./phase-loop";
import { createInitialGameState } from "./rooms";
import { PHASE_DURATIONS_MS, clearRoomTimer, getRoomTimer } from "./timers";
import { createWordDeck } from "./word-selection";

const PLAYERS = ["alice", "bob", "carol", "dave"];
const CODE = "ROOM09";

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

function roomAt(
  phase: GameState["phase"],
  overrides?: Partial<GameState>,
): Room {
  return {
    code: CODE,
    hostId: PLAYERS[0],
    players: PLAYERS.map((id) => ({
      id,
      nickname: id,
      colour: "#000",
      connected: true,
      ready: true,
      isSpectator: false,
    })),
    state: stateAt(phase, overrides),
    deck: createWordDeck(1),
  };
}

function setup(room: Room | null) {
  const rooms = new Map<string, Room>();
  if (room) {
    rooms.set(room.code, room);
  }
  const broadcast = vi.fn();
  const startNextRound = vi.fn();
  const loop = createPhaseLoop({
    getRoom: (code) => rooms.get(code) ?? null,
    broadcast,
    startNextRound,
  });
  return { loop, broadcast, startNextRound, rooms };
}

describe("phase loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    clearRoomTimer(CODE);
    vi.useRealTimers();
  });

  describe("enterPhase", () => {
    it("stamps phaseEndsAt one duration out and broadcasts the room", () => {
      const room = roomAt("ROUND_STARTING");
      const { loop, broadcast } = setup(room);

      loop.enterPhase(room, stateAt("DRAWING"));

      expect(room.state.phase).toBe("DRAWING");
      expect(room.state.phaseEndsAt).toBe(
        Date.now() + PHASE_DURATIONS_MS.DRAWING,
      );
      expect(broadcast).toHaveBeenCalledWith(room);
    });

    it("leaves phaseEndsAt null for a phase with no timer", () => {
      const room = roomAt("ROUND_REVEAL");
      const { loop } = setup(room);

      loop.enterPhase(room, stateAt("SCORING"));

      expect(room.state.phaseEndsAt).toBeNull();
      expect(getRoomTimer(CODE)).toBeNull();
    });
  });

  describe("onPhaseExpired drives the timed edges", () => {
    it("hands the turn on when a turn timer runs out", () => {
      const room = roomAt("DRAWING", { turnIndex: 0, pass: 1 });
      const { loop, broadcast } = setup(room);
      loop.enterPhase(room, room.state);
      broadcast.mockClear();

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);

      expect(room.state.phase).toBe("DRAWING");
      expect(room.state.turnIndex).toBe(1);
      expect(room.state.phaseEndsAt).toBe(
        Date.now() + PHASE_DURATIONS_MS.DRAWING,
      );
      expect(broadcast).toHaveBeenCalledTimes(1);
    });

    it("DRAWING -> VOTING when the last turn of pass 2 runs out", () => {
      const room = roomAt("DRAWING", {
        turnIndex: PLAYERS.length - 1,
        pass: 2,
      });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);

      expect(room.state.phase).toBe("VOTING");
      expect(room.state.phaseEndsAt).toBe(
        Date.now() + PHASE_DURATIONS_MS.VOTING,
      );
    });

    it("gives every player both passes on the clock before voting", () => {
      const room = roomAt("DRAWING", { turnIndex: 0, pass: 1 });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      // One timer per turn: everyone draws once, then again in pass 2.
      for (let turn = 1; turn < PLAYERS.length * 2; turn++) {
        vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);
        expect(room.state.phase).toBe("DRAWING");
      }
      expect(room.state.pass).toBe(2);
      expect(room.state.turnIndex).toBe(PLAYERS.length - 1);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);
      expect(room.state.phase).toBe("VOTING");
    });

    it("VOTING -> ROUND_REVEAL with no accusation (imposter survives)", () => {
      const room = roomAt("VOTING");
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);

      expect(room.state.phase).toBe("ROUND_REVEAL");
      expect(room.state.accusedId).toBeNull();
    });

    it("VOTING timeout runs the real tally: a non-imposter plurality -> ROUND_REVEAL accused", () => {
      const room = roomAt("VOTING", {
        votes: [
          { voterId: PLAYERS[0], targetId: PLAYERS[2] },
          { voterId: PLAYERS[1], targetId: PLAYERS[2] },
          { voterId: PLAYERS[3], targetId: PLAYERS[0] },
        ],
      });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);

      expect(room.state.phase).toBe("ROUND_REVEAL");
      expect(room.state.accusedId).toBe(PLAYERS[2]);
    });

    it("VOTING timeout runs the real tally: an imposter plurality -> FINAL_GUESS", () => {
      const room = roomAt("VOTING", {
        votes: [
          { voterId: PLAYERS[0], targetId: PLAYERS[1] },
          { voterId: PLAYERS[2], targetId: PLAYERS[1] },
        ],
      });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);

      expect(room.state.phase).toBe("FINAL_GUESS");
      expect(room.state.accusedId).toBe(PLAYERS[1]);
      expect(room.state.phaseEndsAt).toBe(
        Date.now() + PHASE_DURATIONS_MS.FINAL_GUESS,
      );
    });

    it("FINAL_GUESS -> ROUND_REVEAL when no guess is submitted", () => {
      const room = roomAt("FINAL_GUESS", { accusedId: PLAYERS[1] });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.FINAL_GUESS);

      expect(room.state.phase).toBe("ROUND_REVEAL");
    });

    it("non-final round: reveal timeout tallies into SCORING and spins the next round", () => {
      const room = roomAt("ROUND_REVEAL", {
        roundNumber: 1,
        accusedId: null,
      });
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.ROUND_REVEAL);

      expect(room.state.phase).toBe("SCORING");
      expect(room.state.scores.imposterRoundsWon).toBe(1);
      expect(getRoomTimer(CODE)).toBeNull();
      expect(startNextRound).toHaveBeenCalledTimes(1);
      expect(startNextRound).toHaveBeenCalledWith(room);
    });

    it("final round: reveal timeout ends the game instead of spinning another round", () => {
      const room = roomAt("ROUND_REVEAL", {
        roundNumber: 3,
        accusedId: null,
      });
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.ROUND_REVEAL);

      expect(room.state.phase).toBe("GAME_OVER");
      expect(room.state.scores.imposterRoundsWon).toBe(1);
      expect(startNextRound).not.toHaveBeenCalled();
      expect(getRoomTimer(CODE)).toBeNull();
    });

    it("chains DRAWING -> VOTING -> ROUND_REVEAL -> SCORING across successive timeouts", () => {
      // Last turn of pass 2, so the next DRAWING timeout ends the phase.
      const room = roomAt("DRAWING", {
        turnIndex: PLAYERS.length - 1,
        pass: 2,
      });
      const { loop } = setup(room);
      loop.enterPhase(room, room.state);

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);
      expect(room.state.phase).toBe("VOTING");

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);
      expect(room.state.phase).toBe("ROUND_REVEAL");

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.ROUND_REVEAL);
      expect(room.state.phase).toBe("SCORING");
    });
  });

  describe("settleRoundReveal (early exit once everyone's ready)", () => {
    it("non-final round: settles into SCORING and spins the next round, same as the timeout", () => {
      const room = roomAt("ROUND_REVEAL", {
        roundNumber: 1,
        accusedId: null,
      });
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      loop.settleRoundReveal(room);

      expect(room.state.phase).toBe("SCORING");
      expect(room.state.scores.imposterRoundsWon).toBe(1);
      expect(getRoomTimer(CODE)).toBeNull();
      expect(startNextRound).toHaveBeenCalledTimes(1);
      expect(startNextRound).toHaveBeenCalledWith(room);
    });

    it("final round: settles straight into GAME_OVER instead of spinning another round", () => {
      const room = roomAt("ROUND_REVEAL", {
        roundNumber: 3,
        accusedId: null,
      });
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      loop.settleRoundReveal(room);

      expect(room.state.phase).toBe("GAME_OVER");
      expect(room.state.scores.imposterRoundsWon).toBe(1);
      expect(startNextRound).not.toHaveBeenCalled();
      expect(getRoomTimer(CODE)).toBeNull();
    });

    it("cancels the pending ROUND_REVEAL timeout so it can't also fire", () => {
      const room = roomAt("ROUND_REVEAL", { roundNumber: 1, accusedId: null });
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      loop.settleRoundReveal(room);
      startNextRound.mockClear();

      vi.advanceTimersByTime(PHASE_DURATIONS_MS.ROUND_REVEAL);

      expect(startNextRound).not.toHaveBeenCalled();
    });

    it("does nothing if called outside ROUND_REVEAL", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const room = roomAt("VOTING");
      const { loop, startNextRound } = setup(room);
      loop.enterPhase(room, room.state);

      loop.settleRoundReveal(room);

      expect(room.state.phase).toBe("VOTING");
      expect(startNextRound).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it("does nothing when the room was deleted before its timer fired", () => {
    const room = roomAt("DRAWING");
    const { loop, broadcast, rooms } = setup(room);
    loop.enterPhase(room, room.state);
    broadcast.mockClear();

    rooms.delete(CODE);

    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING * 2);

    expect(broadcast).not.toHaveBeenCalled();
    expect(room.state.phase).toBe("DRAWING");
  });

  it("an early exit cancels the pending timeout - no orphan fires into the next phase", () => {
    const room = roomAt("DRAWING");
    const { loop } = setup(room);
    loop.enterPhase(room, room.state);

    // Early exit partway through the drawing phase (t = 5s).
    vi.advanceTimersByTime(5_000);
    loop.enterPhase(room, stateAt("VOTING"));

    // The original DRAWING deadline (t = 20s) comes and goes with no effect:
    // the orphaned timeout was cancelled when VOTING was entered.
    vi.advanceTimersByTime(15_000);
    expect(room.state.phase).toBe("VOTING");

    // Only the VOTING deadline (t = 5s + 45s = 50s) moves it on.
    vi.advanceTimersByTime(30_001);
    expect(room.state.phase).toBe("ROUND_REVEAL");
  });
});

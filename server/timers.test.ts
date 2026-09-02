import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PHASE_DURATIONS_MS,
  armPhaseTimer,
  clearRoomTimer,
  getRoomTimer,
  isTimedPhase,
} from "./timers";

const ROOM = "ROOM01";

describe("phase timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    clearRoomTimer(ROOM);
    vi.useRealTimers();
  });

  it("returns an absolute deadline one duration into the future", () => {
    const endsAt = armPhaseTimer(ROOM, "DRAWING", () => {});
    expect(endsAt).toBe(Date.now() + PHASE_DURATIONS_MS.DRAWING);
    expect(getRoomTimer(ROOM)).toEqual({
      phase: "DRAWING",
      endsAt: Date.now() + PHASE_DURATIONS_MS.DRAWING,
    });
  });

  it("fires the callback exactly once when the duration elapses", () => {
    const onExpire = vi.fn();
    armPhaseTimer(ROOM, "VOTING", onExpire);

    vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING - 1);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Nothing fires again later.
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("forgets the timer entry once it has fired", () => {
    armPhaseTimer(ROOM, "ROUND_REVEAL", () => {});
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.ROUND_REVEAL);
    expect(getRoomTimer(ROOM)).toBeNull();
  });

  it("does not fire after clearRoomTimer - nothing fires into a deleted room", () => {
    const onExpire = vi.fn();
    armPhaseTimer(ROOM, "DRAWING", onExpire);

    clearRoomTimer(ROOM);
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING * 2);

    expect(onExpire).not.toHaveBeenCalled();
    expect(getRoomTimer(ROOM)).toBeNull();
  });

  it("re-arming a room cancels the previous timeout - an early exit leaves no orphan", () => {
    const drawingExpired = vi.fn();
    const votingExpired = vi.fn();

    armPhaseTimer(ROOM, "DRAWING", drawingExpired);
    // Early exit part way through the drawing phase.
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING - 5);
    armPhaseTimer(ROOM, "VOTING", votingExpired);

    // The original drawing deadline comes and goes with no effect.
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);
    expect(drawingExpired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PHASE_DURATIONS_MS.VOTING);
    expect(votingExpired).toHaveBeenCalledTimes(1);
    expect(drawingExpired).not.toHaveBeenCalled();
  });

  it("arms nothing for a phase with no timer", () => {
    const onExpire = vi.fn();

    expect(armPhaseTimer(ROOM, "LOBBY", onExpire)).toBeNull();
    expect(armPhaseTimer(ROOM, "SCORING", onExpire)).toBeNull();
    expect(getRoomTimer(ROOM)).toBeNull();

    vi.advanceTimersByTime(1_000_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("arming an untimed phase still clears an existing timer", () => {
    const onExpire = vi.fn();
    armPhaseTimer(ROOM, "DRAWING", onExpire);

    expect(armPhaseTimer(ROOM, "SCORING", onExpire)).toBeNull();
    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("isTimedPhase matches the duration table", () => {
    expect(isTimedPhase("DRAWING")).toBe(true);
    expect(isTimedPhase("VOTING")).toBe(true);
    expect(isTimedPhase("FINAL_GUESS")).toBe(true);
    expect(isTimedPhase("ROUND_REVEAL")).toBe(true);
    expect(isTimedPhase("LOBBY")).toBe(false);
    expect(isTimedPhase("ROUND_STARTING")).toBe(false);
    expect(isTimedPhase("SCORING")).toBe(false);
    expect(isTimedPhase("GAME_OVER")).toBe(false);
  });

  it("keeps timers separate per room", () => {
    const first = vi.fn();
    const second = vi.fn();
    armPhaseTimer("ROOM_A", "DRAWING", first);
    armPhaseTimer("ROOM_B", "VOTING", second);

    vi.advanceTimersByTime(PHASE_DURATIONS_MS.DRAWING);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(
      PHASE_DURATIONS_MS.VOTING - PHASE_DURATIONS_MS.DRAWING,
    );
    expect(second).toHaveBeenCalledTimes(1);

    clearRoomTimer("ROOM_A");
    clearRoomTimer("ROOM_B");
  });
});

describe("FINAL_GUESS is 20 seconds under T09", () => {
  it("not the old 10", () => {
    expect(PHASE_DURATIONS_MS.FINAL_GUESS).toBe(20_000);
  });
});

"use client";

import { useEffect, useState } from "react";
import { useCountdown } from "@/app/lib/clock";
import {
  CAUGHT_STAGE_DURATIONS_MS,
  SURVIVAL_IMPOSTER_STAGE,
  SURVIVAL_STAGE_DURATIONS_MS,
  isLastRound,
} from "@/app/lib/reveal";
import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS } from "@/shared/events";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import { Canvas } from "./Canvas";
import { CaughtReveal } from "./reveal/CaughtReveal";
import { SurvivalReveal } from "./reveal/SurvivalReveal";

interface RoundRevealProps {
  room: PublicRoom;
  gameState: PublicGameState;
  playerId: PlayerId;
  socket: AppSocket;
}

export function RoundReveal({
  room,
  gameState,
  playerId,
  socket,
}: RoundRevealProps) {
  const { reveal } = gameState;
  const isCaught =
    reveal !== null &&
    gameState.accusedId !== null &&
    gameState.accusedId === reveal.imposterId;

  const [stage, setStage] = useState(0);
  const [hasClickedReady, setHasClickedReady] = useState(false);

  useEffect(() => {
    const durations = isCaught
      ? CAUGHT_STAGE_DURATIONS_MS
      : SURVIVAL_STAGE_DURATIONS_MS;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 1; i < durations.length; i++) {
      elapsed += durations[i - 1];
      timeouts.push(setTimeout(() => setStage(i), elapsed));
    }
    return () => timeouts.forEach(clearTimeout);
  }, [isCaught]);

  const remainingMs = useCountdown(gameState.phaseEndsAt);

  if (reveal === null) {
    return null;
  }

  const stageDurations = isCaught
    ? CAUGHT_STAGE_DURATIONS_MS
    : SURVIVAL_STAGE_DURATIONS_MS;
  const stageComplete = stage >= stageDurations.length - 1;
  const highlightPlayerId = isCaught
    ? reveal.imposterId
    : stage >= SURVIVAL_IMPOSTER_STAGE
      ? reveal.imposterId
      : null;

  const connectedCount = room.players.filter((p) => p.connected).length;
  const readyCount = gameState.readyForNextIds.length;

  return (
    <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-4 py-12 px-6 sm:py-16 sm:px-8 md:py-16 md:px-12">
      <h1>Round reveal</h1>
      <p aria-live="polite">{Math.ceil(remainingMs / 1000)}s</p>

      <Canvas
        room={room}
        playerId={playerId}
        socket={socket}
        myTurn={false}
        strokes={gameState.strokes}
        highlightPlayerId={highlightPlayerId}
      />

      {isCaught ? (
        <CaughtReveal reveal={reveal} stage={stage} />
      ) : (
        <SurvivalReveal
          reveal={reveal}
          accusedId={gameState.accusedId}
          players={room.players}
          stage={stage}
        />
      )}

      <button
        type="button"
        disabled={!stageComplete || hasClickedReady}
        onClick={() => {
          setHasClickedReady(true);
          socket.emit(CLIENT_EVENTS.REVEAL_READY);
        }}
      >
        {isLastRound(gameState.roundNumber)
          ? "Ready for results"
          : "Ready for next round"}{" "}
        ({readyCount}/{connectedCount})
      </button>
    </main>
  );
}

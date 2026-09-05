"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@/app/components/game/Canvas";
import { HomeButton } from "@/app/components/game/HomeButton";
import type { RosterPlayer } from "@/app/components/drawing-round/geometry";
import type { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type { SocketError } from "@/shared/events";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import VotingRound from "./VotingRound";

interface VotingRoundScreenProps {
  room: PublicRoom;
  gameState: PublicGameState;
  playerId: PlayerId;
  socket: AppSocket;
}

const SHOWN_ERROR_CODES = new Set<string>(["SELF_VOTE", "INVALID_VOTE_TARGET"]);
const ERROR_VISIBLE_MS = 4_000;

export function VotingRoundScreen({
  room,
  gameState,
  playerId,
  socket,
}: VotingRoundScreenProps) {
  const byId = new Map(room.players.map((player) => [player.id, player]));
  const ordered = gameState.turnOrder
    .map((id) => byId.get(id))
    .filter((player) => player !== undefined);
  const players: RosterPlayer[] = (
    ordered.length > 0 ? ordered : room.players
  ).map((player) => ({
    id: player.id,
    nickname: player.nickname,
    colour: player.colour,
  }));

  const [pendingTargetId, setPendingTargetId] = useState<PlayerId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingShown =
    pendingTargetId !== null &&
    room.players.some((player) => player.id === pendingTargetId)
      ? pendingTargetId
      : null;

  useEffect(() => {
    const onError = (error: SocketError) => {
      if (!SHOWN_ERROR_CODES.has(error.code)) {
        return;
      }
      setErrorMessage(error.message);
      if (error.code === "INVALID_VOTE_TARGET") {
        setPendingTargetId(null);
      }
    };
    socket.on(SERVER_EVENTS.ERROR, onError);
    return () => {
      socket.off(SERVER_EVENTS.ERROR, onError);
    };
  }, [socket]);

  useEffect(() => {
    if (errorMessage === null) {
      return;
    }
    const id = setTimeout(() => setErrorMessage(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [errorMessage]);

  function handlePick(targetId: PlayerId) {
    setPendingTargetId(targetId);
    setErrorMessage(null);
    socket.emit(CLIENT_EVENTS.CAST_VOTE, { targetId });
  }

  return (
    <div className="relative w-full">
      <VotingRound
        players={players}
        myPlayerId={playerId}
        votedPlayerIds={gameState.votedPlayerIds}
        pendingTargetId={pendingShown}
        onPick={handlePick}
        secret={gameState.secret}
        phaseEndsAt={gameState.phaseEndsAt}
        errorMessage={errorMessage}
        board={
          <Canvas
            room={room}
            playerId={playerId}
            socket={socket}
            myTurn={false}
            strokes={gameState.strokes}
          />
        }
      />
      <div className="fixed left-4 top-4 z-10">
        <HomeButton socket={socket} />
      </div>
    </div>
  );
}

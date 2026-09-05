"use client";

import { Canvas } from "@/app/components/game/Canvas";
import { HomeButton } from "@/app/components/HomeButton";
import type { AppSocket } from "@/app/socket-provider";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import DrawingRound, { type RosterPlayer } from "./DrawingRound";

interface DrawingRoundScreenProps {
  room: PublicRoom;
  gameState: PublicGameState;
  playerId: PlayerId;
  socket: AppSocket;
  setRoomState: (room: PublicRoom | null) => void;
  setGameState: (room: PublicGameState | null) => void;
}

// Pure prop-mapping from Game.tsx's state onto DrawingRound and Canvas — no
// socket subscription or stroke handling of its own.
export function DrawingRoundScreen({
  room,
  gameState,
  playerId,
  socket,
  setRoomState,
  setGameState,
}: DrawingRoundScreenProps) {
  const byId = new Map(room.players.map((player) => [player.id, player]));

  // Turn order is the rotation the server shuffled at round start, so reading
  // the roster top to bottom is reading the order of play.
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

  const currentDrawerId = gameState.turnOrder[gameState.turnIndex] ?? null;
  const myTurn = currentDrawerId === playerId;

  return (
    <div className="relative w-full">
      <DrawingRound
        players={players}
        currentDrawerId={currentDrawerId}
        myPlayerId={playerId}
        secret={gameState.secret}
        roundNumber={gameState.roundNumber}
        canDraw={myTurn}
        phaseEndsAt={gameState.phaseEndsAt}
        pass={gameState.pass}
        board={
          <Canvas
            room={room}
            playerId={playerId}
            socket={socket}
            myTurn={myTurn}
            strokes={gameState.strokes}
          />
        }
      />
      {/* Keep the room reachable mid-round, same as the other in-round phases. */}
      <div className="fixed left-4 top-4 z-10">
        <HomeButton setGameState={setGameState} setRoomState={setRoomState} socket={socket} />
      </div>
    </div>
  );
}

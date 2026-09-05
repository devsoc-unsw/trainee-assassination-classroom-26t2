"use client";

import { Canvas } from "@/app/components/game/Canvas";
import { HomeButton } from "@/app/components/game/HomeButton";
import type { AppSocket } from "@/app/socket-provider";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import DrawingRound, { type Hint, type RosterPlayer } from "./DrawingRound";

interface DrawingRoundScreenProps {
  room: PublicRoom;
  gameState: PublicGameState;
  playerId: PlayerId;
  socket: AppSocket;
}

// Pure prop-mapping from what Game.tsx already has in scope onto DrawingRound's
// art and Canvas's drawing surface — no new socket subscription, no stroke
// handling of its own. The state and the room both already exist by the time
// this mounts (Game.tsx only renders this once gameState.phase is "DRAWING"),
// so there is nothing here to load.
export function DrawingRoundScreen({
  room,
  gameState,
  playerId,
  socket,
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

  // The server sends the imposter a category and no word; it sends everyone
  // else the word. This only renders whichever branch it was given.
  const hint: Hint =
    "isImposter" in gameState.secret
      ? { kind: "category", text: gameState.secret.category }
      : { kind: "word", text: gameState.secret.word };

  return (
    <div className="relative w-full">
      <DrawingRound
        players={players}
        currentDrawerId={currentDrawerId}
        myPlayerId={playerId}
        hint={hint}
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
      {/* The other in-round phases (app/game.tsx) keep this reachable too; the
          split into a separate screen for DRAWING should not make it any
          harder to leave the room mid-round. */}
      <div className="fixed left-4 top-4 z-10">
        <HomeButton socket={socket} />
      </div>
    </div>
  );
}

"use client";

import { Canvas } from "./components/game/Canvas";
import { useSyncExternalStore } from "react";
import type { PublicGameState, PublicRoom } from "@/shared/types";
import { getPlayerId, subscribe } from "./lib/identity";
import { useSocket } from "./socket-provider";
import { VotingScreen } from "./components/game/VotingScreen";
import { ImposterGuess } from "./components/game/ImposterGuess";
import { HomeButton } from "./components/game/HomeButton";
import { SecretDisplay } from "./components/lobby/SecretDisplay";

interface GameProps {
  room: PublicRoom;
  gameState: PublicGameState;
}
export function Game({ room, gameState }: GameProps) {
  const socket = useSocket();
  const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");

  const playerUp = room.players.find(
    (x) => x.id == gameState.turnOrder[gameState.turnIndex],
  )?.nickname;

  let content;

  if (
    gameState.phase == "DRAWING" ||
    gameState.phase === "VOTING" ||
    gameState.phase === "FINAL_GUESS"
  ) {
    content = (
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center py-12 px-6 sm:py-16 sm:px-8 md:py-16 md:px-12">
        <h1>{`${gameState.phase}: ${playerUp}'s turn!`}</h1>
        <Canvas
          strokes={gameState.strokes}
          room={room}
          playerId={playerId}
          socket={socket}
          myTurn={
            gameState.turnOrder[gameState.turnIndex] === playerId &&
            gameState.phase == "DRAWING"
          }
        />

        {gameState.phase === "VOTING" && (
          <VotingScreen players={room.players} socket={socket} />
        )}
        {gameState.phase === "FINAL_GUESS" && <ImposterGuess socket={socket} />}
        <HomeButton socket={socket} />
      </main>
    );
  } else if (gameState.phase == "ROUND_REVEAL") {
    content = (
      <>
        <h1>Round reveal (unimplemented)</h1>
        <HomeButton socket={socket} />
      </>
    );
  } else if (gameState.phase == "SCORING") {
    content = <h1>Scores!</h1>;
  } else if (gameState.phase == "GAME_OVER") {
    content = (
      <>
        <h1>Game Over!</h1>
        <HomeButton socket={socket} />
      </>
    );
  }

  return (
    <>
      <SecretDisplay secret={gameState.secret} />
      {content}
    </>
  );
}
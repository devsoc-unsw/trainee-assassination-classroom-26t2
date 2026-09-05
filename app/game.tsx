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
import { RoundReveal } from "./components/game/RoundReveal";
import { DrawingRoundScreen } from "./components/drawing-round/DrawingRoundScreen";

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

  // DRAWING gets its own screen (the hand-drawn frame, roster, and hint note)
  // rather than the plain h1 the other in-round phases still use — everything
  // else about this branch (Canvas, the socket, the strokes) is unchanged.
  if (gameState.phase === "DRAWING") {
    return (
      <DrawingRoundScreen
        room={room}
        gameState={gameState}
        playerId={playerId}
        socket={socket}
      />
    );
  }

  if (gameState.phase === "VOTING" || gameState.phase === "FINAL_GUESS") {
    return (
      <>
        {gameState.phase === "FINAL_GUESS" && (
          <SecretDisplay secret={gameState.secret} />
        )}
        <main className="flex w-full max-w-6xl flex-1 flex-col items-center py-12 px-6 sm:py-16 sm:px-8 md:py-16 md:px-12">
          <h1>{`${gameState.phase}: ${playerUp}'s turn!`}</h1>
          <Canvas
            strokes={gameState.strokes}
            room={room}
            playerId={playerId}
            socket={socket}
            myTurn={false}
          />

          {gameState.phase === "VOTING" && (
            <VotingScreen players={room.players} socket={socket} />
          )}
          {gameState.phase === "FINAL_GUESS" && (
            <ImposterGuess socket={socket} />
          )}
          <HomeButton socket={socket} />
        </main>
      </>
    );
  } else if (gameState.phase == "ROUND_REVEAL") {
    content = (
      <>
        <RoundReveal
          key={gameState.roundNumber}
          room={room}
          gameState={gameState}
          playerId={playerId}
          socket={socket}
        />
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

  const showSecret =
    gameState.phase !== "ROUND_REVEAL" &&
    gameState.phase !== "SCORING" &&
    gameState.phase !== "GAME_OVER";

  return (
    <>
      {showSecret && <SecretDisplay secret={gameState.secret} />}
      {content}
    </>
  );
}

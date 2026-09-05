"use client";

import { Canvas } from "./components/game/Canvas";
import { useSyncExternalStore } from "react";
import type {
  PublicGameState,
  PublicRoom,
} from "@/shared/types";
import { getPlayerId, subscribe } from "./lib/identity";
import { AppSocket, useSocket } from "./socket-provider";
import { VotingScreen } from "./components/game/VotingScreen";
import { ImposterGuess } from "./components/game/ImposterGuess";
import { HomeButton } from "./components/game/HomeButton";
import { CLIENT_EVENTS } from "@/shared/events";

function goHome(socket: AppSocket){
  socket.emit(CLIENT_EVENTS.LEAVE)
}

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

  /*
  | "ROUND_REVEAL"
  | "GAME_OVER";*/

  if (gameState.phase == "ROUND_STARTING") {
    if (gameState.secret.isImposter) {
      return (
        <h1>
          You are the chameleon. The category is: {gameState.secret.category}
        </h1>
      );
    } else {
      return (
        <h1>You are not the chameleon. The word is: {gameState.secret.word}</h1>
      );
    }
  }

  if (gameState.phase == "DRAWING" || gameState.phase === "VOTING" || gameState.phase === "FINAL_GUESS") {
    return (
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

        {gameState.phase === "VOTING" && <VotingScreen players={room.players} socket = {socket}/>}
        {gameState.phase === "FINAL_GUESS" && <ImposterGuess socket={socket}/>}
      </main>
    );
  }

  if (gameState.phase == "ROUND_REVEAL") {
    <h1>Round reveal (unimplemented)</h1>
  }

  if (gameState.phase == "GAME_OVER") {
    return (
      <>
        <h1>Game Over!</h1>
        <HomeButton onPress={()=>goHome(socket)} />
      </>
    );
  }
}

'use client';

import { Canvas } from "./components/game/Canvas";
import { useSyncExternalStore } from "react";
import type { PublicGameState, PublicRoom } from "@/shared/types";
import {
    getPlayerId,
    subscribe,
} from "./lib/identity";
import { useSocket } from "./socket-provider";



interface GameProps {
    room: PublicRoom;
    gameState: PublicGameState;
}
export function Game({ room, gameState }: GameProps) {
    const socket = useSocket();
    const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");

    const playerUp = room.players.find((x)=>x.id == gameState.turnOrder[gameState.turnIndex])?.nickname

    return (
        <main className="flex w-full max-w-6xl flex-1 flex-col items-center py-12 px-6 sm:py-16 sm:px-8 md:py-16 md:px-12">
            <h1>{gameState.phase}: {playerUp}'s turn!</h1>
            <Canvas
                strokes={gameState.strokes}
                room={room}
                playerId={playerId}
                socket={socket}
                myTurn={gameState.turnOrder[gameState.turnIndex] === playerId && gameState.phase == "DRAWING"}
            ></Canvas>
        </main>
    );


}

'use client';

import { Canvas } from "./components/game/Canvas";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { GameState, PublicGameState, PublicRoom } from "@/shared/types";
import {
    getPlayerId,
    getSessionSnapshot,
    subscribe,
} from "./lib/identity";
import { useSocket } from "./socket-provider";
import { SERVER_EVENTS } from "@/shared/events";



export function Game() {
    // TODO: No clue how to deal with game stuff
    const socket = useSocket();
    const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");
    const storedSession = useSyncExternalStore(
        subscribe,
        getSessionSnapshot,
        () => null,
    );

    const [nickname, setNickname] = useState("");
    const [roomCode, setRoomCode] = useState("");
    const [room, setRoom] = useState<PublicRoom | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [gameState, setGameState] = useState<PublicGameState | null>(null);

    // TODO: Bring this back
    // useEffect(() => {
    //     if (!storedSession || !playerId) {
    //         return;
    //     }
    //     socket.emit(
    //         CLIENT_EVENTS.JOIN_ROOM,
    //         {
    //             playerId,
    //             nickname: storedSession.nickname,
    //             code: storedSession.roomCode,
    //         },
    //         (result) => {
    //             if (!result.ok) {
    //                 clearStoredSession();
    //                 setNickname(storedSession.nickname);
    //                 setRoomCode(storedSession.roomCode);
    //                 setError(result.message);
    //             }
    //         },
    //     );
    // }, [socket, playerId, storedSession]);

    useEffect(() => {
        const handleRoomUpdated = (publicRoom: PublicRoom) => setRoom(publicRoom);
        socket.on(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
        return () => {
            socket.off(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
        };
    }, [socket]);

    useEffect(() => {
        const handleStateUpdated = (state: PublicGameState) => setGameState(state);
        socket.on(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
        return () => {
            socket.off(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
        };
    }, [socket]);


    if (playerId === "") {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p>Loading…</p>
            </main>
        );
    }

    const attemptingRejoin =
        storedSession !== null && room === null && error === null;
    if (attemptingRejoin) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <p>Rejoining room {storedSession.roomCode}…</p>
            </main>
        );
    }

    if (room) {
        return (
            <main className="flex w-full max-w-6xl flex-1 flex-col items-center py-12 px-6 sm:py-16 sm:px-8 md:py-16 md:px-12">
                <Canvas room={room} playerId={playerId} socket={socket} ></Canvas>
            </main>
        );

    }
    return <h1>ERROR</h1> //TODO: Handle more gracefully
}

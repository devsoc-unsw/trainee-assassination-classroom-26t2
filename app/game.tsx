'use client';

import { Canvas } from "./components/game/Canvas";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { PublicRoom } from "@/shared/types";
import {
  getPlayerId,
  getSessionSnapshot,
  subscribe,
} from "./lib/identity";
import { useSocket } from "./socket-provider";



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

    return <Canvas room={room} playerId={playerId} socket={socket}></Canvas>
}
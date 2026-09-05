"use client";

import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Game } from "./game";
import { Lobby } from "./lobby";
import { getPlayerId, subscribe } from "./lib/identity";
import { SERVER_EVENTS, SocketError } from "@/shared/events";
import { PublicGameState, PublicRoom } from "@/shared/types";
import { useSocket } from "./socket-provider";

const BANNER_DURATION_MS = 3000;

export default function Home() {
  const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");

  const socket = useSocket();

  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [room, setRoom] = useState<PublicRoom | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);

  useEffect(() => {
    const handleRoomUpdated = (publicRoom: PublicRoom | null) =>
      setRoom(publicRoom);
    socket.on(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    return () => {
      socket.off(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const handleStateUpdated = (state: PublicGameState | null) =>
      setGameState(state);
    socket.on(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    return () => {
      socket.off(SERVER_EVENTS.STATE_UPDATED, handleStateUpdated);
    };
  }, [socket]);

  useEffect(() => {
    const handleInfo = (message_arg: string) => setMessage(message_arg);
    setIsError(false);
    socket.on(SERVER_EVENTS.INFO, handleInfo);
    return () => {
      socket.off(SERVER_EVENTS.INFO, handleInfo);
    };
  }, [socket]);

  useEffect(() => {
    const handleError = (message_arg: SocketError) =>
      setMessage(message_arg.code + ": " + message_arg.message);
    setIsError(true);
    socket.on(SERVER_EVENTS.ERROR, handleError);
    return () => {
      socket.off(SERVER_EVENTS.ERROR, handleError);
    };
  }, [socket]);

  useEffect(() => {
    if (message === null) {
      return;
    }

    const timeout = setTimeout(() => {
      setMessage(null);
    }, BANNER_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [message]);

  if (playerId === "") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p>Loading…</p>
      </main>
    );
  }

  // TODO: If message exists it should be displayed on the screen somewhere.

  const inLobby =
    room === null || gameState === null || gameState.phase === "LOBBY";

  var banner;
  if (isError) {
    banner = message ? (
      <div
        role={isError ? "alert" : "status"}
        className="w-full px-4 py-3 text-center text-sm font-medium bg-red-600 text-white"
      >
        {message}
      </div>
    ) : null;
  } else {
    banner = message ? (
      <div
        role={isError ? "alert" : "status"}
        className="w-full px-4 py-3 text-center text-sm font-medium bg-blue-600 text-white"
      >
        {message}
      </div>
    ) : null;
  }

  if (inLobby) {
    return (
      <>
        {banner}
        <div className="relative flex flex-1 flex-col items-center overflow-hidden font-sans">
          <div
            className="absolute inset-0 -z-10 bg-repeat animate-diagonal-scroll"
            style={{
              backgroundImage:
                "url('/images/landing-page/landing-page-bg.jpg')",
              backgroundSize: "720px 512px",
              transform: "scale(1.75)",
            }}
          />
          <Lobby
            room={room}
            socket={socket}
            setGameState={setGameState}
            setRoomState={setRoom}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <Game
        room={room}
        socket={socket}
        gameState={gameState}
        setGameState={setGameState}
        setRoomState={setRoom}
      />
      ;
    </>
  );
}

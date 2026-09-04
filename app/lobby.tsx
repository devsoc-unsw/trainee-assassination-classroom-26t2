"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import drawmeleonLogo from "@/public/images/landing-page/drawmeleon-logo.png";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type { PublicRoom } from "@/shared/types";
import { LobbyRoom } from "./components/lobby/LobbyRoom";
import {
  clearStoredSession,
  getPlayerId,
  getSessionSnapshot,
  setStoredSession,
  subscribe,
} from "./lib/identity";
import { useSocket } from "./socket-provider";

interface LobbyProps {
  room: PublicRoom | null;
}

export function Lobby({ room }: LobbyProps) {
  const socket = useSocket();
  const playerId = useSyncExternalStore(subscribe, getPlayerId, () => "");
  const storedSession = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    () => null,
  );

  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storedSession || !playerId) {
      return;
    }
    socket.emit(
      CLIENT_EVENTS.JOIN_ROOM,
      {
        playerId,
        nickname: storedSession.nickname,
        code: storedSession.roomCode,
      },
      (result) => {
        if (!result.ok) {
          clearStoredSession();
          setNickname(storedSession.nickname);
          setRoomCode(storedSession.roomCode);
          setError(result.message);
        }
      },
    );
  }, [socket, playerId, storedSession]);


  function handleCreate() {
    setError(null);
    socket.emit(CLIENT_EVENTS.CREATE_ROOM, { playerId, nickname }, (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStoredSession({ nickname, roomCode: result.data.code, phase: "LOBBY" });
    });
  }

  function handleJoin() {
    setError(null);
    socket.emit(
      CLIENT_EVENTS.JOIN_ROOM,
      { playerId, nickname, code: roomCode },
      (result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStoredSession({ nickname, roomCode: result.data.code, phase: "LOBBY" });
      },
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
        <LobbyRoom room={room} playerId={playerId} socket={socket} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 w-full max-w-5xl flex-col md:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-75 py-12 px-6 sm:py-16 sm:px-8 md:py-24 md:px-12 lg:py-32 lg:px-16">
      <div className="flex flex-1 items-center justify-center">
        <Image
          src={drawmeleonLogo}
          alt="Drawmeleon"
          className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg h-auto animate-pulse-scale [--logo-scale:1.1] sm:[--logo-scale:1.25] md:[--logo-scale:1.4] lg:[--logo-scale:1.75] xl:[--logo-scale:2]"
          priority
        />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col gap-10 w-full max-w-xs sm:max-w-sm text-black">
          <div className="flex flex-col gap-2">
            <input
              className="w-full bg-transparent border-0 pt-[1%] pl-[9%] pr-[26%] animate-boil frame-nickname active:outline-none focus:outline-none"
              placeholder="Nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
            />
            <input
              className="w-full bg-transparent border-0 px-[22%] text-center animate-boil frame-code active:outline-none focus:outline-none"
              placeholder="Room code"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex flex-col">
            <button
              type="button"
              className="w-full animate-boil frame-create-room disabled:opacity-40 cursor-pointer"
              onClick={handleCreate}
              disabled={!nickname.trim()}
            >
              <span className="sr-only">Create room</span>
            </button>
            <button
              type="button"
              className="w-full animate-boil frame-join-room disabled:opacity-40 cursor-pointer"
              onClick={handleJoin}
              disabled={!nickname.trim() || !roomCode.trim()}
            >
              <span className="sr-only">Join room</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

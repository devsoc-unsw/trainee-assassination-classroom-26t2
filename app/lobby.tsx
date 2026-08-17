"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type { PublicRoom } from "@/shared/types";
import {
  clearStoredSession,
  getPlayerId,
  getSessionSnapshot,
  setStoredSession,
  subscribe,
} from "./lib/identity";
import { useSocket } from "./socket-provider";

export function Lobby() {
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

  useEffect(() => {
    const handleRoomUpdated = (publicRoom: PublicRoom) => setRoom(publicRoom);
    socket.on(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    return () => {
      socket.off(SERVER_EVENTS.ROOM_UPDATED, handleRoomUpdated);
    };
  }, [socket]);

  function handleCreate() {
    setError(null);
    socket.emit(CLIENT_EVENTS.CREATE_ROOM, { playerId, nickname }, (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setStoredSession({ nickname, roomCode: result.data.code });
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
        setStoredSession({ nickname, roomCode: result.data.code });
      },
    );
  }

  if (playerId === "") {
    return <p>Loading…</p>;
  }

  const attemptingRejoin =
    storedSession !== null && room === null && error === null;
  if (attemptingRejoin) {
    return <p>Rejoining room {storedSession.roomCode}…</p>;
  }

  if (room) {
    return (
      <div className="flex flex-col gap-2">
        <p>
          Room <span className="font-mono">{room.code}</span>
        </p>
        <ul>
          {room.players.map((player) => (
            <li key={player.id}>
              {player.nickname}
              {player.id === room.hostId ? " (host)" : ""}
              {player.connected ? "" : " (offline)"}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-full max-w-xs sm:max-w-sm text-black">
      <input
        className="w-full bg-transparent border-0 pt-[1%] pl-[9%] pr-[26%] animate-boil frame-nickname"
        placeholder="Nickname"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        maxLength={16}
      />
      <input
        className="w-full bg-transparent border-0 px-[22%] text-center animate-boil frame-code"
        placeholder="Room code"
        value={roomCode}
        onChange={(event) => setRoomCode(event.target.value)}
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex flex-col gap-2">
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
  );
}

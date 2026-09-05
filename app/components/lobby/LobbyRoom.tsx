"use client";

import { useState } from "react";
import type { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS } from "@/shared/events";
import type { Result } from "@/shared/events";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/shared/types";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import { CustomizeAvatarModal } from "./CustomizeAvatarModal";
import { PlayerCard } from "./PlayerCard";
import { PlayerTally } from "./PlayerTally";
import { RoomCodeBadge } from "./RoomCodeBadge";
import { StartButton } from "./StartButton";
import { HomeButton } from "../HomeButton";

interface LobbyRoomProps {
  room: PublicRoom;
  playerId: PlayerId;
  socket: AppSocket;
  setRoomState: (room: PublicRoom | null) => void;
  setGameState: (room: PublicGameState | null) => void;
}

export function LobbyRoom({
  room,
  playerId,
  socket,
  setRoomState,
  setGameState,
}: LobbyRoomProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const isHost = room.hostId === playerId;
  const me = room.players.find((player) => player.id === playerId);
  const allReady = room.players.every((player) => player.ready);

  function handleToggleReady(ready: boolean) {
    socket.emit(CLIENT_EVENTS.READY, { ready });
  }

  function handleStart(): Promise<Result<void>> {
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.START_GAME, resolve);
    });
  }

  return (
    <>
      <div className="flex w-full items-center">
        <div className="flex">
          <HomeButton
            setGameState={setGameState}
            setRoomState={setRoomState}
            socket={socket}
          />
        </div>
      </div>

      <div className="lobby-room flex w-full flex-col items-center gap-8 text-black">
        <div className="flex flex-col items-center gap-2">
          <RoomCodeBadge code={room.code} />
          <PlayerTally
            count={room.players.length}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
          />
        </div>

        <div className="player-list grid w-full max-w-4xl grid-cols-4 justify-items-center gap-x-8 gap-y-12">
          {room.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isHost={player.id === room.hostId}
              isSelf={player.id === playerId}
              onToggleReady={
                player.id === playerId ? handleToggleReady : undefined
              }
              onCustomize={
                player.id === playerId
                  ? () => setCustomizeOpen(true)
                  : undefined
              }
            />
          ))}
        </div>

        <StartButton
          isHost={isHost}
          playerCount={room.players.length}
          allReady={allReady}
          onStart={handleStart}
        />

        {me && (
          <CustomizeAvatarModal
            open={customizeOpen}
            onClose={() => setCustomizeOpen(false)}
            player={me}
          />
        )}
      </div>
    </>
  );
}

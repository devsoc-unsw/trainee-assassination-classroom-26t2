"use client";

import type { Player } from "@/shared/types";
import { AvatarBlob } from "./AvatarBlob";

interface PlayerCardProps {
  player: Player;
  isHost: boolean;
  isSelf: boolean;
  onToggleReady?: (ready: boolean) => void;
  onCustomize?: () => void;
}
const PLAYER_CARD_ART: Record<string, string> = {
  "#772322": "frame-player-card-red",
  "#5e875b": "frame-player-card-green",
  "#5b92b9": "frame-player-card-blue",
  "#df6c4c": "frame-player-card-orange",
  "#9a78b8": "frame-player-card-purple",
  "#55d299": "frame-player-card-mint",
  "#b16576": "frame-player-card-pink",
};

function AvatarSlot({
  player,
  isSelf,
  onCustomize,
  size,
}: Pick<PlayerCardProps, "player" | "isSelf" | "onCustomize"> & {
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <AvatarBlob
        colour={player.colour}
        initial={player.nickname.charAt(0).toUpperCase() || "?"}
        size={size}
      />
      {isSelf && onCustomize && (
        <button
          type="button"
          onClick={onCustomize}
          aria-label="Customize your avatar"
          className="pencil-trigger absolute bottom-0 right-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <span
            className="block h-8 w-auto shrink-0 animate-boil frame-pencil"
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}

function StatusSlot({
  player,
  isSelf,
  onToggleReady,
}: Pick<PlayerCardProps, "player" | "isSelf" | "onToggleReady">) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-xs text-black/60">
        <span
          className={`connection-dot h-2 w-2 shrink-0 rounded-full border border-black ${
            player.connected ? "bg-green-500" : "bg-black/30"
          }`}
          aria-hidden
        />
        <span>{player.connected ? "connected" : "offline"}</span>
      </div>

      {isSelf ? (
        <button
          type="button"
          onClick={() => onToggleReady?.(!player.ready)}
          aria-pressed={player.ready}
          className="ready-stamp flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs font-medium text-black"
        >
          <span
            className={`w-7 shrink-0 frame-ready ${
              player.ready ? "frame-ready-checked" : ""
            }`}
            aria-hidden
          />
          {player.ready ? "Ready" : "Not ready"}
        </button>
      ) : (
        <span className="ready-stamp rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase text-black/50">
          {player.ready ? "Ready!" : "Not ready..."}
        </span>
      )}
    </>
  );
}

export function PlayerCard({
  player,
  isHost,
  isSelf,
  onToggleReady,
  onCustomize,
}: PlayerCardProps) {
  const frameClass = isHost
    ? "frame-player-card-host"
    : PLAYER_CARD_ART[player.colour];

  if (frameClass) {
    return (
      <div
        className={`player-card ${frameClass} group relative w-full max-w-64`}
      >
        <div className="absolute top-[19%] right-[20%] bottom-[54%] left-[21%] flex items-center justify-center">
          <AvatarSlot
            player={player}
            isSelf={isSelf}
            onCustomize={onCustomize}
            size="lg"
          />
        </div>

        <p className="absolute top-[50%] right-[9%] bottom-[44%] left-[10%] flex items-center justify-center truncate px-1 text-[11px] font-semibold text-white">
          {player.nickname}
        </p>

        <div className="absolute top-[60%] right-[20%] bottom-[16%] left-[21%] flex flex-col items-center justify-center gap-1.5">
          <StatusSlot
            player={player}
            isSelf={isSelf}
            onToggleReady={onToggleReady}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="player-card group relative flex w-full max-w-64 flex-col items-center gap-2 rounded-2xl border-2 border-black/10 bg-white/70 px-4 pb-3 pt-4">
      <AvatarSlot player={player} isSelf={isSelf} onCustomize={onCustomize} />

      <p className="max-w-32 truncate text-sm font-semibold text-black">
        {player.nickname}
      </p>

      <StatusSlot
        player={player}
        isSelf={isSelf}
        onToggleReady={onToggleReady}
      />
    </div>
  );
}

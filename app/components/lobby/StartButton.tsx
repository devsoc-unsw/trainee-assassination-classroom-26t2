"use client";

import { useState } from "react";
import type { Result } from "@/shared/events";
import { MIN_PLAYERS } from "@/shared/types";

interface StartButtonProps {
  isHost: boolean;
  playerCount: number;
  allReady: boolean;
  onStart: () => Promise<Result<void>>;
}

export function StartButton({
  isHost,
  playerCount,
  allReady,
  onStart,
}: StartButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  if (!isHost) {
    return null;
  }

  const notEnoughPlayers = playerCount < MIN_PLAYERS;
  const disabled = notEnoughPlayers || !allReady || starting;

  const reason = notEnoughPlayers
    ? `Need at least ${MIN_PLAYERS} players (${playerCount}/${MIN_PLAYERS})`
    : !allReady
      ? "Waiting for everyone to be ready"
      : null;

  async function handleClick() {
    setStarting(true);
    setError(null);
    const result = await onStart();
    setStarting(false);
    if (!result.ok) {
      setError(result.message);
    }
  }

  return (
    <div className="start-button-wrap flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={reason ?? undefined}
        className="start-button rounded-xl bg-white border-2 border-black/10 px-6 py-3 font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {starting ? "Starting…" : "Start game"}
      </button>
      {reason && <p className="text-xs text-black/60">{reason}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

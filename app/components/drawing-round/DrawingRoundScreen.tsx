"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Canvas } from "@/app/components/game/Canvas";
import { HomeButton } from "@/app/components/game/HomeButton";
import {
  isSoundMuted,
  setSoundMuted,
  subscribe as subscribeSoundMuted,
} from "@/app/lib/soundPrefs";
import type { AppSocket } from "@/app/socket-provider";
import type { PlayerId, PublicGameState, PublicRoom } from "@/shared/types";
import DrawingRound from "./DrawingRound";
import type { RosterPlayer } from "./geometry";

interface DrawingRoundScreenProps {
  room: PublicRoom;
  gameState: PublicGameState;
  playerId: PlayerId;
  socket: AppSocket;
}

const ROUND_MUSIC_SRC = "/sounds/round-loop.mp3";
const ROUND_MUSIC_VOLUME = 0.35;

// Pure prop-mapping from Game.tsx's state onto DrawingRound and Canvas — no
// socket subscription or stroke handling of its own.
export function DrawingRoundScreen({
  room,
  gameState,
  playerId,
  socket,
}: DrawingRoundScreenProps) {
  const muted = useSyncExternalStore(
    subscribeSoundMuted,
    isSoundMuted,
    () => false,
  );

  // Game.tsx only renders this screen while phase is DRAWING, and swaps to
  // the voting view the instant it changes — so this component's own mount
  // and unmount already land exactly on "a round begins" and "voting
  // begins", with nothing here needing to watch the phase itself.
  const musicRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const music = new Audio(ROUND_MUSIC_SRC);
    music.loop = true;
    music.volume = ROUND_MUSIC_VOLUME;
    music.muted = isSoundMuted();
    musicRef.current = music;
    // A browser can refuse this; that just means no music, not a crash.
    music.play().catch(() => {});
    return () => {
      music.pause();
      musicRef.current = null;
    };
  }, []);

  // Reacts to the toggle without recreating (and so restarting) the loop.
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.muted = muted;
    }
  }, [muted]);

  const byId = new Map(room.players.map((player) => [player.id, player]));

  // Turn order is the rotation the server shuffled at round start, so reading
  // the roster top to bottom is reading the order of play.
  const ordered = gameState.turnOrder
    .map((id) => byId.get(id))
    .filter((player) => player !== undefined);
  const players: RosterPlayer[] = (
    ordered.length > 0 ? ordered : room.players
  ).map((player) => ({
    id: player.id,
    nickname: player.nickname,
    colour: player.colour,
  }));

  const currentDrawerId = gameState.turnOrder[gameState.turnIndex] ?? null;
  const myTurn = currentDrawerId === playerId;

  return (
    <div className="relative w-full">
      <DrawingRound
        players={players}
        currentDrawerId={currentDrawerId}
        myPlayerId={playerId}
        secret={gameState.secret}
        roundNumber={gameState.roundNumber}
        canDraw={myTurn}
        phaseEndsAt={gameState.phaseEndsAt}
        pass={gameState.pass}
        muted={muted}
        onToggleMuted={() => setSoundMuted(!muted)}
        board={
          <Canvas
            room={room}
            playerId={playerId}
            socket={socket}
            myTurn={myTurn}
            strokes={gameState.strokes}
          />
        }
      />
      {/* Keep the room reachable mid-round, same as the other in-round phases. */}
      <div className="fixed left-4 top-4 z-10">
        <HomeButton socket={socket} />
      </div>
    </div>
  );
}

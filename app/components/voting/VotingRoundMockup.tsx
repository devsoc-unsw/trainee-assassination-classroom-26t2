"use client";

import { useState, useSyncExternalStore } from "react";
import VotingRound from "./VotingRound";

// Offline preview of the voting panel, mounted at /voting. Feeds fixtures and a
// blank board into the same VotingRound the real screen uses, so the frame, the
// hand, and the ring / badge / dim states can be worked on without a socket
// server. Flip PREVIEW_AS_IMPOSTER to see the imposter's hint treatment.
const PREVIEW_AS_IMPOSTER: boolean = false;

// A full room: host plus all seven server/rooms.ts PLAYER_COLOURS (MAX_PLAYERS).
const PLAYERS = [
  { id: "p1", nickname: "Host", colour: "#9a6324" },
  { id: "p2", nickname: "Ari", colour: "#772322" },
  { id: "p3", nickname: "Bo", colour: "#5e875b" },
  { id: "p4", nickname: "Cleo", colour: "#5b92b9" },
  { id: "p5", nickname: "Dev", colour: "#df6c4c" },
  { id: "p6", nickname: "Eli", colour: "#9a78b8" },
  { id: "p7", nickname: "Fay", colour: "#55d299" },
  { id: "p8", nickname: "Gus", colour: "#b16576" },
];

const ME = PLAYERS[1];

// Two others have already voted — dimmed only, never a hint of their target.
const VOTED_PLAYER_IDS = ["p3", "p5"];

// VOTING is 45s (server/timers.ts PHASE_DURATIONS_MS.VOTING).
const PHASE_MS = 45_000;

const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

// Date.now() can't run during render; `mounted` keeps it out of the SSR HTML.
const PREVIEW_DEADLINE = Date.now() + PHASE_MS;

export default function VotingRoundMockup() {
  const mounted = useSyncExternalStore(neverChanges, onClient, onServer);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);

  return (
    <VotingRound
      players={PLAYERS}
      myPlayerId={ME.id}
      votedPlayerIds={VOTED_PLAYER_IDS}
      pendingTargetId={pendingTargetId}
      onPick={(targetId) => setPendingTargetId(targetId)}
      secret={
        PREVIEW_AS_IMPOSTER
          ? { isImposter: true, category: "a piece of technology" }
          : { category: "a piece of technology", word: "constellation" }
      }
      // Null until hydration, so server and first client render agree there's no
      // timer yet. Reload to restart the countdown and replay the splash.
      phaseEndsAt={mounted ? PREVIEW_DEADLINE : null}
      errorMessage={null}
      board={<div className="h-full w-full" />}
    />
  );
}

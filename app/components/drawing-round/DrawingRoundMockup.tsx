"use client";

import { useSyncExternalStore } from "react";
import DrawingRound from "./DrawingRound";

// Offline preview of the drawing round, mounted at /drawing. Feeds fixtures
// and a blank board into the same DrawingRound the real screen uses, so the
// frame can be worked on without a socket server and four players.
// Flip PREVIEW_AS_IMPOSTER to see the imposter's note treatment.
// Annotated as boolean so flipping it doesn't change the branch's type.
const PREVIEW_AS_IMPOSTER: boolean = false;

// A full room: host plus all seven server/rooms.ts PLAYER_COLOURS (MAX_PLAYERS)
// — the ceiling that catches a cramped roster or a colour missing its arrow.
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

// One turn, matching server/timers.ts PHASE_DURATIONS_MS.DRAWING.
const TURN_MS = 20_000;

// Reads false on the server and the first client render, true after
// hydration — safe in a way `typeof window` isn't, since React re-renders
// right after that first client render anyway.
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

// No server to hand down a deadline, so one is invented at module load
// (Date.now() can't run during render); `mounted` keeps it out of the SSR HTML.
const PREVIEW_DEADLINE = Date.now() + TURN_MS;

export default function DrawingRoundMockup() {
  const mounted = useSyncExternalStore(neverChanges, onClient, onServer);

  // Null until hydration, so server and first client render agree there's no
  // timer yet. Reload to restart the countdown.
  const endsAt = mounted ? PREVIEW_DEADLINE : null;

  return (
    <DrawingRound
      players={PLAYERS}
      currentDrawerId={ME.id}
      myPlayerId={ME.id}
      // Longest word in server/words.ts — the case that broke the note's
      // sizing before it was rewritten to measure the real element.
      secret={
        PREVIEW_AS_IMPOSTER
          ? { isImposter: true, category: "a piece of technology" }
          : { category: "a piece of technology", word: "constellation" }
      }
      roundNumber={1}
      // No turn to spend here, so the pencil just tracks the cursor indefinitely.
      canDraw
      phaseEndsAt={endsAt}
      pass={1}
      // Blank: the frame art's cream shows through; drawing itself is Canvas's job.
      board={<div className="h-full w-full" />}
    />
  );
}

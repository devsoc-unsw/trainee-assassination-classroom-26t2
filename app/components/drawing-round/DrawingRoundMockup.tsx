"use client";

import { useSyncExternalStore } from "react";
import DrawingRound from "./DrawingRound";

/* Offline preview of the drawing round, mounted at /drawing.

   The real screen is DrawingRoundScreen, which wraps this same DrawingRound
   around teammates' <Canvas> off the server's state. This wrapper feeds
   DrawingRound fixtures and a blank placeholder board instead, so the layout,
   the pencil, the clock and the note can be worked on without standing up a
   socket server and four players. It is the same art component either way —
   there is no second copy of the screen to drift out of sync. The placeholder
   board draws nothing because drawing itself is entirely Canvas's job now; this
   preview is only ever about the frame around it.

   Flip PREVIEW_AS_IMPOSTER to see the imposter's note treatment. */
// Annotated as boolean rather than inferred as the literal `false`, so flipping
// it does not change the type of the branch below.
const PREVIEW_AS_IMPOSTER: boolean = false;

// A full room: the host's brown plus all seven of server/rooms.ts
// PLAYER_COLOURS, which is MAX_PLAYERS. Previewing at the ceiling is what
// catches the roster getting cramped and any colour without an arrow.
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

/* Nothing to subscribe to: this reads false while rendering on the server and
   during the first client render, then true once hydration is done. Branching
   on it is safe in a way that `typeof window` is not, because the first client
   render still agrees with the HTML the server sent — React just re-renders
   immediately afterwards. */
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

/* The preview has no server to hand down a deadline, so it invents one when the
   module loads. It lives at module scope because Date.now() is impure and may
   not be called while rendering; `mounted` is what keeps it out of the server's
   HTML, not where it is computed. */
const PREVIEW_DEADLINE = Date.now() + TURN_MS;

export default function DrawingRoundMockup() {
  const mounted = useSyncExternalStore(neverChanges, onClient, onServer);

  // null until hydration is done, so the server's HTML and the first client
  // render agree that there is no timer yet and the clock shows its no-timer
  // placeholder. Reload to restart the countdown.
  const endsAt = mounted ? PREVIEW_DEADLINE : null;

  return (
    <DrawingRound
      players={PLAYERS}
      currentDrawerId={ME.id}
      myPlayerId={ME.id}
      // The longest real entries in server/words.ts, so the preview always
      // shows the hardest case the note has to hold rather than a flattering
      // short one. "constellation" is the single longest unbroken word
      // anywhere in the list — the case that actually broke the first version
      // of the note's sizing (a closed-form guess at character width, with no
      // margin for tracking-wide's letter-spacing on a word with nowhere to
      // wrap) — so it stays the fixture here rather than a shorter word that
      // would not have caught it.
      hint={
        PREVIEW_AS_IMPOSTER
          ? { kind: "category", text: "a piece of technology" }
          : { kind: "word", text: "constellation" }
      }
      // The preview has no turn to spend, so the pencil just tracks the cursor
      // indefinitely.
      canDraw
      phaseEndsAt={endsAt}
      pass={1}
      // Blank: the cream shows through from the frame art underneath, since
      // nothing here paints its own background. Drawing itself only exists in
      // the real Canvas component, not in this preview.
      board={<div className="h-full w-full" />}
    />
  );
}

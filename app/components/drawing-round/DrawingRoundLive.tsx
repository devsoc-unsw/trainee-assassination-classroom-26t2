"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type { SocketError } from "@/shared/events";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/shared/types";
import type {
  PlayerId,
  Point,
  PublicGameState,
  PublicRoom,
} from "@/shared/types";
import DrawingRound, {
  type Hint,
  type NormPoint,
  type RenderStroke,
  type RosterPlayer,
} from "./DrawingRound";

interface DrawingRoundLiveProps {
  room: PublicRoom;
  playerId: PlayerId;
  socket: AppSocket;
  state: PublicGameState;
}

const FALLBACK_COLOUR = "#3f3730";

// The board works in 0..1 of its own width and height; the wire format is the
// canonical 800x600 in shared/types.ts. Converting at this boundary keeps the
// canvas resolution-independent and the payload exactly what the server (and
// T23's bound checks) expect.
const toWire = (point: NormPoint): Point => ({
  x: point.x * CANVAS_WIDTH,
  y: point.y * CANVAS_HEIGHT,
});

const fromWire = (point: Point): NormPoint => ({
  x: point.x / CANVAS_WIDTH,
  y: point.y / CANVAS_HEIGHT,
});

// Identifies one player's one turn. Used as the lock: a turn whose key is
// already committed cannot be drawn on again, and the server advancing the
// rotation releases the lock on its own.
const turnKeyOf = (state: PublicGameState) =>
  `${state.roundNumber}-${state.pass}-${state.turnIndex}`;

const NOTICE_CODES = new Set([
  "NOT_YOUR_TURN",
  "WRONG_PHASE",
  "INVALID_PAYLOAD",
]);

export function DrawingRoundLive({
  room,
  playerId,
  socket,
  state,
}: DrawingRoundLiveProps) {
  // Strokes this client has committed but not yet seen come back down in
  // state.strokes, so the drawer's own line stays on the board across the
  // round trip. Today the server stores no strokes at all (T12 is unbuilt), so
  // every local stroke is pending forever and this is the only thing keeping
  // the drawing visible — see the reconcile below, which is written so it
  // simply stops holding them once T12 starts echoing them back.
  const [localStrokes, setLocalStrokes] = useState<RenderStroke[]>([]);
  const [committedTurnKey, setCommittedTurnKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The canvas clears on a new round, and so does anything held optimistically.
  // Adjusted during render rather than in an effect: React re-runs this
  // component before it paints, so the previous round's strokes never reach the
  // board, and there is no second render for the canvas to catch up with.
  const [lastRound, setLastRound] = useState(state.roundNumber);
  if (lastRound !== state.roundNumber) {
    setLastRound(state.roundNumber);
    setLocalStrokes([]);
    setCommittedTurnKey(null);
  }

  // A rejected stroke must not leave the player locked out of a turn they
  // still hold, so the lock comes off and they can draw again.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handleError = (error: SocketError) => {
      if (!NOTICE_CODES.has(error.code)) {
        return;
      }
      setCommittedTurnKey(null);
      setNotice(error.message);
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    };
    socket.on(SERVER_EVENTS.ERROR, handleError);
    return () => {
      socket.off(SERVER_EVENTS.ERROR, handleError);
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, [socket]);

  const byId = useMemo(
    () => new Map(room.players.map((player) => [player.id, player])),
    [room.players],
  );

  // Turn order is the rotation the server shuffled at round start, so reading
  // the roster top to bottom is reading the order of play.
  const players = useMemo<RosterPlayer[]>(() => {
    const ordered = state.turnOrder
      .map((id) => byId.get(id))
      .filter((player) => player !== undefined);
    return (ordered.length > 0 ? ordered : room.players).map((player) => ({
      id: player.id,
      nickname: player.nickname,
      colour: player.colour,
    }));
  }, [state.turnOrder, byId, room.players]);

  const currentDrawerId = state.turnOrder[state.turnIndex] ?? null;
  const myColour = byId.get(playerId)?.colour ?? FALLBACK_COLOUR;

  // The server sends the imposter a category and no word; it sends everyone
  // else the word. The screen renders whichever branch it was given and has no
  // way to ask for the other.
  const hint: Hint = useMemo(
    () =>
      "isImposter" in state.secret
        ? { kind: "category", text: state.secret.category }
        : { kind: "word", text: state.secret.word },
    [state.secret],
  );

  // Anything the server has recorded, plus whatever this client is still
  // holding for itself. Once the server knows about N of my strokes, the first
  // N local ones are redundant and get dropped — which works whether or not
  // T12 ends up reusing the ids generated here.
  const strokes = useMemo<RenderStroke[]>(() => {
    const confirmed = state.strokes.map((stroke) => ({
      id: stroke.id,
      colour: stroke.colour,
      points: stroke.points.map(fromWire),
    }));
    const knownMine = state.strokes.filter(
      (stroke) => stroke.playerId === playerId,
    ).length;
    return [...confirmed, ...localStrokes.slice(knownMine)];
  }, [state.strokes, localStrokes, playerId]);

  const turnKey = turnKeyOf(state);
  const canDraw =
    state.phase === "DRAWING" &&
    currentDrawerId === playerId &&
    committedTurnKey !== turnKey;

  const handleStrokeEnd = useCallback(
    (points: NormPoint[]) => {
      // Lock this turn before the round trip, so a fast second pointerdown
      // cannot spend the same turn twice.
      setCommittedTurnKey(turnKey);
      setLocalStrokes((current) => [
        ...current,
        {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${playerId}-${turnKey}`,
          colour: myColour,
          points,
        },
      ]);
      // The server ignores these points today and only advances the turn; the
      // payload is the shape shared/events.ts already declares, so T12 can
      // start reading it without a client change.
      socket.emit(CLIENT_EVENTS.STROKE_END, { points: points.map(toWire) });
    },
    [socket, turnKey, myColour, playerId],
  );

  return (
    <DrawingRound
      players={players}
      currentDrawerId={currentDrawerId}
      myPlayerId={playerId}
      myColour={myColour}
      hint={hint}
      strokes={strokes}
      canDraw={canDraw}
      phaseEndsAt={state.phaseEndsAt}
      pass={state.pass}
      notice={notice}
      onStrokeEnd={handleStrokeEnd}
    />
  );
}

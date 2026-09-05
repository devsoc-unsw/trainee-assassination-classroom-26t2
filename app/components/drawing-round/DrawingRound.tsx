"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AvatarBlob } from "@/app/components/lobby/AvatarBlob";
import { useCountdown } from "@/app/lib/clock";
import type { PlayerId } from "@/shared/types";

/* Geometry of drawing-base-layout (2).png, in percentages of the layout box.
   The frame is hand-drawn — wobbly borders, panels that are not evenly spaced —
   so these were sampled from the artwork's own opaque pixels (in its native
   1920x1080) rather than guessed at an even split, and they describe the cream
   interiors rather than the ink borders. */
const ROSTER = { left: 10.73, top: 12.96, width: 14.01, height: 72.04 };
const BOARD = { left: 26.35, top: 13.33, width: 61.04, height: 72.5 };

/* The layout box is locked to 16:9, so a span written as a percentage of its
   height is this many percent of its width. Lets a row height measured down the
   roster be compared against sizes written in cqw. */
const HEIGHT_TO_WIDTH = 9 / 16;

// The arrows sit out in the background margin to the left of the roster, tips
// stopping just short of it — one per player, colour-matched to their avatar.
const ARROW = { left: 4.9, width: 5.3 };

// Clock and note hang in the top margin, the note's right edge flush with the
// board's, the way the design lines them up.
const CLOCK = { right: 22.4, top: 1.25, width: 4.6 };
const NOTE = { right: 12.66, top: 0.8, width: 8.8 };

// Cream interiors of those two, as percentages of their own art box — where the
// countdown and the word go.
//
// The clock's face was measured on the sideways art and then carried through the
// quarter turn globals.css applies to it: a point (x, y) on the old 887x757 ink
// lands at (y, 887 - x) on the upright 757x887 box, which swaps the pair and
// pushes the face below centre — where it belongs once the bells are on top.
const CLOCK_FACE = { left: 14.27, top: 26.72, width: 72.79, height: 62.12 };
const NOTE_BODY = { left: 11.4, top: 2.2, width: 79.9, height: 95.1 };

// The pencil is anchored by its graphite tip and rotated about it, so the tip
// tracks the drawing point exactly however the pencil leans. tipX/tipY are the
// tip's position within the pencil ink, measured off draw-pencil2.png; the angle
// matches the lean in the design.
const PENCIL = { length: 8, tipX: 58, tipY: 100, angle: 34 };

// Where the design rests the pencil while nobody is drawing, in board percent.
const PENCIL_PARK = { x: 69.7, y: 59.8 };

// A turn is 20s (server/timers.ts PHASE_DURATIONS_MS.DRAWING), so the clock
// turns red for the last quarter of it rather than the 10s the 60s mockup used.
const URGENT_MS = 5_000;
const INK = "#3f3730";

/* Sizing the text on the note.

   The paper is about 7cqw of usable width by a shade over 4cqw of height, and
   bold caps run to roughly 0.7em of advance each. Fitting the whole string on
   one line holds up for "CAT" and collapses for the long entries in the word
   list: "a piece of technology" came out around 0.4cqw, illegible, and that is
   the imposter's only information for the entire round.

   Letting it wrap moves the constraint. Across, it is now the longest single
   word, because that is the part that cannot be broken. Down, it is how many
   lines the whole string then takes, and the paper holds about 3.6 of them.
   Whichever is tighter wins. Worst cases in the current list are "hot air
   balloon" and "a piece of technology". */
const NOTE_MAX_CQW = 1.2;
const NOTE_MIN_CQW = 0.5;

const noteSize = (text: string) => {
  const words = text.split(/\s+/).filter(Boolean);
  const longest = words.reduce((widest, word) => Math.max(widest, word.length), 1);
  const byWidth = Math.min(NOTE_MAX_CQW, 9.8 / longest);
  const charsPerLine = Math.max(1, Math.floor(10.3 / byWidth));
  const lines = Math.ceil(text.length / charsPerLine);
  return Math.max(NOTE_MIN_CQW, Math.min(byWidth, 3.6 / lines));
};

/* A point in 0..1 of the board's width and height. Two jobs: strokes survive a
   resize (the backing store is rebuilt at the new size and the same normalised
   points replayed into it), and every client shares one coordinate space
   regardless of viewport.

   Note the board is not 4:3 — it is 61.04% x 72.5% of a 16:9 box, so about
   3:2 — while shared/types.ts calls the canonical canvas 800x600. Scaling 0..1
   onto 800x600 therefore stretches slightly on the vertical. That is harmless
   because the layout box is locked to 16:9 for everyone, so every client
   stretches identically and all see the same picture; the conversion lives in
   DrawingRoundLive. */
export type NormPoint = { x: number; y: number };

export interface RenderStroke {
  id: string;
  colour: string;
  points: NormPoint[];
}

export interface RosterPlayer {
  id: PlayerId;
  nickname: string;
  colour: string;
}

// What this player is allowed to know: the word if they are in the group, only
// the category if they are the imposter. Mirrors the PlayerSecret union in
// shared/types.ts — the screen never sees the other branch's contents.
export type Hint =
  | { kind: "word"; text: string }
  | { kind: "category"; text: string };

interface DrawingRoundProps {
  // In turn order, so the roster reads top to bottom as the rotation.
  players: RosterPlayer[];
  currentDrawerId: PlayerId | null;
  myPlayerId: PlayerId;
  myColour: string;
  hint: Hint;
  strokes: RenderStroke[];
  // Server-decided: this player's turn, and they have not used it yet.
  canDraw: boolean;
  phaseEndsAt: number | null;
  pass: 1 | 2;
  notice?: string | null;
  onStrokeEnd?: (points: NormPoint[]) => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// ~60 points/sec, per T11. The pencil still follows every pointermove; only the
// points committed to the stroke are thinned.
const POINT_INTERVAL_MS = 16;

export default function DrawingRound({
  players,
  currentDrawerId,
  myPlayerId,
  myColour,
  hint,
  strokes,
  canDraw,
  phaseEndsAt,
  pass,
  notice,
  onStrokeEnd,
}: DrawingRoundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Only ever the in-progress stroke. Committed strokes arrive as props, so
  // there is one source of truth for what is on the board.
  const strokeRef = useRef<NormPoint[] | null>(null);
  const lastPointAt = useRef(0);

  // null parks the pencil where the design rests it; `down` is whether it is
  // touching the paper, which only changes how far it lifts along its own shaft.
  const [pencil, setPencil] = useState<{
    x: number;
    y: number;
    down: boolean;
  } | null>(null);

  // phaseEndsAt is null outside a timed phase, and null on the very first render
  // of a screen whose deadline can only be known on the client. Rendering a
  // placeholder rather than a number in that case keeps the server's HTML and
  // the first client render identical, which is all hydration compares — and it
  // is also the honest reading, since no deadline means no time to show.
  const remainingMs = useCountdown(phaseEndsAt);
  const hasDeadline = phaseEndsAt !== null;
  const seconds = hasDeadline ? Math.ceil(remainingMs / 1000) : null;

  const isMyTurn = currentDrawerId === myPlayerId;
  const currentDrawer =
    players.find((player) => player.id === currentDrawerId) ?? null;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, width * 0.004);

    const live = strokeRef.current;
    const all: RenderStroke[] = live
      ? [...strokes, { id: "live", colour: myColour, points: live }]
      : strokes;

    for (const stroke of all) {
      const [first, ...rest] = stroke.points;
      if (!first) {
        continue;
      }
      // Each stroke carries its owner's colour, which is what makes the
      // finished drawing readable as a sequence of contributions during the
      // vote.
      ctx.strokeStyle = stroke.colour;
      ctx.beginPath();
      ctx.moveTo(first.x * width, first.y * height);
      for (const point of rest) {
        ctx.lineTo(point.x * width, point.y * height);
      }
      // A tap with no drag still leaves a dot, thanks to the round line cap.
      if (rest.length === 0) {
        ctx.lineTo(first.x * width, first.y * height);
      }
      ctx.stroke();
    }
  }, [strokes, myColour]);

  // Committed strokes changing (someone else's turn landing, or a new round
  // clearing the board) has to reach the canvas, which React does not touch.
  useEffect(() => {
    redraw();
  }, [redraw]);

  // The board is sized as a fraction of the viewport, so the backing store has
  // to be rebuilt — and the strokes replayed — whenever that fraction changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      redraw();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // The turn can be taken away mid-stroke — the 20s timer expires and the
  // server moves on. Anything still under the pencil was never sent, so it is
  // dropped rather than left hanging on the board.
  useEffect(() => {
    if (!canDraw && strokeRef.current) {
      strokeRef.current = null;
      setPencil(null);
      redraw();
    }
  }, [canDraw, redraw]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): NormPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    // A non-drawer touching the board does nothing at all: no stroke, no
    // emission. The server would reject it anyway, but it should never get
    // that far.
    if (!canDraw || strokeRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    strokeRef.current = [point];
    lastPointAt.current = performance.now();
    setPencil({ x: point.x * 100, y: point.y * 100, down: true });
    redraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDraw) {
      return;
    }
    const point = pointFrom(event);
    setPencil({
      x: point.x * 100,
      y: point.y * 100,
      down: strokeRef.current !== null,
    });
    if (!strokeRef.current) {
      return;
    }
    const now = performance.now();
    if (now - lastPointAt.current < POINT_INTERVAL_MS) {
      return;
    }
    lastPointAt.current = now;
    strokeRef.current.push(point);
    redraw();
  }

  // pointerup and pointercancel both land here: cancelling mid-stroke commits
  // whatever exists rather than costing the player their turn (T11).
  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const points = strokeRef.current;
    strokeRef.current = null;
    setPencil((current) => (current ? { ...current, down: false } : current));
    if (!points || points.length === 0) {
      return;
    }
    // Throttling can have dropped the last few milliseconds of movement, so the
    // lift point goes on explicitly and the stroke ends where the hand did.
    points.push(pointFrom(event));

    // Lifting the pointer is the whole turn. The stroke goes up, and what comes
    // back down as state decides what the board looks like next — so the repaint
    // is left to that, which would otherwise blank the stroke for a frame.
    if (onStrokeEnd) {
      onStrokeEnd(points);
    } else {
      redraw();
    }
  }

  function handlePointerLeave() {
    // Mid-stroke the pointer is captured, so a leave here means the hand really
    // has left the paper and the pencil goes back to where it rests.
    if (!strokeRef.current) {
      setPencil(null);
    }
  }

  const rowHeight = ROSTER.height / Math.max(1, players.length);
  // Big enough to read, but never wider than the panel nor taller than its row.
  const avatarSize = Math.min(8.7, rowHeight * HEIGHT_TO_WIDTH * 0.78);
  const tip = pencil ?? { ...PENCIL_PARK, down: false };

  const turnLabel = isMyTurn
    ? "Your turn to draw"
    : currentDrawer
      ? `${currentDrawer.nickname} is drawing`
      : "Waiting for the next turn";

  // The root is w-full because this screen mounts in two places: standalone at
  // /drawing, and inside the lobby's centring flex column, where a
  // shrink-to-fit root would pull the background in with it.
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden font-sans">
      <div
        className="absolute inset-0 -z-10 animate-diagonal-scroll bg-repeat"
        style={{
          backgroundImage: "url('/images/landing-page/landing-page-bg.jpg')",
          backgroundSize: "720px 512px",
          transform: "scale(1.75)",
        }}
      />

      {/* Turn and phase changes are the only thing on this screen a sighted
          player picks up from motion alone, so they are announced too. */}
      <p aria-live="polite" className="sr-only">
        {`Pass ${pass} of 2. ${turnLabel}.`}
      </p>

      {/* Layout box, locked to the artwork's own 16:9 so the percentages above
          land on the panels the viewer actually sees, with no letterboxing from
          object-contain fitting into a mismatched box. Width is computed rather
          than left to `auto` because every child is absolutely positioned, so
          the box has no in-flow content to grow from. It doubles as the container
          query context: sizes in cqw scale with the frame, not with the page. */}
      <div
        className="frame-drawing-layout relative aspect-[16/9] w-[min(calc(100vw-2rem),1920px,calc((100vh-2rem)*16/9))] [container-type:inline-size]"
        style={{ "--avatar-size": `${avatarSize}cqw` } as CSSProperties}
      >
        {/* Roster: one coloured circle per player down the narrow panel, in turn
            order, each with an arrow pointing in at it from the margin. Whoever
            holds the turn is the one at full strength. */}
        {players.map((player, index) => {
          const centre = ROSTER.top + rowHeight * (index + 0.5);
          const isDrawing = player.id === currentDrawerId;
          return (
            <div key={player.id}>
              {/* The arrow is a mask painted in the player's colour, so every
                  player has one — including the host, whose brown was the one
                  colour with no arrow file drawn for it. */}
              <span
                aria-hidden
                className={`art-arrow absolute -translate-y-1/2 transition-opacity duration-200 ${
                  isDrawing ? "opacity-100" : "opacity-40"
                }`}
                style={{
                  left: `${ARROW.left}%`,
                  top: `${centre}%`,
                  width: `${ARROW.width}cqw`,
                  backgroundColor: player.colour,
                }}
              />
              <div
                className={`absolute flex -translate-y-1/2 justify-center transition-all duration-200 ${
                  isDrawing ? "scale-110 opacity-100" : "opacity-45"
                }`}
                style={{
                  left: `${ROSTER.left}%`,
                  top: `${centre}%`,
                  width: `${ROSTER.width}%`,
                }}
              >
                <AvatarBlob
                  colour={player.colour}
                  initial={player.nickname.charAt(0).toUpperCase() || "?"}
                  className="avatar-fluid"
                />
                <span className="sr-only">
                  {player.nickname}
                  {isDrawing ? " (drawing now)" : ""}
                  {player.id === myPlayerId ? " (you)" : ""}
                </span>
              </div>
            </div>
          );
        })}

        {/* Countdown, on the alarm clock in the top margin. The deadline is the
            server's; this only renders it. */}
        <div
          className={`art-clock absolute ${
            hasDeadline && remainingMs <= URGENT_MS ? "art-clock-urgent" : ""
          }`}
          style={{
            right: `${CLOCK.right}%`,
            top: `${CLOCK.top}%`,
            width: `${CLOCK.width}cqw`,
          }}
        >
          <span
            className="absolute flex items-center justify-center font-bold tabular-nums"
            style={{
              left: `${CLOCK_FACE.left}%`,
              top: `${CLOCK_FACE.top}%`,
              width: `${CLOCK_FACE.width}%`,
              height: `${CLOCK_FACE.height}%`,
              color: INK,
              fontSize: "1.5cqw",
            }}
          >
            {seconds ?? "–"}
          </span>
        </div>

        {/* The pinned note. The group reads the word here; the imposter reads
            their category and nothing else, which makes this note the imposter's
            hint panel too. It is always on screen and never scrolls, which is
            the one thing that panel has to guarantee. */}
        <div
          className="art-note absolute"
          style={{
            right: `${NOTE.right}%`,
            top: `${NOTE.top}%`,
            width: `${NOTE.width}cqw`,
          }}
        >
          <span
            className={`absolute flex items-center justify-center overflow-hidden text-center leading-tight font-bold tracking-wide ${
              hint.kind === "category" ? "italic" : ""
            }`}
            style={{
              left: `${NOTE_BODY.left}%`,
              top: `${NOTE_BODY.top}%`,
              width: `${NOTE_BODY.width}%`,
              height: `${NOTE_BODY.height}%`,
              color: INK,
              fontSize: `${noteSize(hint.text)}cqw`,
            }}
          >
            {hint.kind === "word" ? hint.text.toUpperCase() : hint.text}
          </span>
          {/* Wider than the note it hangs under, which is only ~9cqw of paper
              and would otherwise break this across three lines. */}
          {hint.kind === "category" && (
            <span
              className="absolute left-1/2 top-full w-[220%] -translate-x-1/2 text-center font-bold tracking-wide"
              style={{ color: INK, fontSize: "0.8cqw" }}
            >
              you&rsquo;re the imposter — one guess at the end
            </span>
          )}
        </div>

        {/* Board: the drawing surface, with the pencil riding on top of it. */}
        <div
          className="absolute"
          style={{
            left: `${BOARD.left}%`,
            top: `${BOARD.top}%`,
            width: `${BOARD.width}%`,
            height: `${BOARD.height}%`,
          }}
        >
          <canvas
            ref={canvasRef}
            aria-label={`Shared drawing board. ${turnLabel}.`}
            className={`h-full w-full ${
              canDraw ? "cursor-none touch-none" : "cursor-default"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={handlePointerLeave}
          />
          {/* Anchored by its tip: translating back by the tip's own offset puts
              the tip on the board coordinate above, and rotating about that same
              point keeps it there. The last translate slides the pencil up its
              own shaft, lifting it off the paper between strokes. */}
          {canDraw && (
            <span
              aria-hidden
              className="art-pencil pointer-events-none absolute transition-transform duration-150 ease-out"
              style={{
                left: `${tip.x}%`,
                top: `${tip.y}%`,
                height: `${PENCIL.length}cqw`,
                transformOrigin: `${PENCIL.tipX}% ${PENCIL.tipY}%`,
                transform: `translate(-${PENCIL.tipX}%, -${PENCIL.tipY}%) rotate(${PENCIL.angle}deg) translateY(${
                  tip.down ? 0 : -4
                }%)`,
              }}
            />
          )}
        </div>

        {/* Whose turn it is, and anything the server pushed back. Sits under the
            board in the frame's bottom margin. */}
        <p
          className="absolute left-0 top-[87%] w-full text-center font-bold tracking-wide"
          style={{ color: INK, fontSize: "1.1cqw" }}
        >
          {notice ?? turnLabel}
        </p>
      </div>
    </div>
  );
}

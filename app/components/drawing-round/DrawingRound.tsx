"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AvatarBlob } from "@/app/components/lobby/AvatarBlob";
import { useCountdown } from "@/app/lib/clock";
import type { PlayerId } from "@/shared/types";

// Geometry of drawing-base-layout (2).png, in % of the layout box — sampled
// from the art's own pixels since the hand-drawn frame isn't evenly spaced.
const ROSTER = { left: 10.73, top: 12.96, width: 14.01, height: 72.04 };
const BOARD = { left: 26.35, top: 13.33, width: 61.04, height: 72.5 };

// The layout box is locked to 16:9, so a height % converts to this many
// width % (cqw), letting a roster row height compare against cqw sizes.
const HEIGHT_TO_WIDTH = 9 / 16;

// The arrows sit out in the background margin to the left of the roster, tips
// stopping just short of it — one per player, colour-matched to their avatar.
const ARROW = { left: 4.9, width: 5.3 };

// Clock and note hang in the top margin, note flush with the board's right
// edge. Tops differ because the art shapes differ: these centre the two
// rather than aligning their top edges (which would drop the clock low).
const CLOCK = { right: 22.4, top: 0.32, width: 4.6 };
const NOTE = { right: 12.66, top: 0.8, width: 8.8 };

// Cream interiors of the clock/note art, as % of their own box. The clock's
// face accounts for the 90° turn globals.css applies to that art.
const CLOCK_FACE = { left: 14.27, top: 26.72, width: 72.79, height: 62.12 };
const NOTE_BODY = { left: 11.4, top: 2.2, width: 79.9, height: 95.1 };

// Pencil is anchored and rotated about its graphite tip (tipX/tipY, measured
// off draw-pencil2.png) so the tip tracks the pointer at any lean angle.
const PENCIL = { length: 8, tipX: 58, tipY: 100, angle: 34 };

// Where the design rests the pencil while nobody is drawing, in board percent.
const PENCIL_PARK = { x: 69.7, y: 59.8 };

// Canvas.tsx renders at a hardcoded 800x600 with no override prop; mirrored
// here to compute the scale that fills the board slot — keep in sync if that
// changes, since there's nothing to import that would do it automatically.
const TEAMMATE_CANVAS_WIDTH = 800;
const TEAMMATE_CANVAS_HEIGHT = 600;

// A turn is 20s (server/timers.ts PHASE_DURATIONS_MS.DRAWING), so the clock
// turns red for the last quarter of it rather than the 10s the 60s mockup used.
const URGENT_MS = 5_000;
const INK = "#3f3730";

// Note text size: shrinks by measuring the real element's scrollWidth/Height
// rather than guessing a character width, which clipped on long words like
// "corkscrew" that never wrap.
const NOTE_MAX_CQW = 1.2;
const NOTE_MIN_CQW = 0.35;
const NOTE_STEP_CQW = 0.05;

// Refits only when the hint text changes, not every countdown tick. Takes the
// ref rather than returning one to satisfy eslint-plugin-react-hooks' rule
// against threading a ref out through a hook's return value.
function useFitNoteSize(
  ref: React.RefObject<HTMLSpanElement | null>,
  text: string,
): number {
  const [fontSize, setFontSize] = useState(NOTE_MAX_CQW);

  useLayoutEffect(() => {
    const maybeEl = ref.current;
    if (!maybeEl) {
      return;
    }
    // Rebind so TS carries the non-null narrowing into the nested function.
    const el = maybeEl;

    function fit() {
      // Container can briefly measure zero (mid dev-server recompile, or
      // before first paint) — skip and let the observer below retry.
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        return;
      }
      let size = NOTE_MAX_CQW;
      el.style.fontSize = `${size}cqw`;
      while (
        size > NOTE_MIN_CQW &&
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      ) {
        size = Math.max(NOTE_MIN_CQW, size - NOTE_STEP_CQW);
        el.style.fontSize = `${size}cqw`;
      }
      setFontSize(size);
    }

    fit();
    // Also catches later resizes; font changes inside fit() don't feed back
    // in, since the box's size comes from its ancestor, not its content.
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
    // ref's identity never changes, so only `text` needs to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return fontSize;
}

export interface RosterPlayer {
  id: PlayerId;
  nickname: string;
  colour: string;
}

// What this player is allowed to know: the word for the group, only the
// category for the imposter. Mirrors the PlayerSecret union in shared/types.ts.
export type Hint =
  | { kind: "word"; text: string }
  | { kind: "category"; text: string };

interface DrawingRoundProps {
  // In turn order, so the roster reads top to bottom as the rotation.
  players: RosterPlayer[];
  currentDrawerId: PlayerId | null;
  myPlayerId: PlayerId;
  hint: Hint;
  // Display cue only — the real turn lock lives in Canvas's own myTurn prop
  // and, behind that, the server.
  canDraw: boolean;
  phaseEndsAt: number | null;
  pass: 1 | 2;
  // Real play passes teammates' <Canvas>; the offline preview passes a blank
  // placeholder. Either way this component only sizes and frames it.
  board: ReactNode;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export default function DrawingRound({
  players,
  currentDrawerId,
  myPlayerId,
  hint,
  canDraw,
  phaseEndsAt,
  pass,
  board,
}: DrawingRoundProps) {
  const boardOuterRef = useRef<HTMLDivElement>(null);

  // Scales the fixed canvas box to fill the board slot. Starts at 1/1 so
  // server and first client render match; ResizeObserver corrects it after mount.
  const [scale, setScale] = useState({ x: 1, y: 1 });

  useEffect(() => {
    const el = boardOuterRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setScale({
        x: el.clientWidth / TEAMMATE_CANVAS_WIDTH,
        y: el.clientHeight / TEAMMATE_CANVAS_HEIGHT,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Purely visual — tracks the pointer without preventDefault/stopPropagation,
  // so the same events still reach Canvas underneath and drive the real stroke.
  const [pencil, setPencil] = useState<{
    x: number;
    y: number;
    down: boolean;
  } | null>(null);

  function pointFrom(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width) * 100,
      y: clamp01((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canDraw) {
      return;
    }
    setPencil({ ...pointFrom(event), down: true });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!canDraw) {
      return;
    }
    // Read now, not inside the updater below: currentTarget is null by the
    // time a queued updater runs, which crashed the tree on a real drag.
    const point = pointFrom(event);
    setPencil((current) => ({ ...point, down: current?.down ?? false }));
  }

  function handlePointerUp() {
    setPencil((current) => (current ? { ...current, down: false } : current));
  }

  // Null before the client knows the deadline; keeping it null (not a guess)
  // keeps the server's HTML and the first client render identical.
  const remainingMs = useCountdown(phaseEndsAt);
  const hasDeadline = phaseEndsAt !== null;
  const seconds = hasDeadline ? Math.ceil(remainingMs / 1000) : null;

  const isMyTurn = currentDrawerId === myPlayerId;
  const currentDrawer =
    players.find((player) => player.id === currentDrawerId) ?? null;

  const noteRef = useRef<HTMLSpanElement>(null);
  const noteFontSize = useFitNoteSize(noteRef, hint.text);

  const rowHeight = ROSTER.height / Math.max(1, players.length);
  // Big enough to read, but never wider than the panel nor taller than its row.
  const avatarSize = Math.min(8.7, rowHeight * HEIGHT_TO_WIDTH * 0.78);
  const tip = pencil ?? { ...PENCIL_PARK, down: false };

  const turnLabel = isMyTurn
    ? "Your turn to draw"
    : currentDrawer
      ? `${currentDrawer.nickname} is drawing`
      : "Waiting for the next turn";

  // w-full since this mounts both standalone at /drawing and inside the app's
  // centring flex column.
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

      {/* Announce turn/phase changes for players who can't see the motion. */}
      <p aria-live="polite" className="sr-only">
        {`Pass ${pass} of 2. ${turnLabel}.`}
      </p>

      {/* Locked to the art's 16:9 so the % coordinates line up; width is
          computed since every child is absolutely positioned. Also the
          container-query context for the cqw sizes below. */}
      <div
        className="frame-drawing-layout relative aspect-video w-[min(calc(100vw-2rem),1920px,calc((100vh-2rem)*16/9))] @container"
        style={{ "--avatar-size": `${avatarSize}cqw` } as CSSProperties}
      >
        {/* Roster: one coloured circle per player in turn order, each with an
            arrow pointing in at whoever holds the turn. */}
        {players.map((player, index) => {
          const centre = ROSTER.top + rowHeight * (index + 0.5);
          const isDrawing = player.id === currentDrawerId;
          return (
            <div key={player.id}>
              {/* Masked so every player's colour works from one arrow asset,
                  including the host's brown, which had no arrow file drawn for it. */}
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

        {/* Countdown on the clock art; the deadline is the server's. */}
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

        {/* The word for the group, the category for the imposter — this note
            is the imposter's hint panel too, and it never scrolls. */}
        <div
          className="art-note absolute"
          style={{
            right: `${NOTE.right}%`,
            top: `${NOTE.top}%`,
            width: `${NOTE.width}cqw`,
          }}
        >
          <span
            ref={noteRef}
            className={`absolute flex items-center justify-center overflow-hidden text-center leading-tight font-bold tracking-wide ${
              hint.kind === "category" ? "italic" : ""
            }`}
            style={{
              left: `${NOTE_BODY.left}%`,
              top: `${NOTE_BODY.top}%`,
              width: `${NOTE_BODY.width}%`,
              height: `${NOTE_BODY.height}%`,
              color: INK,
              fontSize: `${noteFontSize}cqw`,
            }}
          >
            {hint.kind === "word" ? hint.text.toUpperCase() : hint.text}
          </span>
          {/* Wider than the note itself so this doesn't wrap to three lines. */}
          {hint.kind === "category" && (
            <span
              className="absolute left-1/2 top-full w-[220%] -translate-x-1/2 text-center font-bold tracking-wide"
              style={{ color: INK, fontSize: "0.8cqw" }}
            >
              you&rsquo;re the imposter — one guess at the end
            </span>
          )}
        </div>

        {/* Teammates' <Canvas>, scaled to fill this slot, pencil on top. */}
        <div
          ref={boardOuterRef}
          className="absolute overflow-hidden"
          style={{
            left: `${BOARD.left}%`,
            top: `${BOARD.top}%`,
            width: `${BOARD.width}%`,
            height: `${BOARD.height}%`,
            cursor: canDraw ? "none" : undefined,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Canvas renders itself at a fixed size regardless of this wrapper;
              scaling the wrapper (not Canvas) keeps its DPR/coordinate math
              correct, since getBoundingClientRect reflects the transform. */}
          <div
            style={{
              width: `${TEAMMATE_CANVAS_WIDTH}px`,
              height: `${TEAMMATE_CANVAS_HEIGHT}px`,
              transform: `scale(${scale.x}, ${scale.y})`,
              transformOrigin: "top left",
            }}
          >
            {board}
          </div>
          {/* Anchored and rotated about its tip, so translateY here just lifts
              it off the paper between strokes. */}
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

        {/* Whose turn it is. Sits under the board in the frame's bottom margin. */}
        <p
          className="absolute left-0 top-[87%] w-full text-center font-bold tracking-wide"
          style={{ color: INK, fontSize: "1.1cqw" }}
        >
          {turnLabel}
        </p>
      </div>
    </div>
  );
}

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
// board's, the way the design lines them up. Their tops are not equal because
// they are not the same shape: the clock's art is 757 wide by 887 tall and the
// note's is 447 wide by 225 tall, so at these widths the clock stands about
// 5.39 tall against the note's 4.43. Matching `top` on the two would line up
// their upper edges and leave the clock's centre visibly low against the
// note's, which is what the mismatch in the drawing round looked like before
// this was picked to centre them instead: clock top plus half its own height
// equals note top plus half the note's height.
const CLOCK = { right: 22.4, top: 0.32, width: 4.6 };
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
// tracks the pointer exactly however the pencil leans. tipX/tipY are the tip's
// position within the pencil ink, measured off draw-pencil2.png; the angle
// matches the lean in the design.
const PENCIL = { length: 8, tipX: 58, tipY: 100, angle: 34 };

// Where the design rests the pencil while nobody is drawing, in board percent.
const PENCIL_PARK = { x: 69.7, y: 59.8 };

/* app/components/game/Canvas.tsx (Alex's) draws at a hardcoded 800x600 CSS
   pixel size with no prop to override it — shared/types.ts no longer exports a
   canvas size constant at all, since Point moved to being natively 0..1 of
   whatever the canvas element renders at. So this is the one place that still
   needs to know their fixed size, purely to compute how much to visually scale
   it by to fill the hand-drawn board slot. If Canvas.tsx's own inline style
   ever changes, this has to follow it — there is nothing to import that would
   keep the two in sync automatically. */
const TEAMMATE_CANVAS_WIDTH = 800;
const TEAMMATE_CANVAS_HEIGHT = 600;

// A turn is 20s (server/timers.ts PHASE_DURATIONS_MS.DRAWING), so the clock
// turns red for the last quarter of it rather than the 10s the 60s mockup used.
const URGENT_MS = 5_000;
const INK = "#3f3730";

/* Sizing the text on the note.

   First pass here was a closed-form guess — estimate an average character
   width, divide the paper's width by the longest word, done. It came apart on
   "corkscrew": a real T10 word list entry, one unbroken word with nowhere to
   wrap, and the guessed character width did not leave room for tracking-wide's
   letter-spacing. It clipped by two pixels — the kind of gap a fixture built
   from "hot air balloon" and "a piece of technology" never exercises, because
   both of those get bailed out by wrapping onto a second line before the
   per-character error accumulates enough to matter.

   This measures the real element instead: render at the largest allowed size,
   then shrink in fixed steps until it actually fits, reading true scrollWidth /
   scrollHeight against the box on every step. That is correct for whatever the
   loaded font, its bold weight, and tracking-wide actually render at, with no
   assumption about average glyph width baked in. */
const NOTE_MAX_CQW = 1.2;
const NOTE_MIN_CQW = 0.35;
const NOTE_STEP_CQW = 0.05;

// Sized once per distinct hint text (a new round), not on every countdown
// tick: useCountdown re-renders this component every 250ms, and re-measuring
// on each of those would be pointless work for a value that cannot have
// changed. Expressed in cqw throughout, so a correctly-fitted value stays
// correct across a later resize with no re-measurement needed — the text and
// its box scale together, and the ratio between them is what a shrink-to-fit
// is solving for.
//
// Takes the ref rather than creating and returning one: the eslint-plugin-
// react-hooks "refs" rule flags a ref threaded back out through a hook's
// return value, since it can no longer prove nothing else in that returned
// object was itself read from ref.current during render. Owning the ref in
// the component and only handing back the plain number sidesteps that.
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
    // Rebound so the nested closures below see it as definitely non-null: TS
    // does not carry the `if (!maybeEl) return` narrowing into a function
    // declared afterward, even though this binding is never reassigned.
    const el = maybeEl;

    function fit() {
      // The note sits inside a container-query ancestor that can measure zero
      // width for a moment — observed here mid dev-server recompile, but the
      // same race exists at first paint any time a browser has not yet settled
      // the container's real size. Fitting against that would lock in whatever
      // size the loop happened to land on (the effect only re-runs when `text`
      // changes) and never correct itself. Skip and wait for the observer below
      // to fire again once there is something real to measure against.
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
    // Safety net around the zero-size guard above, and around anything else
    // that could change the real box size after this mounts (a window resize
    // mid-round, in case a future layout change breaks the cqw-scales-with-it
    // assumption this otherwise relies on). Font-size mutations inside fit()
    // do not feed back into this: the note's own box is a percentage of its
    // ancestor, not shrink-to-fit around its content, so changing its text
    // size does not change its clientWidth/clientHeight.
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
    // ref is a useRef object: its identity never changes across renders, so it
    // cannot be a missing reactive dependency — only `text` should re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return fontSize;
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
  hint: Hint;
  // Whether the decorative pencil tracks the pointer. This screen never draws
  // itself — that is Canvas's job — so this is a display cue, not a lock: the
  // real gate on whether a stroke is accepted lives in Canvas's own myTurn
  // prop and, behind that, in the server.
  canDraw: boolean;
  phaseEndsAt: number | null;
  pass: 1 | 2;
  // The drawing surface itself. In play this is teammates' <Canvas>, which
  // owns every stroke, every socket emission, and the turn-lock; the offline
  // preview passes a blank placeholder instead. Either way this component
  // only sizes and frames it — it never reaches into what strokes exist.
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

  // Scales the fixed TEAMMATE_CANVAS_WIDTH/HEIGHT box up or down to exactly
  // fill the board slot, whatever size that slot renders at. 1/1 until the
  // first measurement — same value on the server and on the first client
  // render, so hydration still matches; ResizeObserver only runs after mount.
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

  // null parks the pencil where the design rests it; `down` is whether it is
  // touching the paper, which only changes how far it lifts along its own
  // shaft. This never drives a stroke — it is purely what the pencil icon
  // draws, kept in sync with the pointer by listening on the board wrapper
  // rather than on Canvas's own <canvas>, so it rides on top of Canvas's
  // pointer handling without touching it: nothing here calls
  // preventDefault or stopPropagation, so the same pointerdown/move/up that
  // moves this pencil still reaches Canvas underneath and drives the real
  // stroke exactly as it would with no pencil overlay at all.
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
    // Read while the event is still live: currentTarget is nulled once
    // dispatch finishes, and a setState updater can run after that point
    // rather than synchronously inside this handler — calling pointFrom(event)
    // from inside the updater below crashed the whole tree on exactly that
    // race, confirmed live with a real drag (getBoundingClientRect on null).
    const point = pointFrom(event);
    setPencil((current) => ({ ...point, down: current?.down ?? false }));
  }

  function handlePointerUp() {
    setPencil((current) => (current ? { ...current, down: false } : current));
  }

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

  // The root is w-full because this screen mounts in two places: standalone at
  // /drawing, and inside the app's centring flex column, where a
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

        {/* Board: teammates' <Canvas> scaled to fill this slot, with the pencil
            riding on top of it. */}
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
          {/* Canvas renders itself at a fixed TEAMMATE_CANVAS_WIDTH x HEIGHT
              CSS size regardless of this wrapper. Scaling this box (rather than
              Canvas's own element) leaves Canvas's DPR and coordinate math
              untouched: getBoundingClientRect already reports the post-transform
              size, so the fractions it computes from a pointer event are correct
              at any scale, and clientWidth/clientHeight — what it sizes its
              backing store from — are unaffected by a transform on an ancestor. */}
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

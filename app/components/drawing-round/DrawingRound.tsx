"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AvatarBlob } from "@/app/components/lobby/AvatarBlob";
import { FloatingSecretCard } from "@/app/components/game/FloatingSecretCard";
import { useCountdown } from "@/app/lib/clock";
import { useFitFontSize } from "@/app/lib/useFitFontSize";
import {
  BOARD,
  CLOCK,
  CLOCK_FACE,
  HEIGHT_TO_WIDTH,
  INK,
  ROSTER,
  TEAMMATE_CANVAS_HEIGHT,
  TEAMMATE_CANVAS_WIDTH,
  type RosterPlayer,
} from "./geometry";
import type { PlayerId, PlayerSecret } from "@/shared/types";

// Geometry specific to the drawing round. The roster / board / clock coordinates
// it shares with the voting round live in ./geometry.
//
// The arrows sit out in the background margin to the left of the roster, tips
// stopping just short of it — one per player, colour-matched to their avatar.
const ARROW = { left: 4.9, width: 5.3 };

// Note hangs in the top margin, flush with the board's right edge.
const NOTE = { right: 12.66, top: 0.8, width: 8.8 };

// Cream interior of the note art, as % of its own box.
const NOTE_BODY = { left: 11.4, top: 2.2, width: 79.9, height: 95.1 };

// Pencil is anchored and rotated about its graphite tip (tipX/tipY, measured
// off draw-pencil2.png) so the tip tracks the pointer at any lean angle.
const PENCIL = { length: 8, tipX: 58, tipY: 100, angle: 34 };

// Where the design rests the pencil while nobody is drawing, in board percent.
const PENCIL_PARK = { x: 69.7, y: 59.8 };

// Sits in the bottom right margin, outside the board, flush with the board's
// right edge the same way NOTE is (right: 12.66 there too) — this is what
// lines an element's right edge up with the board's rather than the frame's.
const MUSIC_TOGGLE = { right: 12.66, bottom: 4.5, width: 4 };

// A turn is 20s (server/timers.ts PHASE_DURATIONS_MS.DRAWING), so the clock
// turns red for the last quarter of it rather than the 10s the 60s mockup used.
const URGENT_MS = 5_000;

// Plays once a turn's own clock reaches zero. Kept apart from the round loop
// in DrawingRoundScreen, which runs for the whole phase rather than per turn.
const TIMER_END_SRC = "/sounds/timer-end.wav";
const TIMER_END_VOLUME = 0.8;

// Note text size: shrinks by measuring the real element's scrollWidth/Height
// rather than guessing a character width, which clipped on long words like
// "corkscrew" that never wrap. See useFitFontSize.
const NOTE_MAX_CQW = 1.2;
const NOTE_MIN_CQW = 0.35;
const NOTE_STEP_CQW = 0.05;

interface DrawingRoundProps {
  // In turn order, so the roster reads top to bottom as the rotation.
  players: RosterPlayer[];
  currentDrawerId: PlayerId | null;
  myPlayerId: PlayerId;
  secret: PlayerSecret;
  roundNumber: number;
  // Display cue only — the real turn lock lives in Canvas's own myTurn prop
  // and, behind that, the server.
  canDraw: boolean;
  phaseEndsAt: number | null;
  pass: 1 | 2;
  // Owned by the caller (DrawingRoundScreen persists it past this component's
  // own mount, since a new round remounts everything here) — this only reads
  // it, to pick the icon and gate the timer SFX below.
  muted: boolean;
  onToggleMuted: () => void;
  // Real play passes teammates' <Canvas>; the offline preview passes a blank
  // placeholder. Either way this component only sizes and frames it.
  board: ReactNode;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export default function DrawingRound({
  players,
  currentDrawerId,
  myPlayerId,
  secret,
  roundNumber,
  canDraw,
  phaseEndsAt,
  pass,
  muted,
  onToggleMuted,
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

  // useCountdown re-renders on a 250ms tick and clamps at zero, so once a
  // turn's clock runs out, remainingMs stays exactly 0 on every render after
  // that until phaseEndsAt moves on to the next turn. The ref guards against
  // firing again on those later renders; resetting it on phaseEndsAt is what
  // lets the very next turn's expiry fire again.
  const hasPlayedTimeUp = useRef(false);
  useEffect(() => {
    hasPlayedTimeUp.current = false;
  }, [phaseEndsAt]);
  useEffect(() => {
    if (hasDeadline && remainingMs <= 0 && !hasPlayedTimeUp.current) {
      hasPlayedTimeUp.current = true;
      const bell = new Audio(TIMER_END_SRC);
      bell.volume = TIMER_END_VOLUME;
      // Set rather than skipped, so the one music toggle covers both this and
      // the round loop the same way, instead of two different mechanisms.
      bell.muted = muted;
      // A browser can refuse this; that just means silence, not a crash.
      bell.play().catch(() => {});
    }
  }, [hasDeadline, remainingMs, muted]);

  const isMyTurn = currentDrawerId === myPlayerId;
  const currentDrawer =
    players.find((player) => player.id === currentDrawerId) ?? null;

  const noteText = `ROUND ${roundNumber}`;
  const noteRef = useRef<HTMLSpanElement>(null);
  const noteFontSize = useFitFontSize(noteRef, noteText, {
    min: NOTE_MIN_CQW,
    max: NOTE_MAX_CQW,
    step: NOTE_STEP_CQW,
    unit: "cqw",
  });

  const frameRef = useRef<HTMLDivElement>(null);

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
        ref={frameRef}
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
            className="absolute flex items-center justify-center overflow-hidden text-center leading-tight font-bold tracking-wide"
            style={{
              left: `${NOTE_BODY.left}%`,
              top: `${NOTE_BODY.top}%`,
              width: `${NOTE_BODY.width}%`,
              height: `${NOTE_BODY.height}%`,
              color: INK,
              fontSize: `${noteFontSize}cqw`,
            }}
          >
            {noteText}
          </span>
        </div>

        <FloatingSecretCard frameRef={frameRef} secret={secret} />

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

        {/* Mutes both the round music and the timer bell together, as one
            sound switch rather than two. */}
        <button
          type="button"
          onClick={onToggleMuted}
          aria-pressed={muted}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          className={`art-music-toggle absolute cursor-pointer ${
            muted ? "art-music-toggle-off" : "art-music-toggle-on"
          }`}
          style={{
            right: `${MUSIC_TOGGLE.right}%`,
            bottom: `${MUSIC_TOGGLE.bottom}%`,
            width: `${MUSIC_TOGGLE.width}cqw`,
          }}
        />
      </div>
    </div>
  );
}

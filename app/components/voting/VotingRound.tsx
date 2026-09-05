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
} from "@/app/components/drawing-round/geometry";
import { serverNow, useCountdown } from "@/app/lib/clock";
import type { PlayerId, PlayerSecret } from "@/shared/types";

const HAND = { left: 1.5, width: 13 };
const URGENT_MS = 5_000;
const INTRO_MS = 3_000;
const INTRO_FADE_MS = 300;
const INTRO_MIN_REMAINING_MS = 40_000;

interface VotingRoundProps {
  players: RosterPlayer[];
  myPlayerId: PlayerId;
  votedPlayerIds: PlayerId[];
  pendingTargetId: PlayerId | null;
  onPick: (targetId: PlayerId) => void;
  secret: PlayerSecret;
  phaseEndsAt: number | null;
  errorMessage: string | null;
  board: ReactNode;
}

export default function VotingRound({
  players,
  myPlayerId,
  votedPlayerIds,
  pendingTargetId,
  onPick,
  secret,
  phaseEndsAt,
  errorMessage,
  board,
}: VotingRoundProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const boardOuterRef = useRef<HTMLDivElement>(null);

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

  const phaseEndsAtAtMount = useRef(phaseEndsAt);
  const [showIntro, setShowIntro] = useState(false);
  const [introLeaving, setIntroLeaving] = useState(false);

  useEffect(() => {
    const endsAt = phaseEndsAtAtMount.current;
    const freshEntry =
      endsAt === null || endsAt - serverNow() > INTRO_MIN_REMAINING_MS;
    if (!freshEntry) {
      return;
    }
    setShowIntro(true);
    const fade = setTimeout(
      () => setIntroLeaving(true),
      INTRO_MS - INTRO_FADE_MS,
    );
    const done = setTimeout(() => setShowIntro(false), INTRO_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, []);

  const remainingMs = useCountdown(phaseEndsAt);
  const hasDeadline = phaseEndsAt !== null;
  const seconds = hasDeadline ? Math.ceil(remainingMs / 1000) : null;

  const rowHeight = ROSTER.height / Math.max(1, players.length);
  const avatarSize = Math.min(8.7, rowHeight * HEIGHT_TO_WIDTH * 0.78);

  const votedIds = new Set(votedPlayerIds);
  const pendingIndex = players.findIndex(
    (player) => player.id === pendingTargetId,
  );

  const handTopPct =
    pendingIndex >= 0
      ? ROSTER.top + rowHeight * (pendingIndex + 0.5)
      : ROSTER.top + ROSTER.height / 2;

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

      <p aria-live="polite" className="sr-only">
        {pendingIndex >= 0
          ? `You have accused ${players[pendingIndex].nickname}. Tap another player to change your vote.`
          : "Voting. Tap the player you think is the imposter."}
      </p>

      <div
        ref={frameRef}
        className="frame-drawing-layout relative aspect-video w-[min(calc(100vw-2rem),1920px,calc((100vh-2rem)*16/9))] @container"
        style={{ "--avatar-size": `${avatarSize}cqw` } as CSSProperties}
      >
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 transition-[top] duration-200 ease-out ${
            pendingTargetId ? "art-vote-hand-accuse" : "art-vote-hand"
          }`}
          style={{
            left: `${HAND.left}%`,
            top: `${handTopPct}%`,
            width: `${HAND.width}cqw`,
          }}
        />

        {players.map((player, index) => {
          const centre = ROSTER.top + rowHeight * (index + 0.5);
          const isSelf = player.id === myPlayerId;
          const isPending = player.id === pendingTargetId;
          const hasVoted = votedIds.has(player.id) && !isPending;

          const avatar = (
            <AvatarBlob
              colour={player.colour}
              initial={player.nickname.charAt(0).toUpperCase() || "?"}
              className="avatar-fluid cursor-pointer"
            />
          );

          return (
            <div
              key={player.id}
              className={`absolute flex -translate-y-1/2 justify-center transition-opacity duration-200 ${
                hasVoted ? "opacity-45" : "opacity-100"
              }`}
              style={{
                left: `${ROSTER.left}%`,
                top: `${centre}%`,
                width: `${ROSTER.width}%`,
              }}
            >
              {isSelf ? (
                <div className="relative opacity-40" aria-disabled>
                  {avatar}
                  <span className="sr-only">
                    {player.nickname} (you) — you cannot vote for yourself
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onPick(player.id)}
                  className="relative rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {avatar}
                  {isPending && (
                    <>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-[-8%] rounded-full ring-4 ring-red-500"
                      />
                      <span
                        aria-hidden
                        className="art-accuse-badge pointer-events-none absolute"
                        style={{ width: "62%", right: "-20%", top: "-26%" }}
                      />
                    </>
                  )}
                  <span className="sr-only">
                    {player.nickname}
                    {isPending
                      ? " (your accusation)"
                      : hasVoted
                        ? " (has voted)"
                        : ""}
                  </span>
                </button>
              )}
            </div>
          );
        })}

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

        <FloatingSecretCard frameRef={frameRef} secret={secret} />

        {/* The finished drawing. */}
        <div
          ref={boardOuterRef}
          className="absolute overflow-hidden"
          style={{
            left: `${BOARD.left}%`,
            top: `${BOARD.top}%`,
            width: `${BOARD.width}%`,
            height: `${BOARD.height}%`,
          }}
        >
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
        </div>

        <p
          className="absolute left-0 top-[87%] w-full text-center font-bold tracking-wide"
          style={{ color: INK, fontSize: "1.1cqw" }}
        >
          {errorMessage ? (
            <span className="text-red-600" role="status">
              {errorMessage}
            </span>
          ) : pendingTargetId ? (
            "Tap another player to change your vote"
          ) : (
            "Who is the imposter?"
          )}
        </p>
      </div>

      {showIntro && (
        <div
          className={`pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/85 transition-opacity duration-300 ${
            introLeaving ? "opacity-0" : "opacity-100"
          }`}
        >
          <div
            className="frame-vote animate-boil w-[min(60vw,480px)]"
            aria-hidden
          />
          <p className="sr-only">
            Voting has started. Choose who you think is the imposter.
          </p>
        </div>
      )}
    </div>
  );
}

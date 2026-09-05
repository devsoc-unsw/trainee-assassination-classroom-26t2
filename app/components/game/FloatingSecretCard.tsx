"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  SECRET_DISPLAY_IMPOSTER_HEIGHT,
  SECRET_DISPLAY_WORD_CARD_LEFT_OFFSET,
  SECRET_DISPLAY_WORD_HEIGHT,
  SecretDisplay,
} from "@/app/components/lobby/SecretDisplay";
import { ROSTER, SECRET_CARD_GAP } from "@/app/components/drawing-round/geometry";
import type { PlayerSecret } from "@/shared/types";

interface FloatingSecretCardProps {
  // The 16:9 stage the card measures itself against.
  frameRef: RefObject<HTMLDivElement | null>;
  secret: PlayerSecret;
}

// The role-hint card — the word for the group, the category for the imposter —
// floated just above the roster. Shared by the drawing and voting rounds, which
// both sit on the same stage; extracted from DrawingRound so there's one copy
// of the positioning math.
export function FloatingSecretCard({ frameRef, secret }: FloatingSecretCardProps) {
  const isImposter = "isImposter" in secret;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const maybeFrame = frameRef.current;
    if (!maybeFrame) {
      return;
    }
    const frame = maybeFrame;

    function recompute() {
      const rect = frame.getBoundingClientRect();
      const rosterCentre =
        rect.left + ((ROSTER.left + ROSTER.width / 2) / 100) * rect.width;
      const left = isImposter
        ? rosterCentre
        : rosterCentre - SECRET_DISPLAY_WORD_CARD_LEFT_OFFSET;
      const height = isImposter
        ? SECRET_DISPLAY_IMPOSTER_HEIGHT
        : SECRET_DISPLAY_WORD_HEIGHT;
      const top = Math.max(SECRET_CARD_GAP, rect.top - height - SECRET_CARD_GAP);
      setPos({ left, top });
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(frame);
    window.addEventListener("resize", recompute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [frameRef, isImposter]);

  if (!pos) {
    return null;
  }

  return (
    <div
      className="fixed z-20"
      style={{
        left: `${pos.left}px`,
        top: `${pos.top}px`,
        transform: "translateX(-50%)",
      }}
    >
      <SecretDisplay secret={secret} />
    </div>
  );
}

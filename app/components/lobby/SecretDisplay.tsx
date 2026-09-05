"use client";

import { useRef } from "react";
import { useFitFontSize } from "@/app/lib/useFitFontSize";
import type { PlayerSecret } from "@/shared/types";

interface SecretDisplayProps {
  secret: PlayerSecret;
}

const TEXT_MAX_PX = 11;
const TEXT_MIN_PX = 6;
const TEXT_STEP_PX = 0.25;
const IMPOSTER_SCALE = 1.2;
const WORD_SCALE = 1.6;
const BASE_WIDTH = 320;
const BASE_HEIGHT = 140;
export const SECRET_DISPLAY_IMPOSTER_HEIGHT = BASE_HEIGHT * IMPOSTER_SCALE;
export const SECRET_DISPLAY_WORD_HEIGHT = BASE_HEIGHT * WORD_SCALE;
export const SECRET_DISPLAY_WORD_CARD_LEFT_OFFSET = 15.6 * WORD_SCALE;

export function SecretDisplay({ secret }: SecretDisplayProps) {
  const isImposter = "isImposter" in secret;
  const textRef = useRef<HTMLParagraphElement>(null);
  const text = isImposter
    ? `Hint: ${secret.category}`
    : `The Word: ${secret.word}`;
  const fontSize = useFitFontSize(textRef, text, {
    min: TEXT_MIN_PX,
    max: TEXT_MAX_PX,
    step: TEXT_STEP_PX,
  });

  const card = isImposter ? (
    <>
      <div
        className="frame-imposter-chameleon-reveal absolute top-0 left-0 w-35 h-80"
        style={{
          transform: "rotate(-90deg) translateX(-100%)",
          transformOrigin: "top left",
        }}
        aria-hidden
      />
      <div className="absolute left-27.5 right-2.5 top-2 bottom-13 flex flex-col items-center justify-center gap-1 text-center">
        <p className="text-xs font-bold text-red-600">YOU ARE AN IMPOSTER!</p>
        <p
          ref={textRef}
          className="flex h-14 w-full items-center justify-center overflow-hidden px-1 text-center leading-tight font-bold text-black"
          style={{ fontSize: `${fontSize}px` }}
        >
          {text}
        </p>
      </div>
    </>
  ) : (
    <>
      <div
        className="frame-non-imposter-card absolute top-0 left-0 w-35 h-80"
        style={{
          transform: "rotate(-90deg) translateX(-100%)",
          transformOrigin: "top left",
        }}
        aria-hidden
      />

      <div className="absolute left-30 right-22.25 top-9 bottom-18.75 flex flex-col items-center justify-center gap-1 text-center">
        <p
          ref={textRef}
          className="flex h-7.25 w-full items-center justify-center overflow-hidden px-1 text-center leading-tight font-bold text-black"
          style={{ fontSize: `${fontSize}px` }}
        >
          {text}
        </p>
      </div>
    </>
  );

  const scale = isImposter ? IMPOSTER_SCALE : WORD_SCALE;

  return (
    <div style={{ width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale }}>
      <div
        className="relative h-35 w-[320px] overflow-hidden"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        {card}
      </div>
    </div>
  );
}

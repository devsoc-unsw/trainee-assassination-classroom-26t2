"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomCode } from "@/shared/types";

interface RoomCodeBadgeProps {
  code: RoomCode;
}

const COPIED_DURATION_MS = 1500;

export function RoomCodeBadge({ code }: RoomCodeBadgeProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(
        () => setCopied(false),
        COPIED_DURATION_MS,
      );
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="room-code-badge group frame-room-code flex w-64 flex-col items-center justify-center gap-1 border-0 bg-transparent px-[12%] pt-[20%] pb-[12%] text-black cursor-pointer animate-boil"
    >
      <span className="font-mono text-xl font-bold tracking-[0.2em] tabular-nums whitespace-nowrap transition-opacity group-hover:opacity-50">
        {code}
      </span>
      <span
        aria-live="polite"
        className="font-sans text-xs font-normal text-black/60"
      >
        {copied ? "Copied!" : ""}
      </span>
    </button>
  );
}

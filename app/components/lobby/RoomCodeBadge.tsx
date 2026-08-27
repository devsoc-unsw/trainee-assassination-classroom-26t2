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
      className="room-code-badge flex items-center gap-2 rounded-xl border-2 border-black/10 bg-white/70 px-4 py-2 font-mono text-lg font-bold tracking-widest text-black"
    >
      {code}
      <span
        aria-live="polite"
        className="font-sans text-xs font-normal text-black/60"
      >
        {copied ? "Copied!" : "Tap to copy"}
      </span>
    </button>
  );
}

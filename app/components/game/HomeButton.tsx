"use client";

import { useState } from "react";
import type { Result } from "@/shared/events";
import { MIN_PLAYERS } from "@/shared/types";

interface HomeButtonProps {
  onPress: () => void;
}

export function HomeButton({
  onPress,
}: HomeButtonProps) {


  async function handleClick() {
    const result = onPress();
  }

  return (
    <div className="start-button-wrap flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="start-button w-64 animate-boil frame-start-game disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="sr-only">
            "Home"
        </span>
      </button>
    </div>
  );
}

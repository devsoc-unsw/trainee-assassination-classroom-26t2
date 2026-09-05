import { PublicGameState } from "@/shared/types";
import { useEffect, useState } from "react";

interface TimerProps {
  state: PublicGameState;
}

export function Timer({ state }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [phaseEnd, setPhaseEnd] = useState(0);

  useEffect(() => {
    if (!phaseEnd) return;

    function calc_time() {
      const secs = Math.floor((phaseEnd - Date.now()) / 1000);
      if (secs > 0) {
        setSecondsLeft(secs);
      } else {
        setSecondsLeft(0);
      }
    }
    calc_time();

    const interval = setInterval(calc_time, 500);

    return () => clearInterval(interval);
  }, [phaseEnd]);

  useEffect(() => {
    setPhaseEnd(state.phaseEndsAt ?? 0);
  }, [state]);

  if (phaseEnd) {
    return <h1>Time left: {secondsLeft}</h1>;
  }
}

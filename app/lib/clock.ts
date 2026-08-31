"use client";

import { useEffect, useState } from "react";

let clockOffsetMs = 0;

export function setClockOffset(ms: number): void {
  clockOffsetMs = ms;
}

export function getClockOffset(): number {
  return clockOffsetMs;
}

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

export function estimateOffset(
  sentAt: number,
  serverTime: number,
  receivedAt: number,
): number {
  const rtt = receivedAt - sentAt;
  return serverTime + rtt / 2 - receivedAt;
}

export interface OffsetSample {
  rtt: number;
  offset: number;
}

export function bestSample(samples: OffsetSample[]): OffsetSample | null {
  return samples.reduce<OffsetSample | null>(
    (best, sample) => (best === null || sample.rtt < best.rtt ? sample : best),
    null,
  );
}

export function useCountdown(phaseEndsAt: number | null): number {
  const [, rerender] = useState(0);

  useEffect(() => {
    if (phaseEndsAt === null) {
      return;
    }
    const id = setInterval(() => rerender((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  return phaseEndsAt === null ? 0 : Math.max(0, phaseEndsAt - serverNow());
}

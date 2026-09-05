"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

interface FitFontSizeOptions {
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export function useFitFontSize(
  ref: RefObject<HTMLElement | null>,
  text: string,
  { min, max, step, unit = "px" }: FitFontSizeOptions,
): number {
  const [fontSize, setFontSize] = useState(max);

  useLayoutEffect(() => {
    const maybeEl = ref.current;
    if (!maybeEl) {
      return;
    }
    const el = maybeEl;

    function fit() {
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        return;
      }
      let size = max;
      el.style.fontSize = `${size}${unit}`;
      while (
        size > min &&
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      ) {
        size = Math.max(min, size - step);
        el.style.fontSize = `${size}${unit}`;
      }
      setFontSize(size);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, min, max, step, unit]);

  return fontSize;
}

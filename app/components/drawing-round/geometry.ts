import type { PlayerId } from "@/shared/types";

// Geometry shared by the drawing round and the voting round

export const ROSTER = { left: 10.73, top: 12.96, width: 14.01, height: 72.04 };
export const BOARD = { left: 26.35, top: 13.33, width: 61.04, height: 72.5 };

export const HEIGHT_TO_WIDTH = 9 / 16;
export const CLOCK = { right: 22.4, top: 0.32, width: 4.6 };
export const CLOCK_FACE = {
  left: 14.27,
  top: 26.72,
  width: 72.79,
  height: 62.12,
};

export const TEAMMATE_CANVAS_WIDTH = 800;
export const TEAMMATE_CANVAS_HEIGHT = 600;

export const INK = "#3f3730";
export const SECRET_CARD_GAP = 8;

export interface RosterPlayer {
  id: PlayerId;
  nickname: string;
  colour: string;
}

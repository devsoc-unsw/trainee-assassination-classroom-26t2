// T02: Socket event names and signatures.

import type {
  PlayerId,
  Point,
  PublicGameState,
  PublicRoom,
  RoomCode,
} from "./types";

export const CLIENT_EVENTS = {
  CREATE_ROOM: "create_room",
  JOIN_ROOM: "join_room",
  STROKE_START: "stroke_start",
  STROKE_POINT: "stroke_point",
  STROKE_END: "stroke_end",
  CAST_VOTE: "cast_vote",
  SUBMIT_GUESS: "submit_guess",
  READY: "ready",
  START_GAME: "start_game",
  TIME_SYNC: "time_sync",
} as const;

export const SERVER_EVENTS = {
  CONNECTED: "connected",
  ROOM_UPDATED: "room_updated",
  STATE_UPDATED: "state_updated",
  ERROR: "error",
} as const;

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_IN_PROGRESS"
  | "ROOM_FULL"
  | "NICKNAME_TAKEN"
  | "INVALID_NICKNAME"
  | "NOT_YOUR_TURN"
  | "SELF_VOTE"
  | "INVALID_VOTE_TARGET"
  | "WRONG_PHASE"
  | "INVALID_PAYLOAD"
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  | "PLAYERS_NOT_READY";

export interface SocketError {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; data: T } | ({ ok: false } & SocketError);

export interface JoinPayload {
  playerId: PlayerId;
  nickname: string;
}

export interface ClientToServerEvents {
  create_room: (
    payload: JoinPayload,
    ack: (result: Result<{ code: RoomCode }>) => void,
  ) => void;
  join_room: (
    payload: JoinPayload & { code: RoomCode },
    ack: (result: Result<{ code: RoomCode }>) => void,
  ) => void;

  stroke_start: (payload: { point: Point }) => void;
  stroke_point: (payload: { points: Point[] }) => void;
  stroke_end: (payload: { points: Point[] }) => void;

  cast_vote: (payload: { targetId: PlayerId }) => void;
  submit_guess: (payload: { text: string }) => void;
  ready: (payload: { ready: boolean }) => void;
  start_game: (ack: (result: Result<void>) => void) => void;

  time_sync: (ack: (serverTime: number) => void) => void;
}

export interface ServerToClientEvents {
  connected: (payload: { socketId: string }) => void;
  room_updated: (room: PublicRoom) => void;
  state_updated: (state: PublicGameState) => void;
  error: (error: SocketError) => void;
}

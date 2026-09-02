import type { Result } from "@/shared/events";
import type { PlayerId, RoomCode } from "@/shared/types";

const NICKNAME_MAX_LENGTH = 16;
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

export interface Identity {
  playerId: PlayerId;
  nickname: string;
}

function sanitiseNickname(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, NICKNAME_MAX_LENGTH);
}

function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

export function parseIdentity(payload: unknown): Result<Identity> {
  const data = fields(payload);
  if (!data) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "Expected a payload object.",
    };
  }

  const { playerId, nickname } = data;
  if (typeof playerId !== "string" || playerId.length === 0) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "playerId must be a non-empty string.",
    };
  }
  if (typeof nickname !== "string") {
    return {
      ok: false,
      code: "INVALID_NICKNAME",
      message: "Nickname must be text.",
    };
  }

  const sanitised = sanitiseNickname(nickname);
  if (sanitised.length === 0) {
    return {
      ok: false,
      code: "INVALID_NICKNAME",
      message: `Nickname must be 1-${NICKNAME_MAX_LENGTH} characters.`,
    };
  }

  return { ok: true, data: { playerId, nickname: sanitised } };
}

export function parseRoomCode(payload: unknown): Result<RoomCode> {
  const data = fields(payload);
  const code = data?.code;
  if (typeof code !== "string" || code.trim().length === 0) {
    return {
      ok: false,
      code: "INVALID_PAYLOAD",
      message: "code must be a non-empty string.",
    };
  }
  return { ok: true, data: code };
}

export function safeAck<T>(ack: unknown): (result: Result<T>) => void {
  return typeof ack === "function"
    ? (ack as (result: Result<T>) => void)
    : () => {};
}

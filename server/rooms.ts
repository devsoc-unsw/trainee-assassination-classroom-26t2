import type { Room, RoomCode } from "@/shared/types";

const CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const rooms = new Map<RoomCode, Room>();

export function generateUniqueCode(): RoomCode {
  let code: RoomCode;
  do {
    code = Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length)),
    ).join("");
  } while (rooms.has(code));
  return code;
}

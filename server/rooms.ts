import type {
  GameState,
  Player,
  PlayerId,
  PublicRoom,
  Room,
  RoomCode,
} from "@/shared/types";

const PLAYER_COLOURS = [
  "#e6194b", // red
  "#3cb44b", // green
  "#4363d8", // blue
  "#f58231", // orange
  "#911eb4", // purple
  "#42d4f4", // cyan
  "#f032e6", // magenta
  "#9a6324", // brown
];

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

export function createInitialGameState(): GameState {
  return {
    phase: "LOBBY",
    roundNumber: 0,
    pass: 1,
    turnIndex: 0,
    turnOrder: [],
    word: "",
    category: "",
    imposterId: null,
    strokes: [],
    votes: [],
    accusedId: null,
    finalGuess: null,
    scores: { groupRoundsWon: 0, imposterRoundsWon: 0, perPlayer: {} },
    phaseEndsAt: null,
  };
}

export function toPublicRoom(room: Room): PublicRoom {
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players],
  };
}

export function createRoom(hostId: PlayerId, nickname: string): Room {
  const code = generateUniqueCode();
  const host: Player = {
    id: hostId,
    nickname,
    colour: PLAYER_COLOURS[0],
    connected: true,
  };
  const room: Room = {
    code,
    hostId,
    players: [host],
    state: createInitialGameState(),
  };
  rooms.set(code, room);
  return room;
}

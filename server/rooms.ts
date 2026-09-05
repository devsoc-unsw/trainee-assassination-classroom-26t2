import type { Result } from "@/shared/events";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameState,
  type Player,
  type PlayerId,
  type PublicRoom,
  type Room,
  type RoomCode,
} from "@/shared/types";
import { createWordDeck } from "./word-selection";

const PLAYER_COLOURS = [
  "#772322", // red (player-card-red.png)
  "#5e875b", // green (player-card-green.png)
  "#5b92b9", // blue (player-card-blue.png)
  "#df6c4c", // orange (player-card-orange.png)
  "#9a78b8", // purple (player-card-purple.png)
  "#55d299", // mint (player-card-mint.png)
  "#b16576", // pink (player-card-pink.png)
];

const HOST_COLOUR = "#9a6324";

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

function normaliseCode(code: RoomCode): RoomCode {
  return code.trim().toUpperCase();
}

function nextColour(players: Player[]): string {
  const taken = new Set(players.map((player) => player.colour));
  return (
    PLAYER_COLOURS.find((colour) => !taken.has(colour)) ?? PLAYER_COLOURS[0]
  );
}

export function createInitialGameState(): GameState {
  return {
    phase: "LOBBY",
    roundNumber: 0,
    pass: 1,
    turnIndex: 0,
    turnOrder: [],
    strokeSubmittedThisTurn: false,
    word: "",
    category: "",
    imposterId: null,
    strokes: [],
    votes: [],
    accusedId: null,
    finalGuess: null,
    roundWinner: null,
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
    colour: HOST_COLOUR,
    connected: true,
    ready: false,
    isSpectator: false,
  };
  const room: Room = {
    code,
    hostId,
    players: [host],
    state: createInitialGameState(),
    deck: createWordDeck(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: RoomCode): Room | null {
  return rooms.get(normaliseCode(code)) ?? null;
}

export function joinRoom(
  code: RoomCode,
  playerId: PlayerId,
  nickname: string,
): Result<Room> {
  const roomCode = normaliseCode(code);
  const room = rooms.get(roomCode);
  if (!room) {
    return {
      ok: false,
      code: "ROOM_NOT_FOUND",
      message: `No room found with code ${roomCode}.`,
    };
  }

  const clashesWithOther = (candidate: PlayerId | null) =>
    room.players.some(
      (player) =>
        player.id !== candidate &&
        player.nickname.toLowerCase() === nickname.toLowerCase(),
    );

  const existing = room.players.find((player) => player.id === playerId);
  if (existing) {
    if (existing.nickname !== nickname && clashesWithOther(playerId)) {
      return {
        ok: false,
        code: "NICKNAME_TAKEN",
        message: `Someone in that room is already called "${nickname}".`,
      };
    }
    existing.nickname = nickname;
    existing.connected = true;
    return { ok: true, data: room };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return {
      ok: false,
      code: "ROOM_FULL",
      message: `That room is full (${MAX_PLAYERS} players maximum).`,
    };
  }
  if (clashesWithOther(null)) {
    return {
      ok: false,
      code: "NICKNAME_TAKEN",
      message: `Someone in that room is already called "${nickname}".`,
    };
  }

  room.players.push({
    id: playerId,
    nickname,
    colour: nextColour(room.players),
    connected: true,
    ready: false,
    isSpectator: room.state.phase !== "LOBBY",
  });
  return { ok: true, data: room };
}

export function setReady(
  code: RoomCode,
  playerId: PlayerId,
  ready: boolean,
): Room | null {
  const roomCode = normaliseCode(code);
  const room = rooms.get(roomCode);
  if (!room) {
    return null;
  }
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return null;
  }
  player.ready = ready;
  return room;
}

export function canStartGame(
  code: RoomCode,
  requesterId: PlayerId,
): Result<void> {
  const roomCode = normaliseCode(code);
  const room = rooms.get(roomCode);
  if (!room) {
    return {
      ok: false,
      code: "ROOM_NOT_FOUND",
      message: `No room found with code ${roomCode}.`,
    };
  }
  if (room.hostId !== requesterId) {
    return {
      ok: false,
      code: "NOT_HOST",
      message: "Only the host can start the game.",
    };
  }
  if (room.players.length < MIN_PLAYERS) {
    return {
      ok: false,
      code: "NOT_ENOUGH_PLAYERS",
      message: `Need at least ${MIN_PLAYERS} players to start.`,
    };
  }
  if (room.players.some((player) => !player.connected || !player.ready)) {
    return {
      ok: false,
      code: "PLAYERS_NOT_READY",
      message: "Everyone must be connected and ready.",
    };
  }
  if (room.state.phase !== "LOBBY") {
    return {
      ok: false,
      code: "WRONG_PHASE",
      message: "That game has already started.",
    };
  }
  return { ok: true, data: undefined };
}

export function markDisconnected(
  code: RoomCode,
  playerId: PlayerId,
): Room | null {
  const roomCode = normaliseCode(code);
  const room = rooms.get(roomCode);
  if (!room) {
    return null;
  }
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    return null;
  }
  player.connected = false;
  return room;
}

export function leaveRoom(code: RoomCode, playerId: PlayerId): Room | null {
  const roomCode = normaliseCode(code);
  const room = rooms.get(roomCode);
  if (!room) {
    return null;
  }

  const index = room.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    return null;
  }
  room.players.splice(index, 1);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return null;
  }

  if (room.hostId === playerId) {
    const newHost = room.players[0];
    room.hostId = newHost.id;
    newHost.colour = HOST_COLOUR;
  }

  return room;
}

// everyone currently in the room becomes a real player for the round that's about to start.
export function promoteSpectators(room: Room): void {
  for (const player of room.players) {
    player.isSpectator = false;
  }
}

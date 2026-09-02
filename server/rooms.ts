import type { Result } from "@/shared/events";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameState,
  type Player,
  type PlayerId,
  type PlayerSecret,
  type PublicGameState,
  type PublicRoom,
  type Room,
  type RoomCode,
} from "@/shared/types";
import { createWordDeck, drawWord } from "./word-selection";

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

// The imposter branch must never carry `word`, and the group branch must never
// carry `isImposter`.
export function secretFor(room: Room, playerId: PlayerId): PlayerSecret {
  const { imposterId, category, word } = room.state;
  return imposterId === playerId
    ? { isImposter: true, category }
    : { category, word };
}

export function toPublicGameState(
  room: Room,
  playerId: PlayerId,
): PublicGameState {
  const state = room.state;
  return {
    phase: state.phase,
    roundNumber: state.roundNumber,
    pass: state.pass,
    turnIndex: state.turnIndex,
    turnOrder: [...state.turnOrder],
    strokes: [...state.strokes],
    accusedId: state.accusedId,
    phaseEndsAt: state.phaseEndsAt,
    scores: state.scores,
    voteCount: state.votes.length,
    secret: secretFor(room, playerId),
    // TODO(T-20): populate once ROUND_REVEAL scoring exists. Until then no
    // phase reveals the word.
    reveal: null,
  };
}

export function createRoom(hostId: PlayerId, nickname: string): Room {
  const code = generateUniqueCode();
  const host: Player = {
    id: hostId,
    nickname,
    colour: nextColour([]),
    connected: true,
    ready: false,
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
  if (room.state.phase !== "LOBBY") {
    return {
      ok: false,
      code: "ROOM_IN_PROGRESS",
      message: "That game has already started.",
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

// Draws this round's word from the room's own deck. Imposter and turn order
// are picked here too because a round cannot start without them; if a later
// ticket owns that choice, this is the seam to replace.
export function startRound(room: Room): void {
  const entry = drawWord(room.deck);
  const turnOrder = [...room.players.map((player) => player.id)];
  for (let i = turnOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
  }

  room.state = {
    ...createInitialGameState(),
    scores: room.state.scores,
    roundNumber: room.state.roundNumber + 1,
    phase: "ROUND_STARTING",
    turnOrder,
    word: entry.word,
    category: entry.category,
    imposterId: turnOrder[Math.floor(Math.random() * turnOrder.length)],
  };
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
    room.hostId = room.players[0].id;
  }

  return room;
}

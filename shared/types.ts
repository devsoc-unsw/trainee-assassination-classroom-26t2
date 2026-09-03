export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const MIN_PLAYERS = 2;//TODO: Reset back to 4
export const MAX_PLAYERS = 8;

export type PlayerId = string;
export type RoomCode = string;

export type Phase =
  | "LOBBY"
  | "ROUND_STARTING"
  | "DRAWING"
  | "VOTING"
  | "FINAL_GUESS"
  | "ROUND_REVEAL"
  | "SCORING"
  | "GAME_OVER";

export interface Player {
  id: PlayerId;
  nickname: string;
  colour: string;
  connected: boolean;
  ready: boolean;
}

export interface Point {
  // 0..CANVAS_WIDTH
  x: number;
  // 0..CANVAS_HEIGHT
  y: number;
}

export interface Stroke {
  id: string;
  playerId: PlayerId;
  colour: string;
  points: Point[];
}

export interface Vote {
  voterId: PlayerId;
  targetId: PlayerId;
}

export interface ImposterGuess {
  text: string;
  submittedAt: number;
}

export interface PlayerRecord {
  roundsAsImposter: number;
  roundsWonAsImposter: number;
}

export interface Scores {
  groupRoundsWon: number;
  imposterRoundsWon: number;
  perPlayer: Record<PlayerId, PlayerRecord>;
}

export interface GameState {
  phase: Phase;
  roundNumber: number;
  pass: 1 | 2;
  turnIndex: number;
  turnOrder: PlayerId[];
  word: string;
  category: string;
  imposterId: PlayerId | null;
  strokes: Stroke[];
  votes: Vote[];
  accusedId: PlayerId | null;
  finalGuess: ImposterGuess | null;
  scores: Scores;
  phaseEndsAt: number | null;
}

export type ImposterSecret = { isImposter: true; category: string };
export type GroupSecret = { category: string; word: string };
export type PlayerSecret = ImposterSecret | GroupSecret;

export interface RoundReveal {
  imposterId: PlayerId;
  word: string;
  votes: Vote[];
  finalGuess: ImposterGuess | null;
  winner: "GROUP" | "IMPOSTER";
}

export interface PublicGameState {
  phase: Phase;
  roundNumber: number;
  pass: 1 | 2;
  turnIndex: number;
  turnOrder: PlayerId[];
  strokes: Stroke[];
  accusedId: PlayerId | null;
  phaseEndsAt: number | null;
  scores: Scores;
  voteCount: number;
  secret: PlayerSecret;
  reveal: RoundReveal | null;
}

export interface PublicRoom {
  code: RoomCode;
  hostId: PlayerId;
  players: Player[];
}

// A room's private word draw order.
export interface WordDeck {
  seed: number;
  order: number[];
  cursor: number;
}

// Server-side only, holds the full GameState. Never emitted.
export interface Room {
  code: RoomCode;
  hostId: PlayerId;
  players: Player[];
  state: GameState;
  deck: WordDeck;
}

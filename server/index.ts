import { createServer } from "http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  Result,
  ServerToClientEvents,
} from "../shared/events";
import type { GameState, PlayerId, Room, RoomCode } from "../shared/types";
import {
  canStartGame,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  setReady,
  toPublicRoom,
} from "./rooms";
import {
  beginDrawing,
  endDrawing,
  endRoundReveal,
  serialiseStateFor,
  startRound,
  toRoundRevealFromFinalGuess,
  toRoundRevealFromVoting,
} from "./state";
import { armPhaseTimer, clearRoomTimer } from "./timers";
import { parseIdentity, parseRoomCode, safeAck } from "./validate";

interface SocketData {
  playerId?: PlayerId;
  roomCode?: RoomCode;
}

const port = parseInt(process.env.SOCKET_PORT || "3001", 10);

const httpServer = createServer();

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>(httpServer, {
  cors: {
    origin: "http://localhost:3000",
  },
});

type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

// A refreshing browser disconnects and reconnects within moments. Removing
// the player immediately would delete the room out from under a solo host
// before the reconnect lands, so give them a window to come back first.
const RECONNECT_GRACE_MS = 10_000;
const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();

function pendingKey(roomCode: RoomCode, playerId: PlayerId) {
  return `${roomCode}:${playerId}`;
}

function cancelPendingRemoval(roomCode: RoomCode, playerId: PlayerId) {
  const key = pendingKey(roomCode, playerId);
  const timer = pendingRemovals.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(key);
  }
}

function scheduleRemoval(roomCode: RoomCode, playerId: PlayerId) {
  const key = pendingKey(roomCode, playerId);
  pendingRemovals.set(
    key,
    setTimeout(() => {
      pendingRemovals.delete(key);
      const room = leaveRoom(roomCode, playerId);
      if (room) {
        io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
      } else if (!getRoom(roomCode)) {
        // Room emptied out while the player was gone. Clear its phase timer.
        clearRoomTimer(roomCode);
      }
    }, RECONNECT_GRACE_MS),
  );
}

// A socket may only ever be in one room. Anything that puts it in a new one
// must call this first, or the old room keeps a member that never leaves.
function departPreviousRoom(socket: GameSocket, keepCode?: RoomCode) {
  const { playerId, roomCode } = socket.data;
  if (!playerId || !roomCode || roomCode === keepCode) {
    return;
  }

  cancelPendingRemoval(roomCode, playerId);
  const room = leaveRoom(roomCode, playerId);
  socket.leave(roomCode);
  socket.data.playerId = undefined;
  socket.data.roomCode = undefined;

  if (room) {
    io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  } else if (!getRoom(roomCode)) {
    // Last player left: the room is gone. Kill its phase timer so nothing
    // fires into a dead room.
    clearRoomTimer(roomCode);
  }
}

function broadcastState(roomCode: RoomCode, room: Room) {
  const socketIds = io.sockets.adapter.rooms.get(roomCode);
  if (!socketIds) {
    return;
  }
  for (const socketId of socketIds) {
    const memberSocket = io.sockets.sockets.get(socketId);
    const playerId = memberSocket?.data.playerId;
    if (memberSocket && playerId) {
      memberSocket.emit(
        SERVER_EVENTS.STATE_UPDATED,
        serialiseStateFor(playerId, room),
      );
    }
  }
}

// T09: move the room into `next` and (re)arm its phase timer. Any timer already
// running for the room is cleared first, so an immediate transition never
// leaves an orphaned timeout behind. `phaseEndsAt` is the absolute deadline the
// client counts down to; it is null for phases with no timer. Broadcasts the
// new state.
function enterPhase(room: Room, next: GameState) {
  const endsAt = armPhaseTimer(room.code, next.phase, () =>
    onPhaseExpired(room.code),
  );
  room.state = { ...next, phaseEndsAt: endsAt };
  broadcastState(room.code, room);
}

// T09: the phase timer elapsed with no early exit. Drive the state machine
// forward along the natural "time's up" edge for the current phase. Early exits
// (stroke completes, everyone voted, imposter submits, all ready) are owned by
// T08/T12/T18/T29 and call enterPhase directly, which cancels this timer.
function onPhaseExpired(roomCode: RoomCode) {
  const room = getRoom(roomCode);
  if (!room) {
    // Room was deleted between the timer firing and this callback. Nothing to
    // do - clearRoomTimer already ran on deletion.
    return;
  }

  const { phase } = room.state;
  let next: Result<GameState>;
  switch (phase) {
    case "DRAWING":
      // T08 will replace this with per-turn advancement: advance turnIndex,
      // bump `pass` on wrap, and only move to VOTING after the second pass.
      // Until T08 lands, a single 20s timer ends the drawing phase.
      next = endDrawing(room.state);
      break;
    case "VOTING":
      // T18 owns the tally. With no votes recorded yet, a timeout means no
      // accusation, which counts as the imposter surviving.
      next = toRoundRevealFromVoting(room.state, null);
      break;
    case "FINAL_GUESS":
      // No submission: finalGuess stays null, which resolves as a wrong guess.
      next = toRoundRevealFromFinalGuess(room.state);
      break;
    case "ROUND_REVEAL":
      next = endRoundReveal(room.state);
      break;
    default:
      // No other phase arms a timer.
      return;
  }

  if (!next.ok) {
    console.warn(
      `[room ${roomCode}] phase timeout from ${phase} rejected: ${next.message}`,
    );
    return;
  }
  enterPhase(room, next.data);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.emit(SERVER_EVENTS.CONNECTED, { socketId: socket.id });

  socket.on(CLIENT_EVENTS.CREATE_ROOM, (payload, rawAck) => {
    const ack = safeAck<{ code: RoomCode }>(rawAck);

    const identity = parseIdentity(payload);
    if (!identity.ok) {
      ack(identity);
      return;
    }
    const { playerId, nickname } = identity.data;

    const room = createRoom(playerId, nickname);
    departPreviousRoom(socket);

    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    cancelPendingRemoval(room.code, playerId);

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  });
  socket.on(CLIENT_EVENTS.JOIN_ROOM, (payload, rawAck) => {
    const ack = safeAck<{ code: RoomCode }>(rawAck);

    const identity = parseIdentity(payload);
    if (!identity.ok) {
      ack(identity);
      return;
    }
    const requestedCode = parseRoomCode(payload);
    if (!requestedCode.ok) {
      ack(requestedCode);
      return;
    }
    const { playerId, nickname } = identity.data;

    const result = joinRoom(requestedCode.data, playerId, nickname);
    if (!result.ok) {
      ack(result);
      return;
    }

    const room = result.data;
    departPreviousRoom(socket, room.code);

    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);
    cancelPendingRemoval(room.code, playerId);

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  });

  socket.on(CLIENT_EVENTS.READY, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const ready = typeof payload?.ready === "boolean" ? payload.ready : false;
    const room = setReady(roomCode, playerId, ready);

    if (room) {
      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
    }
  });

  socket.on(CLIENT_EVENTS.START_GAME, (rawAck) => {
    const ack = safeAck<void>(rawAck);
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    const result = canStartGame(roomCode, playerId);
    if (!result.ok) {
      ack(result);
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    // Pick imposter and turn order randomly.
    const turnOrder = shuffled(room.players.map((player) => player.id));
    const imposterId = turnOrder[0];

    const started = startRound(room.state, {
      roundNumber: room.state.roundNumber + 1,
      turnOrder,
      imposterId,
      word: "placeholder",
      category: "a placeholder",
    });
    if (!started.ok) {
      console.warn(
        `[room ${roomCode}] start_game rejected: ${started.message}`,
      );
      ack({ ok: false, code: started.code, message: started.message });
      return;
    }

    const drawing = beginDrawing(started.data);
    if (!drawing.ok) {
      console.warn(
        `[room ${roomCode}] begin_drawing rejected after start_round: ${drawing.message}`,
      );
      ack({ ok: false, code: drawing.code, message: drawing.message });
      return;
    }

    ack({ ok: true, data: undefined });
    // enterPhase arms the DRAWING timer and broadcasts the state.
    enterPhase(room, drawing.data);
  });

  socket.on(CLIENT_EVENTS.TIME_SYNC, (ack) => {
    if (typeof ack === "function") {
      ack(Date.now());
    }
  });

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = markDisconnected(roomCode, playerId);
    if (room) {
      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
    }
    scheduleRemoval(roomCode, playerId);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

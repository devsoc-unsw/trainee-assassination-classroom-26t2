import { createServer } from "http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/events";
import type { PlayerId, Room, RoomCode } from "../shared/types";
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
import { beginDrawing, serialiseStateFor, startRound, advanceTurn, removePlayerFromTurnOrder } from "./state";
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
const TURN_DURATION_MS = 30_000; // 30 seconds per turn — change if you want a different length
const turnTimers = new Map<RoomCode, ReturnType<typeof setTimeout>>();

function clearTurnTimer(roomCode: RoomCode) {
  const timer = turnTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(roomCode);
  }
}

function armTurnTimer(roomCode: RoomCode, room: Room) {
  clearTurnTimer(roomCode);
  if (room.state.phase !== "DRAWING") {
    return;
  }

  room.state = { ...room.state, phaseEndsAt: Date.now() + TURN_DURATION_MS };

  const timer = setTimeout(() => {
    turnTimers.delete(roomCode);
    const current = getRoom(roomCode);
    if (!current || current.state.phase !== "DRAWING") {
      return;
    }
    const advanced = advanceTurn(current.state);
    if (!advanced.ok) {
      return;
    }
    current.state = advanced.data;
    broadcastState(roomCode, current);
    armTurnTimer(roomCode, current);
  }, TURN_DURATION_MS);

  turnTimers.set(roomCode, timer);
}

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
      if (!room) {
        return;
      }

      const { state, wasCurrent } = removePlayerFromTurnOrder(room.state, playerId);
      room.state = state;

      if (wasCurrent && room.state.phase === "DRAWING") {
        const advanced = advanceTurn(room.state);
        if (advanced.ok) {
          room.state = advanced.data;
        }
      }

      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
      broadcastState(roomCode, room);
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
    room.state = drawing.data;

    ack({ ok: true, data: undefined });
    broadcastState(roomCode, room);
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

      if (
        room.state.phase === "DRAWING" &&
        room.state.turnOrder[room.state.turnIndex] === playerId
      ) {
        const advanced = advanceTurn(room.state);
        if (advanced.ok) {
          room.state = advanced.data;
          broadcastState(roomCode, room);
        }
      }
    }
    scheduleRemoval(roomCode, playerId);
  });

  socket.on(CLIENT_EVENTS.STROKE_END, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    if (
      room.state.phase !== "DRAWING" ||
      room.state.turnOrder[room.state.turnIndex] !== playerId
    ) {
      return;
    }

    const advanced = advanceTurn(room.state);
    if (!advanced.ok) {
      return;
    }
    room.state = advanced.data;
    broadcastState(roomCode, room);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

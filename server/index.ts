import { createServer } from "http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/events";
import type { PlayerId, Room, RoomCode } from "../shared/types";
import { createPhaseLoop } from "./phase-loop";
import {
  canStartGame,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  promoteSpectators,
  setReady,
  toPublicRoom,
} from "./rooms";
import {
  advanceTurn,
  beginDrawing,
  dropFromTurnOrder,
  isCurrentDrawer,
  pickImposter,
  serialiseStateFor,
  startRound,
} from "./state";
import { clearRoomTimer } from "./timers";
import { parseIdentity, parseRoomCode, safeAck } from "./validate";
import { drawWord } from "./word-selection";

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
    origin: process.env.CLIENT_URL || "http://localhost:3000",
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
      if (!room) {
        if (!getRoom(roomCode)) {
          // Room emptied out while the player was gone. Clear its phase timer.
          clearRoomTimer(roomCode);
        }
        return;
      }

      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));

      // Their turn can have come round again while they were gone, so hand it
      // on before taking them out of the rotation.
      let next = room.state;
      const wasDrawing = isCurrentDrawer(next, playerId);
      if (wasDrawing) {
        const advanced = advanceTurn(next);
        if (advanced.ok) {
          next = advanced.data;
        }
      }
      next = dropFromTurnOrder(next, playerId);

      if (wasDrawing) {
        enterPhase(room, next);
      } else if (next !== room.state) {
        // Only the rotation changed. Broadcast it, but leave the running timer
        // alone or the current player would get a second full turn.
        room.state = next;
        broadcastState(roomCode, room);
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

// T09: the phase loop drives timed transitions. See server/phase-loop.ts.
const { enterPhase } = createPhaseLoop({
  getRoom,
  broadcast: (room) => broadcastState(room.code, room),
});

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
    promoteSpectators(room);
    const turnOrder = shuffled(room.players.map((player) => player.id));
    const imposterId = pickImposter(turnOrder, room.state.imposterId);
    const entry = drawWord(room.deck);

    const started = startRound(room.state, {
      roundNumber: room.state.roundNumber + 1,
      turnOrder,
      imposterId,
      word: entry.word,
      category: entry.category,
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

  socket.on(CLIENT_EVENTS.STROKE_END, () => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    if (!isCurrentDrawer(room.state, playerId)) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "It is not your turn to draw.",
      });
      return;
    }

    // Finishing a stroke ends the turn early. The stroke itself is not kept
    // yet - that belongs to the stroke relay, which will record the payload
    // here before handing the turn on.
    const advanced = advanceTurn(room.state);
    if (!advanced.ok) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: advanced.code,
        message: advanced.message,
      });
      return;
    }
    // enterPhase arms the next turn's timer and broadcasts.
    enterPhase(room, advanced.data);
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

      // Someone who is gone cannot draw, so hand the turn on now. The
      // reconnect grace protects their seat in the room, not their turn.
      if (isCurrentDrawer(room.state, playerId)) {
        const advanced = advanceTurn(room.state);
        if (advanced.ok) {
          enterPhase(room, advanced.data);
        }
      }
    }
    scheduleRemoval(roomCode, playerId);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

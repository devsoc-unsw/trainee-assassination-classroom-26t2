import { createServer } from "http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  Result,
  ServerToClientEvents,
} from "../shared/events";
import type { PlayerId, PublicRoom, Room, RoomCode, Stroke } from "../shared/types";
import { createPhaseLoop } from "./phase-loop";
import {
  canRestartGame,
  canStartGame,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  leaveRoomVoluntarily,
  markDisconnected,
  restartGame,
  promoteSpectators,
  setAvatarDrawing,
  setReady,
  toPublicRoom,
} from "./rooms";
import {
  advanceTurn,
  allConnectedReadyForReveal,
  allConnectedVoted,
  beginDrawing,
  castVote,
  dropFromTurnOrder,
  isCurrentDrawer,
  markRevealReady,
  pickImposter,
  serialiseStateFor,
  settleVoting,
  startRound,
  submitGuess,
  toRoundRevealFromFinalGuess,
} from "./state";
import { clearRoomTimer } from "./timers";
import {
  parseAvatarDrawing,
  parseIdentity,
  parseRoomCode,
  safeAck,
} from "./validate";
import { drawWord } from "./word-selection";
import { randomUUID } from "crypto";
import { AppSocket } from "@/app/socket-provider";

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

const RECONNECT_GRACE_MS = parseInt(
  process.env.RECONNECT_GRACE_MS || "10000",
  10,
);
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
      const room = leaveRoom(roomCode, playerId, (message) => {
        io.to(roomCode).emit(SERVER_EVENTS.INFO, message);
      });
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
      } else {
        // Push the current state to whoever is left. Only the rotation changed
        // here, or leaveRoom reset the whole game (imposter left / dropped
        // below four) — either way the clients need it. Don't re-arm the phase
        // timer (no enterPhase) or the current drawer gets a second full turn.
        if (next !== room.state) {
          room.state = next;
        }
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
  const room = leaveRoom(roomCode, playerId, (message) => {
    io.to(roomCode).emit(SERVER_EVENTS.INFO, message);
  });
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
// T19: startNextRound goes to the next round after SCORING
const { enterPhase, settleRoundReveal } = createPhaseLoop({
  getRoom,
  broadcast: (room) => broadcastState(room.code, room),
  startNextRound: (room) => {
    const res = beginRound(room);
    if (!res.ok) {
      console.warn(`[room ${room.code}] next round rejected: ${res.message}`);
    }
  },
});

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Shuffle turn order, pick the imposter, draw a word, and enter DRAWING.
// Shared by the host's start_game and the phase loop's post-SCORING next round.
// Disconnected players are left out of the rotation (T08).
function beginRound(room: Room): Result<void> {
  promoteSpectators(room);
  const turnOrder = shuffled(
    room.players
      .filter((player) => player.connected)
      .map((player) => player.id),
  );
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
    return started;
  }

  const drawing = beginDrawing(started.data);
  if (!drawing.ok) {
    return drawing;
  }

  // enterPhase arms the DRAWING timer and broadcasts the state.
  enterPhase(room, drawing.data);
  return { ok: true, data: undefined };
}

// Canvas coordinates are normalised 0..1 on both axes (T11). Reject any point
// outside that box, or one that isn't a finite number.
// TODO (T23): move this + a zod pass + rate limiting into shared validation.
function pointInBounds(point: { x: number; y: number }): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

function endTurn(room: Room, socket: Socket) {
  // Finishing a stroke ends the turn early.
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
    socket.emit(SERVER_EVENTS.STATE_UPDATED, serialiseStateFor(playerId, room));
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

  socket.on(CLIENT_EVENTS.SAVE_AVATAR_DRAWING, (payload, rawAck) => {
    const ack = safeAck<void>(rawAck);
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    const parsed = parseAvatarDrawing(payload);
    if (!parsed.ok) {
      ack(parsed);
      return;
    }

    const room = setAvatarDrawing(roomCode, playerId, parsed.data);
    if (!room) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    ack({ ok: true, data: undefined });
    io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
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

    const started = beginRound(room);
    if (!started.ok) {
      console.warn(
        `[room ${roomCode}] start_game rejected: ${started.message}`,
      );
      ack({ ok: false, code: started.code, message: started.message });
      return;
    }
    ack({ ok: true, data: undefined });
  });

  socket.on(CLIENT_EVENTS.STROKE_END, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ROOM_NOT_FOUND",
        message: "Could not locate room.",
      });
      return;
    }

    if (!isCurrentDrawer(room.state, playerId)) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "It is not your turn to draw.",
      });
      return;
    }

    const stroke = room.state.strokes.at(-1);

    if (stroke?.playerId !== playerId) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "It is not your turn to draw.",
      });
      return;
    }

    for (const point of payload.points) {
      if (!pointInBounds(point)) {
        socket.emit(SERVER_EVENTS.ERROR, {
          code: "INVALID_PAYLOAD",
          message: "Stroke point is outside the canvas.",
        });
        endTurn(room, socket);
        return;
      }
    }

    stroke.points = stroke.points.concat(payload.points);

    endTurn(room, socket);
  });

  socket.on(CLIENT_EVENTS.CAST_VOTE, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }
    const targetId = payload?.targetId;
    if (typeof targetId !== "string" || targetId.length === 0) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: "cast_vote needs a targetId.",
      });
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    const connectedIds = room.players
      .filter((player) => player.connected)
      .map((player) => player.id);

    const voted = castVote(room.state, playerId, targetId, connectedIds);
    if (!voted.ok) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: voted.code,
        message: voted.message,
      });
      return;
    }

    room.state = voted.data;
    broadcastState(roomCode, room);

    if (allConnectedVoted(room.state.votes, connectedIds)) {
      const settled = settleVoting(room.state);
      if (settled.ok) {
        enterPhase(room, settled.data);
      } else {
        console.warn(
          `[room ${roomCode}] settleVoting rejected on early exit: ${settled.message}`,
        );
      }
    }
  });

  socket.on(CLIENT_EVENTS.SUBMIT_GUESS, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }
    const text = payload?.text;
    if (typeof text !== "string" || text.length == 0) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: "submit_guess needs text.",
      });
      return;
    }

    if (text.length > 64) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: "Guess is too long",
      });
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    const guessed = submitGuess(room.state, playerId, text);
    if (!guessed.ok) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: guessed.code,
        message: guessed.message,
      });
      return;
    }

    const revealed = toRoundRevealFromFinalGuess(guessed.data);
    if (!revealed.ok) {
      console.warn(
        `[room ${roomCode}] toRoundRevealFromFinalGuess rejected after submit_guess: ${revealed.message}`,
      );
      return;
    }
    enterPhase(room, revealed.data);
  });

  socket.on(CLIENT_EVENTS.REVEAL_READY, () => {
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      return;
    }

    const marked = markRevealReady(room.state, playerId);
    if (!marked.ok) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: marked.code,
        message: marked.message,
      });
      return;
    }

    room.state = marked.data;
    broadcastState(roomCode, room);

    const connectedIds = room.players
      .filter((player) => player.connected)
      .map((player) => player.id);

    if (allConnectedReadyForReveal(room.state.revealReadyIds, connectedIds)) {
      settleRoundReveal(room);
    }
  });

  socket.on(CLIENT_EVENTS.TIME_SYNC, (ack) => {
    if (typeof ack === "function") {
      ack(Date.now());
    }
  });

  socket.on(CLIENT_EVENTS.STROKE_START, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (roomCode == null) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ROOM_NOT_FOUND",
        message: "Not in a room.",
      });
      return;
    }
    const room = getRoom(roomCode);

    const colour = room?.players.find((x) => x.id == playerId)?.colour;

    if (playerId == null || colour == null || room == null) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ROOM_NOT_FOUND",
        message: "Not in a room.",
      });
      return;
    }

    if (
      room?.state.turnOrder[room?.state.turnIndex] != playerId ||
      room?.state.phase !== "DRAWING"
    ) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "Not your turn.",
      });
      return;
    }

    if (room.state.strokeSubmittedThisTurn) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "This turn already has a stroke.",
      });
      return;
    }

    if (!pointInBounds(payload.point)) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: "Stroke point is outside the canvas.",
      });
      return;
    }

    const stroke: Stroke = {
      id: randomUUID(),
      playerId: playerId,
      colour: colour,
      points: [payload.point],
    };
    room.state.strokes.push(stroke);
    room.state.strokeSubmittedThisTurn = true;
    broadcastState(roomCode, room);
  });

  socket.on(CLIENT_EVENTS.STROKE_POINT, (payload) => {
    const { playerId, roomCode } = socket.data;
    if (roomCode == null) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ROOM_NOT_FOUND",
        message: "Not in a room.",
      });
      return;
    }
    const room = getRoom(roomCode);

    const colour = room?.players.find((x) => x.id == playerId)?.colour;

    if (playerId == null || colour == null || room == null) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "ROOM_NOT_FOUND",
        message: "Not in a room.",
      });
      return;
    }

    if (
      room?.state.turnOrder[room?.state.turnIndex] != playerId ||
      room?.state.phase !== "DRAWING"
    ) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "NOT_YOUR_TURN",
        message: "Not your turn.",
      });
      return;
    }

    const stroke = room.state.strokes.at(-1);

    if (stroke?.playerId !== playerId) {
      return;
    }

    for (const point of payload.points) {
      if (!pointInBounds(point)) {
        socket.emit(SERVER_EVENTS.ERROR, {
          code: "INVALID_PAYLOAD",
          message: "Stroke point is outside the canvas.",
        });
        endTurn(room, socket);
        return;
      }
    }
    stroke.points = stroke.points.concat(payload.points);

    broadcastState(roomCode, room);
  });

  socket.on(CLIENT_EVENTS.LEAVE_ROOM, (rawAck) => {
    const ack = safeAck<void>(rawAck);
    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    let room = getRoom(roomCode);
    if (!room) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    socket.data.roomCode = undefined;
    socket.data.playerId = undefined;
    socket.leave(roomCode);

    cancelPendingRemoval(roomCode, playerId);
    leaveRoomVoluntarily(roomCode, playerId, (message) => {
      io.to(roomCode).emit(SERVER_EVENTS.INFO, message);
    });
    room = getRoom(roomCode);

    socket.emit(SERVER_EVENTS.ROOM_UPDATED, null);
    socket.emit(SERVER_EVENTS.STATE_UPDATED, null);
    ack({ ok: true, data: undefined });

    if (room) {
      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));

      // Repair the round around the gap they left, same as the disconnect path:
      // hand on their turn if it was theirs, then drop them from the rotation.
      // (No-op when leaveRoomVoluntarily already reset the game to LOBBY.)
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
      } else {
        if (next !== room.state) {
          room.state = next;
        }
        broadcastState(roomCode, room);
      }
    }
  });

  socket.on(CLIENT_EVENTS.REPLAY, (rawAck) => {
    const ack = safeAck<{ code: RoomCode }>(rawAck);

    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    const result = canRestartGame(roomCode, playerId);
    if (!result.ok) {
      ack(result);
      return;
    }

    const room = getRoom(roomCode);
    if (!room) {
      ack({ ok: false, code: "ROOM_NOT_FOUND", message: "Not in a room." });
      return;
    }

    const restartedGame = restartGame(
      room,
      (message) => {
        io.to(room.code).emit(SERVER_EVENTS.INFO, message);
      },
      "Game restarted by host.",
    );

    cancelPendingRemoval(room.code, playerId);

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(
      SERVER_EVENTS.ROOM_UPDATED,
      toPublicRoom(restartedGame),
    );
    io.to(room.code).emit(SERVER_EVENTS.STATE_UPDATED, null);
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


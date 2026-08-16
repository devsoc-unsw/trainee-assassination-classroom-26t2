import { createServer } from "http";
import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/events";
import type { PlayerId, RoomCode } from "../shared/types";
import { createRoom, joinRoom, leaveRoom, toPublicRoom } from "./rooms";
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

// A socket may only ever be in one room. Anything that puts it in a new one
// must call this first, or the old room keeps a member that never leaves.
function departPreviousRoom(socket: GameSocket, keepCode?: RoomCode) {
  const { playerId, roomCode } = socket.data;
  if (!playerId || !roomCode || roomCode === keepCode) {
    return;
  }

  const room = leaveRoom(roomCode, playerId);
  socket.leave(roomCode);
  socket.data.playerId = undefined;
  socket.data.roomCode = undefined;

  if (room) {
    io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  }
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

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  });

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
    departPreviousRoom(socket);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

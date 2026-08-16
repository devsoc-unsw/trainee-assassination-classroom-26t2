import { createServer } from "http";
import { Server, type DefaultEventsMap } from "socket.io";
import { CLIENT_EVENTS, SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/events";
import type { PlayerId, RoomCode } from "../shared/types";
import { createRoom, joinRoom, leaveRoom, toPublicRoom } from "./rooms";

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

// "connection" and "disconnect" are Socket.io's own lifecycle events, so they
// are exempt from the no-raw-event-literals rule (T02).
io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.emit(SERVER_EVENTS.CONNECTED, { socketId: socket.id });

  socket.on(CLIENT_EVENTS.CREATE_ROOM, (payload, ack) => {
    const room = createRoom(payload.playerId, payload.nickname);

    socket.data.playerId = payload.playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  });
  socket.on(CLIENT_EVENTS.JOIN_ROOM, (payload, ack) => {
    const result = joinRoom(payload.code, payload.playerId, payload.nickname);
    if (!result.ok) {
      ack(result);
      return;
    }

    const room = result.data;

    socket.data.playerId = payload.playerId;
    socket.data.roomCode = room.code;
    socket.join(room.code);

    ack({ ok: true, data: { code: room.code } });
    io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
  });

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);

    const { playerId, roomCode } = socket.data;
    if (!playerId || !roomCode) {
      return;
    }

    const room = leaveRoom(roomCode, playerId);
    if (room) {
      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATED, toPublicRoom(room));
    }
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

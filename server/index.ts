import { createServer } from "http";
import { Server } from "socket.io";
import { SERVER_EVENTS } from "../shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/events";

const port = parseInt(process.env.SOCKET_PORT || "3001", 10);

const httpServer = createServer();

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "http://localhost:3000",
  },
});

// "connection" and "disconnect" are Socket.io's own lifecycle events, so they
// are exempt from the no-raw-event-literals rule (T02).
io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.emit(SERVER_EVENTS.CONNECTED, { socketId: socket.id });

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

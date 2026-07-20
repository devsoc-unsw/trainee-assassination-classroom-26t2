import { createServer } from "http";
import { Server } from "socket.io";

const port = parseInt(process.env.SOCKET_PORT || "3001", 10);

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
  },
});

io.on("connection", (socket) => {
  console.log(`client connected: ${socket.id}`);

  socket.emit("connected", { socketId: socket.id });

  socket.on("disconnect", () => {
    console.log(`client disconnected: ${socket.id}`);
  });
});

httpServer.listen(port, () => {
  console.log(`> Socket.io server listening on http://localhost:${port}`);
});

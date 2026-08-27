"use client";

import { createContext, useContext } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_EVENTS } from "@/shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/shared/events";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

let socket: AppSocket | undefined;

function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SOCKET_URL);

    socket.on(SERVER_EVENTS.CONNECTED, ({ socketId }) => {
      console.log("connected to socket server, id:", socketId);
    });
    socket.on("disconnect", () => {
      console.log("disconnected from socket server");
    });
  }
  return socket;
}

const SocketContext = createContext<AppSocket | undefined>(undefined);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socket = getSocket();

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket(): AppSocket {
  const socket = useContext(SocketContext);

  if (!socket) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return socket;
}

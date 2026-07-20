"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { SERVER_EVENTS } from "@/shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/shared/events";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export default function SocketListener() {
  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> =
      io(SOCKET_URL);

    socket.on(SERVER_EVENTS.CONNECTED, ({ socketId }) => {
      console.log("connected to socket server, id:", socketId);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export default function SocketListener() {
  useEffect(() => {
    const socket = io(SOCKET_URL);

    socket.on("connected", ({ socketId }: { socketId: string }) => {
      console.log("connected to socket server, id:", socketId);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return null;
}

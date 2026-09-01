"use client";

import { createContext, useContext } from "react";
import { io, type Socket } from "socket.io-client";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/shared/events";
import { bestSample, estimateOffset, setClockOffset } from "./lib/clock";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

let socket: AppSocket | undefined;

// Measures client's clock offset from the server. Fires on every
// (re)connection, so the countdown stays accurate after a reconnect too.
const CLOCK_SYNC_SAMPLES = 5;

function syncClock(sock: AppSocket) {
  const samples: { rtt: number; offset: number }[] = [];

  const takeSample = () => {
    const sentAt = Date.now();
    sock.emit(CLIENT_EVENTS.TIME_SYNC, (serverTime) => {
      const receivedAt = Date.now();
      samples.push({
        rtt: receivedAt - sentAt,
        offset: estimateOffset(sentAt, serverTime, receivedAt),
      });

      if (samples.length < CLOCK_SYNC_SAMPLES) {
        takeSample();
        return;
      }

      const best = bestSample(samples);
      if (best) {
        setClockOffset(best.offset);
        console.log(
          `clock synced: offset ${Math.round(best.offset)}ms (rtt ${Math.round(
            best.rtt,
          )}ms)`,
        );
      }
    });
  };

  takeSample();
}

function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SOCKET_URL);

    socket.on(SERVER_EVENTS.CONNECTED, ({ socketId }) => {
      console.log("connected to socket server, id:", socketId);
    });
    socket.on("connect", () => {
      if (socket) {
        syncClock(socket);
      }
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

"use client";

import { AppSocket } from "@/app/socket-provider";
import { PlayerId, PublicRoom, Point, Stroke } from "@/shared/types";
import { useEffect, useRef } from "react";

const STROKE_WIDTH = 2;
const UPDATES_PER_SEC = 60;//TODO: Make this 60 at some point

let ctx: null | CanvasRenderingContext2D = null;

interface CanvasProps {
  room: PublicRoom;
  playerId: PlayerId;
  socket: AppSocket;
  myTurn: boolean;
  strokes: Stroke[] | undefined;
}

let num_strokes: number = 0;
let num_points: number = 0;
let mid_stroke: boolean = false;
let queued_strokes: Point[] = [];
let time_since_last_sent:number = 0;

console.log("NUM STROKES:" + num_strokes);


function line_to_point(
  component: HTMLCanvasElement,
  point: Point,
  colour: string,
) {
  if (ctx == null) {
    ctx = component.getContext("2d");
    if (ctx == null) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = colour;
    ctx.lineWidth = STROKE_WIDTH;

    ctx.beginPath();
    ctx.moveTo(point.x * component.width, point.y * component.height);
  } else {
    ctx.strokeStyle = colour;
    ctx.lineTo(point.x * component.width, point.y * component.height);
  }
}

function display_stroke(component: HTMLCanvasElement, stroke: Stroke) {
  while (stroke.points.length > num_points) {
    line_to_point(component, stroke.points[num_points], stroke.colour);
    num_points += 1;
  }
}

export function updateCanvas(component: HTMLCanvasElement, strokes: Stroke[]) {
  while (strokes.length > num_strokes) {
    const new_stroke = strokes.at(num_strokes);
    if (new_stroke !== undefined) {
      num_points = 0;
      ctx = null;
      display_stroke(component, new_stroke);
    }

    num_strokes += 1;
  }

  const final_stroke = strokes.at(-1);

  if (final_stroke !== undefined) {
    display_stroke(component, final_stroke);
  }

  ctx?.stroke();
}

export function resetCanvas(component: HTMLCanvasElement) {
  num_strokes = 0;
  num_points = 0;
  ctx = component.getContext("2d");
  ctx?.reset();
  ctx = null;
}

function startDraw(
  component: HTMLCanvasElement,
  xpos: number,
  ypos: number,
  room: PublicRoom,
  playerId: PlayerId,
  socket: AppSocket,
) {
  const player = room.players.find((x) => x.id == playerId);

  if (player == null) {
    return;
  }

  num_points = 0;
  num_strokes += 1;
  ctx = null;

  const rect = component.getBoundingClientRect();
  const fracx = (xpos - rect.left) / (rect.right - rect.left);
  const fracy = (ypos - rect.top) / (rect.bottom - rect.top);

  const point: Point = { x: fracx, y: fracy };
  line_to_point(component, point, player.colour);

  mid_stroke = true;

    socket.emit("stroke_start", { point: point });
    time_since_last_sent = Date.now();
}

function continueDraw(
  component: HTMLCanvasElement,
  xpos: number,
  ypos: number,
  room: PublicRoom,
  playerId: PlayerId,
  socket: AppSocket,
) {
  const player = room.players.find((x) => x.id == playerId);

  if (player == null) {
    return;
  }

  const rect = component.getBoundingClientRect();
  const fracx = (xpos - rect.left) / (rect.right - rect.left);
  const fracy = (ypos - rect.top) / (rect.bottom - rect.top);

    const point: Point = { x: fracx, y: fracy };
    line_to_point(component, point, player.colour);

    if (Date.now() - time_since_last_sent < 1000/UPDATES_PER_SEC) {
        queued_strokes.push(point);
    } else {
        socket.emit("stroke_point", { points: queued_strokes.concat([point]) });
        queued_strokes = [];
        time_since_last_sent = Date.now();
    }
}

function finishDraw(
  component: HTMLCanvasElement,
  xpos: number,
  ypos: number,
  room: PublicRoom,
  playerId: PlayerId,
  socket: AppSocket,
) {
  const player = room.players.find((x) => x.id == playerId);

  if (player == null) {
    return;
  }

  const rect = component.getBoundingClientRect();
  const fracx = (xpos - rect.left) / (rect.right - rect.left);
  const fracy = (ypos - rect.top) / (rect.bottom - rect.top);

  const point: Point = { x: fracx, y: fracy };
  line_to_point(component, point, player.colour);

    socket.emit("stroke_end", { points: queued_strokes.concat([point]) });
    time_since_last_sent = Date.now();
    queued_strokes = [];
    ctx = null;
    mid_stroke = false;
}

export function Canvas({
  room,
  playerId,
  socket,
  myTurn,
  strokes,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (strokes != null && canvasRef?.current != null) {
      updateCanvas(canvasRef.current, strokes);
    }
  }, [canvasRef, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "800px", height: "600px", border: "1px solid red" }}
      onPointerDown={(event) => {
        if (myTurn) {
          startDraw(
            event.currentTarget,
            event.clientX,
            event.clientY,
            room,
            playerId,
            socket,
          );
        }
      }}
      onPointerMove={(event) => {
        if (myTurn && mid_stroke) {
          continueDraw(
            event.currentTarget,
            event.clientX,
            event.clientY,
            room,
            playerId,
            socket,
          );
        }
      }}
      onPointerUp={(event) => {
        if (myTurn && mid_stroke) {
          finishDraw(
            event.currentTarget,
            event.clientX,
            event.clientY,
            room,
            playerId,
            socket,
          );
        }
      }}
      onPointerLeave={(event) => {
        if (myTurn && mid_stroke) {
          finishDraw(
            event.currentTarget,
            event.clientX,
            event.clientY,
            room,
            playerId,
            socket,
          );
        }
      }}
      onPointerCancel={(event) => {
        if (myTurn && mid_stroke) {
          finishDraw(
            event.currentTarget,
            event.clientX,
            event.clientY,
            room,
            playerId,
            socket,
          );
        }
      }}
    />
  );
}

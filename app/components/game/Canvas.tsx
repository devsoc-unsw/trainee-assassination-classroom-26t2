"use client";

import { AppSocket } from "@/app/socket-provider";
import { PlayerId, PublicRoom, Point, Stroke } from "@/shared/types";
import { useEffect, useRef } from "react";

const STROKE_WIDTH = 2;
const UPDATES_PER_SEC = 60; //TODO: Make this 60 at some point

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
let queued_strokes: Point[] = [];
let time_since_last_sent: number = 0;
let currently_drawing: boolean = false;


function line_to_point(
  component: HTMLCanvasElement,
  point: Point,
  colour: string,
  mid_stroke: boolean,
) {
  if (ctx == null) {
    ctx = component.getContext("2d");

    if (ctx == null) {
      console.error("Failed to load ctx");
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    component.width = component.clientWidth * dpr;
    component.height = component.clientHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  if (!mid_stroke) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = STROKE_WIDTH;

    ctx.beginPath();
    ctx.moveTo(point.x * component.width, point.y * component.height);
  } else {
    ctx.strokeStyle = colour;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineTo(point.x * component.width, point.y * component.height);
  }
}

function display_stroke(component: HTMLCanvasElement, stroke: Stroke, mid_stroke: boolean) {
  while (stroke.points.length > num_points) {
    line_to_point(component, stroke.points[num_points], stroke.colour, mid_stroke);
    mid_stroke = true;
    num_points += 1;
  }
  ctx?.stroke();
}

export function updateCanvas(component: HTMLCanvasElement, strokes: Stroke[]) {
  while (strokes.length > num_strokes) {
    const new_stroke = strokes.at(num_strokes);
    if (new_stroke === undefined) {
      return;
    }
    num_points = 0;
    display_stroke(component, new_stroke, false);

    num_strokes += 1;
  }

  const final_stroke = strokes.at(-1);

  if (final_stroke !== undefined) {
    display_stroke(component, final_stroke, true);
  }
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

  const rect = component.getBoundingClientRect();
  const fracx = (xpos - rect.left) / (rect.right - rect.left);
  const fracy = (ypos - rect.top) / (rect.bottom - rect.top);

  const point: Point = { x: fracx, y: fracy };
  line_to_point(component, point, player.colour, false);
  ctx?.stroke();

  socket.emit("stroke_start", { point: point });
  time_since_last_sent = Date.now();
  currently_drawing = true;
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
  num_points += 1;
  line_to_point(component, point, player.colour, true);
  ctx?.stroke();

  if (Date.now() - time_since_last_sent < 1000 / UPDATES_PER_SEC) {
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
  num_points += 1;
  line_to_point(component, point, player.colour, true);
  ctx?.stroke();

  socket.emit("stroke_end", { points: queued_strokes.concat([point]) });
  time_since_last_sent = Date.now();
  queued_strokes = [];
  currently_drawing = false;
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (strokes != null) {
      updateCanvas(canvas, strokes);
    }
  }, [strokes, canvasRef]);

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
        if (myTurn && currently_drawing) {
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
        if (myTurn && currently_drawing) {
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
        if (myTurn && currently_drawing) {
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
        if (myTurn && currently_drawing) {
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

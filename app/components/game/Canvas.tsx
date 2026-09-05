"use client";

import { AppSocket } from "@/app/socket-provider";
import { PlayerId, PublicRoom, Point, Stroke } from "@/shared/types";
import { useEffect, useRef } from "react";

const STROKE_WIDTH = 2;
const UPDATES_PER_SEC = 60;

interface CanvasProps {
  room: PublicRoom;
  playerId: PlayerId;
  socket: AppSocket;
  myTurn: boolean;
  strokes: Stroke[] | undefined;
  highlightPlayerId?: PlayerId | null;
}

interface DrawState {
  ctx: CanvasRenderingContext2D | null;
  numStrokes: number;
  numPoints: number;
  queuedStrokes: Point[];
  timeSinceLastSent: number;
  currentlyDrawing: boolean;
  hasStrokedThisTurn: boolean;
}

function createDrawState(): DrawState {
  return {
    ctx: null,
    numStrokes: 0,
    numPoints: 0,
    queuedStrokes: [],
    timeSinceLastSent: 0,
    currentlyDrawing: false,
    hasStrokedThisTurn: false,
  };
}

function ensureCtx(drawState: DrawState, component: HTMLCanvasElement) {
  if (drawState.ctx == null) {
    drawState.ctx = component.getContext("2d");

    if (drawState.ctx == null) {
      console.error("Failed to load ctx");
      return null;
    }

    const dpr = window.devicePixelRatio || 1;
    component.width = component.clientWidth * dpr;
    component.height = component.clientHeight * dpr;
    drawState.ctx.scale(dpr, dpr);
  }
  return drawState.ctx;
}

function lineToPoint(
  drawState: DrawState,
  component: HTMLCanvasElement,
  point: Point,
  colour: string,
  midStroke: boolean,
) {
  const ctx = ensureCtx(drawState, component);
  if (ctx == null) {
    return;
  }

  ctx.strokeStyle = colour;
  ctx.lineWidth = STROKE_WIDTH;

  const x = point.x * component.clientWidth;
  const y = point.y * component.clientHeight;

  if (!midStroke) {
    ctx.beginPath();
    ctx.moveTo(x, y);
  } else {
    ctx.lineTo(x, y);
  }
}

function displayStroke(
  drawState: DrawState,
  component: HTMLCanvasElement,
  stroke: Stroke,
  midStroke: boolean,
) {
  while (stroke.points.length > drawState.numPoints) {
    lineToPoint(
      drawState,
      component,
      stroke.points[drawState.numPoints],
      stroke.colour,
      midStroke,
    );
    midStroke = true;
    drawState.numPoints += 1;
  }
  drawState.ctx?.stroke();
}

function clearCanvas(drawState: DrawState, component: HTMLCanvasElement) {
  const ctx = ensureCtx(drawState, component);
  ctx?.clearRect(0, 0, component.width, component.height);
  drawState.numStrokes = 0;
  drawState.numPoints = 0;
}

export function updateCanvas(
  drawState: DrawState,
  component: HTMLCanvasElement,
  strokes: Stroke[],
) {
  if (strokes.length < drawState.numStrokes) {
    clearCanvas(drawState, component);
  }

  while (strokes.length > drawState.numStrokes) {
    const newStroke = strokes.at(drawState.numStrokes);
    if (newStroke === undefined) {
      return;
    }
    drawState.numPoints = 0;
    displayStroke(drawState, component, newStroke, false);

    drawState.numStrokes += 1;
  }

  const finalStroke = strokes.at(-1);

  if (finalStroke !== undefined) {
    displayStroke(drawState, component, finalStroke, true);
  }
}

function drawFullStroke(
  ctx: CanvasRenderingContext2D,
  component: HTMLCanvasElement,
  stroke: Stroke,
  alpha: number,
  widthMultiplier: number,
) {
  if (stroke.points.length === 0) {
    return;
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke.colour;
  ctx.lineWidth = STROKE_WIDTH * widthMultiplier;
  ctx.beginPath();
  const [first, ...rest] = stroke.points;
  ctx.moveTo(first.x * component.clientWidth, first.y * component.clientHeight);
  for (const point of rest) {
    ctx.lineTo(
      point.x * component.clientWidth,
      point.y * component.clientHeight,
    );
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function renderRevealCanvas(
  drawState: DrawState,
  component: HTMLCanvasElement,
  strokes: Stroke[],
  highlightPlayerId: PlayerId | null,
) {
  const ctx = ensureCtx(drawState, component);
  if (ctx == null) {
    return;
  }
  ctx.clearRect(0, 0, component.width, component.height);

  if (highlightPlayerId == null) {
    for (const stroke of strokes) {
      drawFullStroke(ctx, component, stroke, 1, 1);
    }
    return;
  }

  for (const stroke of strokes) {
    if (stroke.playerId !== highlightPlayerId) {
      drawFullStroke(ctx, component, stroke, 0.3, 1);
    }
  }
  for (const stroke of strokes) {
    if (stroke.playerId === highlightPlayerId) {
      drawFullStroke(ctx, component, stroke, 1, 1.75);
    }
  }
}

function startDraw(
  drawState: DrawState,
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

  drawState.numPoints = 0;
  drawState.numStrokes += 1;
  drawState.hasStrokedThisTurn = true;

  const rect = component.getBoundingClientRect();
  const fracx = (xpos - rect.left) / (rect.right - rect.left);
  const fracy = (ypos - rect.top) / (rect.bottom - rect.top);

  const point: Point = { x: fracx, y: fracy };
  lineToPoint(drawState, component, point, player.colour, false);
  drawState.ctx?.stroke();

  socket.emit("stroke_start", { point: point });
  drawState.timeSinceLastSent = Date.now();
  drawState.currentlyDrawing = true;
}

function continueDraw(
  drawState: DrawState,
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
  drawState.numPoints += 1;
  lineToPoint(drawState, component, point, player.colour, true);
  drawState.ctx?.stroke();

  if (Date.now() - drawState.timeSinceLastSent < 1000 / UPDATES_PER_SEC) {
    drawState.queuedStrokes.push(point);
  } else {
    socket.emit("stroke_point", {
      points: drawState.queuedStrokes.concat([point]),
    });
    drawState.queuedStrokes = [];
    drawState.timeSinceLastSent = Date.now();
  }
}

function finishDraw(
  drawState: DrawState,
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
  drawState.numPoints += 1;
  lineToPoint(drawState, component, point, player.colour, true);
  drawState.ctx?.stroke();

  socket.emit("stroke_end", {
    points: drawState.queuedStrokes.concat([point]),
  });
  drawState.timeSinceLastSent = Date.now();
  drawState.queuedStrokes = [];
  drawState.currentlyDrawing = false;
}

export function Canvas({
  room,
  playerId,
  socket,
  myTurn,
  strokes,
  highlightPlayerId,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawStateRef = useRef<DrawState>(createDrawState());
  const wasMyTurnRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokes == null) return;

    if (highlightPlayerId !== undefined) {
      renderRevealCanvas(
        drawStateRef.current,
        canvas,
        strokes,
        highlightPlayerId,
      );
    } else {
      updateCanvas(drawStateRef.current, canvas, strokes);
    }
  }, [strokes, highlightPlayerId]);

  useEffect(() => {
    if (myTurn && !wasMyTurnRef.current) {
      drawStateRef.current.hasStrokedThisTurn = false;
    }
    wasMyTurnRef.current = myTurn;
  }, [myTurn]);

  const canDraw = () => myTurn && !drawStateRef.current.hasStrokedThisTurn;

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "800px", height: "600px" }}
      onPointerDown={(event) => {
        if (canDraw()) {
          startDraw(
            drawStateRef.current,
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
        if (myTurn && drawStateRef.current.currentlyDrawing) {
          continueDraw(
            drawStateRef.current,
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
        if (myTurn && drawStateRef.current.currentlyDrawing) {
          finishDraw(
            drawStateRef.current,
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
        if (myTurn && drawStateRef.current.currentlyDrawing) {
          finishDraw(
            drawStateRef.current,
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
        if (myTurn && drawStateRef.current.currentlyDrawing) {
          finishDraw(
            drawStateRef.current,
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

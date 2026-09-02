'use client';

import { AppSocket } from "@/app/socket-provider";
import { CANVAS_HEIGHT, CANVAS_WIDTH, PlayerId, PublicRoom, Point } from "@/shared/types";

let ctx: null | CanvasRenderingContext2D = null;

interface CanvasProps {
  room: PublicRoom;
  playerId: PlayerId;
  socket: AppSocket;
}

function startDraw(component: HTMLCanvasElement, xpos: number, ypos: number, room: PublicRoom, playerId: PlayerId, socket: AppSocket) {
    ctx = component.getContext("2d");

    if (ctx == null) {
        return
    }

    const player = room.players.find((x)=>x.id == playerId)

    if (player == null) {
        return
    }

    ctx.strokeStyle = player.colour;
    ctx.lineWidth = 3;

    ctx.beginPath();
    const rect = component.getBoundingClientRect();
    const fracx = (xpos - rect.left) / (rect.right - rect.left)
    const fracy = (ypos - rect.top) / (rect.bottom - rect.top)
    ctx.moveTo(
        fracx * component.width,
        fracy * component.height
    );

    const point: Point = {x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT};

    socket.emit("stroke_start", {point: point});
}

function continueDraw(component: HTMLCanvasElement, xpos: number, ypos: number, room: PublicRoom, playerId: PlayerId, socket: AppSocket) {
    if (ctx == null) {
        return
    }
    const rect = component.getBoundingClientRect();
    const fracx = (xpos - rect.left) / (rect.right - rect.left)
    const fracy = (ypos - rect.top) / (rect.bottom - rect.top)
    ctx.lineTo(
        fracx * component.width,
        fracy * component.height
    );
    ctx.stroke();

    const point: Point = {x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT};

    socket.emit("stroke_point", {points: [point]});
}

function finishDraw(component: HTMLCanvasElement, xpos: number, ypos: number, room: PublicRoom, playerId: PlayerId, socket: AppSocket) {
    if (ctx == null) {
        return
    }
    const rect = component.getBoundingClientRect();
    const fracx = (xpos - rect.left) / (rect.right - rect.left)
    const fracy = (ypos - rect.top) / (rect.bottom - rect.top)
    ctx.lineTo(
        fracx * component.width,
        fracy * component.height
    );
    ctx.stroke();
    

    const point: Point = {x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT};

    socket.emit("stroke_end", {points: [point]});

    ctx = null;
}

export function Canvas({ room, playerId, socket }: CanvasProps) {
    return (
        <canvas
            style={{ width: "800px", height: "600px", border: "1px solid red" }}
            onPointerDown={(event) => startDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket)}
            onPointerMove={(event) => continueDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket)}
            onPointerUp={(event) => finishDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket)}
        />
    );
}

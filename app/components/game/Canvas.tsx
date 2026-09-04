'use client';

import { AppSocket } from "@/app/socket-provider";
import { CANVAS_HEIGHT, CANVAS_WIDTH, PlayerId, PublicRoom, Point, Stroke } from "@/shared/types";

let ctx: null | CanvasRenderingContext2D = null;

interface CanvasProps {
    room: PublicRoom | null;
    playerId: PlayerId;
    socket: AppSocket;
    myTurn: boolean;
}

let num_strokes: number = 0;
let num_points: number = 0;

function line_to_point(component: HTMLCanvasElement, point: Point, left_bound: number, right_bound: number) {
    const rect = component.getBoundingClientRect();
    const fracx = (point.x - left_bound) / (rect.right - left_bound)
    const fracy = (point.y - right_bound) / (rect.bottom - right_bound)
    if (ctx == null) {
        ctx = component.getContext("2d");
        if (ctx == null) {
            return
        }
        ctx.moveTo(
            fracx * component.width,
            fracy * component.height
        );

    } else {
        ctx.lineTo(
            fracx * component.width,
            fracy * component.height
        );
    }
}

function display_stroke(component: HTMLCanvasElement, stroke: Stroke) {
    while (stroke.points.length > num_points) {
        line_to_point(component, stroke.points[num_points], CANVAS_WIDTH, CANVAS_HEIGHT);
        num_points += 1;
    }
}

export function updateCanvas(component: HTMLCanvasElement, strokes: Stroke[]) {
    if (strokes.length == 0) {
        return;
    }
    while (strokes.length > num_strokes) {
        const new_stroke = strokes[num_strokes];

        num_points = 0;
        ctx = null;
        display_stroke(component, new_stroke);

        num_strokes += 1;

    }

    display_stroke(component, strokes[-1]);

    ctx?.stroke();
}

export function resetCanvas(component: HTMLCanvasElement) {
    num_strokes = 0;
    num_points = 0;
    ctx = component.getContext("2d");
    ctx?.reset();
}

function startDraw(component: HTMLCanvasElement, xpos: number, ypos: number, room: PublicRoom, playerId: PlayerId, socket: AppSocket) {
    ctx = component.getContext("2d");

    if (ctx == null) {
        return
    }

    const player = room.players.find((x) => x.id == playerId)

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

    const point: Point = { x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT };

    socket.emit("stroke_start", { point: point });
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

    const point: Point = { x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT };

    socket.emit("stroke_point", { points: [point] });
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

    const point: Point = { x: fracx * CANVAS_WIDTH, y: fracy * CANVAS_HEIGHT };

    socket.emit("stroke_end", { points: [point] });

    ctx = null;
}

export function Canvas({ room, playerId, socket, myTurn }: CanvasProps) {
    if (room == null) {
        return <h1>ERROR: DISCONNECTED FROM ROOM</h1> //TODO: Not sure if this is graceful way to handle this :)
    }
    return (
        <canvas
            style={{ width: "800px", height: "600px", border: "1px solid red" }}
            onPointerDown={(event) => { if (myTurn) { startDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket) } }}
            onPointerMove={(event) => { if (myTurn) { continueDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket) } }}
            onPointerUp={(event) => { if (myTurn) { finishDraw(event.currentTarget, event.clientX, event.clientY, room, playerId, socket) } }}
        />
    );
}

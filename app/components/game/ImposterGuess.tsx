import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS } from "@/shared/events";
import { useRef } from "react";

interface ImposterGuessProps {
  socket: AppSocket;
}

function onClick(component: HTMLTextAreaElement | null, socket: AppSocket) {
  if (component === null) {
    return;
  }
  const guess: string = component.value;
  socket.emit(CLIENT_EVENTS.SUBMIT_GUESS, { text: guess });
}

export function ImposterGuess({ socket }: ImposterGuessProps) {
    const textRef = useRef<HTMLTextAreaElement|null>(null);
  return (
    <>
      <h1>GUESSY TIME TIME</h1>
      <textarea ref={textRef}></textarea>
      <button onClick={() => onClick(textRef.current, socket)}>Submit!</button>
    </>
  );
}

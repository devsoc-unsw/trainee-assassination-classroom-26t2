import { AppSocket } from "@/app/socket-provider";
import { CLIENT_EVENTS } from "@/shared/events";
import { Player } from "@/shared/types";
import { ReactNode } from "react";

interface VotingScreenProps {
  players: Player[];
  socket: AppSocket;
}

function onChange(component: HTMLSelectElement, socket: AppSocket) {
  const playerId: string = component.options[component.selectedIndex].value;
  socket.emit(CLIENT_EVENTS.CAST_VOTE, { targetId: playerId });
}

export function VotingScreen({ players, socket }: VotingScreenProps) {
  const options: ReactNode[] = players.map((x) => (
    <option value={x.id}>{x.nickname}</option>
  ));

  return (
    <>
      <h1>VOTING TIME</h1>
      <select onChange={(event) => onChange(event.target, socket)}>
        <option value="">--Pick Imposter--</option>
        {options}
      </select>
    </>
  );
}

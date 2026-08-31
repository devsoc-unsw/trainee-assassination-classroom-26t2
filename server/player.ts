import { Player } from "../shared/types"

export function createPlayer(id: string, nickname: string, colour: string, connected: boolean): Player {
    return { id, nickname , colour, connected };
}
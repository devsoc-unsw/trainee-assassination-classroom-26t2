import { Player } from '../shared/types';
import { createPlayer } from '../server/player'
const map = new Map<string, Player>();

function createRoom() {
    let roomCode: string = generateRoomCode();
    while (isRoomCodeUnique(roomCode) != true) {
        map.delete(roomCode);
        roomCode = generateRoomCode();
    }
    // how do add the input output here
    // because now it's still hardcoded
    let host: Player = createPlayer("89UIE9", "Nick", "Blue", true);
    map.set(roomCode, host);
}

function generateRoomCode(): string {
    let roomCode = '';
    roomCode += Math.random().toString(36).substring(2, 8).toUpperCase();
    return roomCode;
}

function isRoomCodeUnique(code: string): boolean {

    if (map.has(code)) {
        return false;
    }

    return true;
}


// console.log(generateRoomCode());
// createRoom("Room1");
// createRoom("Room2");
// console.log(map);
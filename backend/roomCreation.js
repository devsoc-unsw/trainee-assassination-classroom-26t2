const socket = io('http://localhost:3000');
const map = new Map();

function createRoom() {
    // map = {roomCode, roomName}
    roomCode = generateRoomCode();
    // checking if the code is unique
    while (isRoomCodeUnique(roomCode) == 0) {
        map.delete(roomCode);
        roomCode = generateRoomCode();
    }
    map.set(roomCode, roomName);
}

function generateRoomCode() {
    let roomCode = '';
    roomCode += Math.random().toString(36).substring(2, 8).toUpperCase();
    // Math random returns the random numbers 0.xxxxx
    // .toString makes change it to string
    // substring taking a part that we want from a string
    // toUpperCase() make the letter becomes uppercase
    return roomCode;
}

function isRoomCodeUnique(code) {
    // map.forEach(value => {
    //     if (code == value) {
    //         return 0;
    //     }
    // });

    if (map.has(code)) {
        return 0;
    }

    return 1;
}

function joinRoom(roomCode) {
    if (!map.has(roomCode)) {
        console.log("There is no room available with the given code!");
    }

    // add player to the map

}

function createPlayer() {
    // customize the player
}

console.log(generateRoomCode());
createRoom("Room1");
createRoom("Room2");
console.log(map);
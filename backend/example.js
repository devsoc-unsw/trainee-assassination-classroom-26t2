// runs in Node, in the terminal — just like C's scanf/printf
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('What is your name? ', (name) => {
  console.log('Hello, ' + name);
  rl.close();
});
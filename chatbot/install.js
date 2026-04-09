const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync('./out.log', 'a');
const err = fs.openSync('./err.log', 'a');

console.log('Spawning detached npm install...');
const child = spawn('cmd.exe', ['/c', 'npm', 'install'], {
  detached: true,
  stdio: ['ignore', out, err]
});

child.unref();
console.log('Spawned successfully in the background. Check out.log and err.log later.');

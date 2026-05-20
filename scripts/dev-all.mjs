import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const processes = [
  spawn(npmCmd, ['run', 'dev:server'], { stdio: 'inherit', shell: false }),
  spawn(npmCmd, ['run', 'dev:client'], { stdio: 'inherit', shell: false }),
];

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown(code);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

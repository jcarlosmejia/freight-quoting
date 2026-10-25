// Arranca API (con recarga) y Vite en paralelo para desarrollo.
import { spawn } from 'node:child_process';
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const api = run('node', ['--watch', 'server/main.ts']);
const web = run('npx', ['vite']);
const stop = () => { api.kill(); web.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

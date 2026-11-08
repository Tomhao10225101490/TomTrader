import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
// A fresh, dedicated DEMO database on every run. Never touch data/tomtrader.db.
for (const suffix of ['', '-wal', '-shm']) rmSync(`${process.env.TOMTRADER_DB}${suffix}`, { force: true });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3101'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));

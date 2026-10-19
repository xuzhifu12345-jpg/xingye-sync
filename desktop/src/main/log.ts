import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ts } from './paths';

let stream: fs.WriteStream | null = null;

export function initLogger(): void {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'shell.log');
  stream = fs.createWriteStream(file, { flags: 'a' });
  log('logger initialized', file);
}

export function log(...parts: unknown[]): void {
  const line = `[${ts()}] ${parts.map((p) => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`;
  process.stdout.write(line);
  stream?.write(line);
}

export function closeLogger(): void {
  stream?.end();
  stream = null;
}
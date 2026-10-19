import { spawn, ChildProcess } from 'child_process';
import * as http from 'http';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { RuntimeManager } from './runtime';
import { resolvePaths } from './paths';
import { log } from './log';

export interface BackendHandle {
  proc: ChildProcess;
  port: number;
  stop: () => void;
}

/**
 * 拉起 Python 后端。
 * - 运行时：runtime/python（python-build-standalone 便携解释器 + venv site-packages）
 * - 业务代码：resources/backend（打包）/ 仓库 backend（dev）
 * - 端口：从 5409 起找第一个空闲端口；探测时绑定 0.0.0.0（与 waitress 一致），
 *   否则 Windows 上 127.0.0.1 探测可能穿过已绑定 0.0.0.0 的服务造成误判
 * - 就绪判定：/api/health 的 sau_data_dir 必须等于我们传入的 SAU_DATA_DIR
 */
export async function startBackend(
  rt: RuntimeManager,
  onStatus?: (s: string) => void,
  opts?: { profileName?: string },
): Promise<BackendHandle> {
  const say = (s: string) => { log(s); try { onStatus?.(s); } catch {} };
  const p = resolvePaths();
  killStaleBackend(p.logsDir); // 清理上一轮遗留的孤儿后端
  const port = await findFreePort(5409);
  const py = rt.get('python');
  if (!py?.path) throw new Error('Python 运行时未就绪：runtime/python/ 缺少可用的 python.exe');

  const candidates = [
    path.join(p.resourcesDir, 'backend'),
    path.resolve(__dirname, '..', '..', '..', 'backend'),
  ];
  const backendDir = candidates.find((d) => fs.existsSync(path.join(d, 'app.py')));
  if (!backendDir) {
    throw new Error(`找不到后端代码（尝试过: ${candidates.join(', ')}）`);
  }
  say(`启动后端（端口 ${port}）…`);
  log(`spawn python backend cwd=${backendDir} port=${port} python=${py.path}`);

  const env = rt.buildEnv({
    SAU_PORT: String(port),
    SAU_DATA_DIR: p.dataDir,
    SAU_PROFILE_NAME: opts?.profileName || '',
    PYTHONUNBUFFERED: '1',
  });

  const proc = spawn(py.path, ['app.py'], {
    cwd: backendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  // 记录 PID：即使 Electron 崩溃/被强杀（不走 will-quit），下次启动也能清掉孤儿
  try { fs.writeFileSync(path.join(p.logsDir, 'backend.pid'), String(proc.pid)); } catch {}

  let errTail = '';
  proc.stdout?.on('data', (b) => log('[backend.stdout]', b.toString().trim()));
  proc.stderr?.on('data', (b) => {
    const s = b.toString().trim();
    errTail = (errTail + '\n' + s).slice(-4000);
    log('[backend.stderr]', s);
  });
  proc.on('error', (e) => log('[backend.error]', e.message));

  // 就绪等待：spawn 失败 / 提前退出 → 立刻抛错（绝不把别人的服务当成自己的）
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (msg: string) => { if (!settled) { settled = true; reject(new Error(`${msg}\n${errTail.slice(-1200)}`)); } };
    const ok = () => { if (!settled) { settled = true; resolve(); } };

    proc.on('error', (e) => fail(`后端进程启动失败: ${e.message}`));
    proc.on('exit', (code) => fail(`后端进程提前退出 code=${code}`));

    waitHealthy(port, p.dataDir, 90_000, say).then(ok, fail);
  });

  log(`backend healthy on port ${port}`);

  const stop = () => {
    if (!proc.killed) {
      log('stopping backend...');
      try { proc.kill(); } catch {}
    }
  };

  return { proc, port, stop };
}

/** 清理上一轮遗留的孤儿后端（PID 记录在 logs/backend.pid） */
function killStaleBackend(logsDir: string): void {
  try {
    const file = path.join(logsDir, 'backend.pid');
    const raw = fs.readFileSync(file, 'utf8').trim();
    const pid = parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return;
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true });
    } else {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    log(`cleaned stale backend pid=${pid}`);
    fs.unlinkSync(file);
  } catch { /* 无 PID 文件或进程已死：正常情况 */ }
}

/** 从 start 起找第一个空闲端口。绑定 0.0.0.0 以与 waitress 的绑定方式一致 */
async function findFreePort(start: number, tries = 50): Promise<number> {
  for (let port = start; port < start + tries; port++) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) return port;
  }
  throw new Error(`从 ${start} 起连续 ${tries} 个端口都被占用`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    let closed = false;
    const done = (ok: boolean) => { if (!closed) { closed = true; try { srv.close(); } catch {} resolve(ok); } };
    srv.once('error', () => done(false));
    srv.once('listening', () => {
      // 保持 250ms 再放行，躲开其他进程探测/绑定的竞态窗口
      setTimeout(() => done(true), 250);
    });
    srv.listen(port, '0.0.0.0');
  });
}

/** 轮询 /api/health，且校验 sau_data_dir 是自己人 */
async function waitHealthy(
  port: number,
  expectedDataDir: string,
  timeoutMs: number,
  onStatus?: (s: string) => void,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/api/health`;
  let foreignHits = 0;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const body = await fetchJson(url);
    if (body != null) {
      const dataDir = typeof body.sau_data_dir === 'string' ? body.sau_data_dir : '';
      if (dataDir && norm(dataDir) === norm(expectedDataDir)) return;
      foreignHits++;
      if (foreignHits % 5 === 1) {
        const msg = `端口 ${port} 上是别的服务（sau_data_dir=${dataDir || '无'}），继续等待自己的后端`;
        log('[health]', msg);
        try { onStatus?.('检测到端口被其他程序占用，正在换用可用端口…'); } catch {}
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(600);
  }
  throw new Error(`后端未在 ${Math.round(timeoutMs / 1000)}s 内就绪（${url}）。常见原因：安全软件拦截 python.exe 启动，或后端端口绑定失败。`);
}

function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(1500, () => req.destroy());
  });
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
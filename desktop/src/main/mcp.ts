import { ChildProcess, spawn } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { RuntimeManager } from './runtime';
import { resolvePaths } from './paths';
import { log } from './log';

/**
 * MCP 服务（backend-mcp，SSE 模式）受控子进程。
 * - 由外壳按需启动/停止（账户选择页的齿轮菜单 →「开启 MCP」）
 * - DB_PATH 跟随当前账户的数据目录，切换账户时随之重启
 * - TRANSPORT_MODE 固定 sse（stdio 模式由 AI 客户端自行拉起，不经外壳）
 */

export const MCP_PORT = 9527;

let proc: ChildProcess | null = null;
let runningPort: number | null = null;

export function isMcpRunning(): boolean {
  return !!(proc && proc.exitCode === null);
}

export function getMcpPort(): number | null {
  return isMcpRunning() ? runningPort : null;
}

export interface McpStartResult {
  ok: boolean;
  port?: number;
  error?: string;
}

export async function startMcp(
  rt: RuntimeManager,
  backendPort: number,
  dbPath: string,
): Promise<McpStartResult> {
  if (isMcpRunning()) return { ok: true, port: runningPort! };

  const node = rt.get('node');
  if (!node?.path) return { ok: false, error: 'Node 运行时未就绪' };

  const p = resolvePaths();
  const candidates = [
    path.join(p.resourcesDir, 'mcp'),
    path.resolve(__dirname, '..', '..', '..', 'backend-mcp'),
  ];
  const dir = candidates.find((d) => fs.existsSync(path.join(d, 'dist', 'index.js')));
  if (!dir) return { ok: false, error: `找不到 MCP 服务代码（尝试过: ${candidates.join(', ')}）` };

  const env = rt.buildEnv({
    BACKEND_URL: `http://127.0.0.1:${backendPort}`,
    MCP_PORT: String(MCP_PORT),
    TRANSPORT_MODE: 'sse',
    DB_PATH: dbPath,
  });

  log(`[mcp] 启动 MCP 服务 node=${node.path} cwd=${dir} db=${dbPath}`);
  proc = spawn(node.path, [path.join(dir, 'dist', 'index.js')], {
    cwd: dir,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningPort = MCP_PORT;

  proc.stdout?.on('data', (b) => log('[mcp]', b.toString().trim()));
  proc.stderr?.on('data', (b) => log('[mcp-err]', b.toString().trim()));
  proc.on('exit', (code) => {
    log(`[mcp] 进程退出 code=${code}`);
    proc = null;
    runningPort = null;
  });

  const ready = await waitPort(MCP_PORT, 15_000);
  if (!ready) {
    stopMcp();
    return { ok: false, error: `MCP 服务未能在 15 秒内就绪（端口 ${MCP_PORT} 可能被占用）` };
  }
  log(`[mcp] SSE 服务就绪: http://127.0.0.1:${MCP_PORT}/sse`);
  return { ok: true, port: MCP_PORT };
}

export function stopMcp(): void {
  if (!proc) return;
  log('[mcp] 停止 MCP 服务');
  try { proc.kill(); } catch {}
  proc = null;
  runningPort = null;
}

/** TCP 探测端口就绪 */
function waitPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const srv = net.connect(port, '127.0.0.1');
      srv.once('connect', () => { srv.destroy(); resolve(true); });
      srv.once('error', () => {
        srv.destroy();
        if (Date.now() < deadline) setTimeout(tryOnce, 500);
        else resolve(false);
      });
    };
    tryOnce();
  });
}

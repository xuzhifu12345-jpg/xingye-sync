import { app } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * 跨平台解析用户数据目录、运行时目录、业务代码目录。
 *
 * 数据目录由「本地账户」决定：每个账户有自己隔离的 dataDir，
 * 启动选择账户后通过 setActiveDataDir() 注入，再传给后端 SAU_DATA_DIR。
 */

export interface ResolvedPaths {
  installDir: string;       // app 父目录
  resourcesDir: string;      // process.resourcesPath
  userData: string;          // app.getPath('userData')
  runtimeDir: string;        // userData/runtime
  dataDir: string;           // 当前账户的数据目录 ← SAU_DATA_DIR
  logsDir: string;           // userData/logs
  appCodeDir: string;        // userData/app-code
  runtimeSeed: string;       // resources/runtime-seed（只读）
}

let cached: ResolvedPaths | null = null;
let activeDataDir: string | null = null;

/** 账户选择完成后注入本次启动使用的数据目录 */
export function setActiveDataDir(dir: string): void {
  activeDataDir = dir;
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  cached = null;
}

export function getActiveDataDir(): string {
  return activeDataDir || defaultDataDir();
}

function defaultDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

export function resetPathsCache(): void {
  cached = null;
}

export function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function resolvePaths(): ResolvedPaths {
  if (cached) return cached;
  const userData = app.getPath('userData');
  const resourcesDir = process.resourcesPath;
  const installDir = path.dirname(resourcesDir);
  cached = {
    installDir,
    resourcesDir,
    userData,
    runtimeDir: path.join(userData, 'runtime'),
    dataDir: getActiveDataDir(),
    logsDir: path.join(userData, 'logs'),
    appCodeDir: path.join(userData, 'app-code'),
    runtimeSeed: path.join(resourcesDir, 'runtime-seed'),
  };
  return cached;
}

export function dumpPaths(): string {
  const p = resolvePaths();
  return [
    `installDir   = ${p.installDir}`,
    `resourcesDir = ${p.resourcesDir}`,
    `userData     = ${p.userData}`,
    `runtimeDir   = ${p.runtimeDir}`,
    `dataDir      = ${p.dataDir}`,
    `os.tmpdir()  = ${os.tmpdir()}`,
  ].join('\n');
}

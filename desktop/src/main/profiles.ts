import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './log';

/**
 * 本地账户（Profile）注册表。
 *
 * - 注册表：userData/profiles.json（小文件，永远在 userData，启动时一定能找到）
 * - 数据隔离：每个账户一个 dataDir，后端通过 SAU_DATA_DIR 指向它
 * - 头像：userData/avatars/<id>.<ext>；null = 使用内置品牌 logo
 */

export interface Profile {
  id: string;
  name: string;
  avatar: string | null;      // 头像文件相对 userData 的路径；null = 内置 logo
  dataDir: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ProfileRegistry {
  profiles: Profile[];
  lastUsed: string | null;
  /** 用户是否开启了内置 MCP 服务（重启后记忆） */
  mcpEnabled?: boolean;
}

const REGISTRY_FILE = () => path.join(app.getPath('userData'), 'profiles.json');

export function readRegistry(): ProfileRegistry {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE(), 'utf8');
    const reg = JSON.parse(raw);
    if (reg && Array.isArray(reg.profiles)) return reg;
  } catch { /* 不存在/损坏 → 空注册表 */ }
  return { profiles: [], lastUsed: null };
}

export function writeRegistry(reg: ProfileRegistry): void {
  fs.writeFileSync(REGISTRY_FILE(), JSON.stringify(reg, null, 2), 'utf8');
}

export function getProfile(id: string): Profile | null {
  return readRegistry().profiles.find(p => p.id === id) || null;
}

export function newProfileId(): string {
  return 'pf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 账户数据目录默认位置 */
export function defaultProfileDataDir(id: string): string {
  return path.join(app.getPath('userData'), 'profiles', id, 'data');
}

/** 保存头像（base64 dataUrl 落盘），返回相对路径；失败返回 null */
export function saveAvatar(id: string, dataUrl: string): string | null {
  try {
    const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const dir = path.join(app.getPath('userData'), 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    const rel = path.join('avatars', `${id}.${ext}`);
    fs.writeFileSync(path.join(app.getPath('userData'), rel), Buffer.from(m[2], 'base64'));
    return rel;
  } catch (e) {
    log(`[profiles] 头像保存失败: ${e}`);
    return null;
  }
}

// ──────────── 目录校验与导入 ────────────

export interface DirInspectResult {
  ok: boolean;
  kind: 'project' | 'data' | 'unknown';
  dataDir: string;
  message: string;
}

/** 识别用户选择的目录：源码项目根目录（含 data/）还是数据目录本身 */
export function inspectDir(selected: string): DirInspectResult {
  try {
    const stat = fs.statSync(selected);
    if (!stat.isDirectory()) {
      return { ok: false, kind: 'unknown', dataDir: '', message: '请选择文件夹（而不是文件）' };
    }
    const projectData = path.join(selected, 'data');
    if (fs.existsSync(path.join(projectData, 'db', 'database.db'))) {
      return { ok: true, kind: 'project', dataDir: projectData, message: '已识别为源码项目目录，将导入其中的 data 数据' };
    }
    if (fs.existsSync(path.join(selected, 'db', 'database.db'))) {
      return { ok: true, kind: 'data', dataDir: selected, message: '已识别为数据目录' };
    }
    return {
      ok: false, kind: 'unknown', dataDir: '',
      message: '该目录里没有找到数据（需要 data/db/database.db 或 db/database.db）',
    };
  } catch (e) {
    return { ok: false, kind: 'unknown', dataDir: '', message: `无法读取该目录: ${e}` };
  }
}

/** 目标数据目录是否已有数据（有 database.db 即视为已有） */
export function targetHasData(dataDir: string): boolean {
  return fs.existsSync(path.join(dataDir, 'db', 'database.db'));
}

// 迁移时跳过的目录（日志类，无迁移价值）；其余子目录全部迁移（未知目录按目录名展示），
// 避免硬编码清单漏掉 covers / materials / videoFile 等重要数据
const MIGRATE_SKIP_DIRS = new Set(['logs', 'dev-logs']);

// 已知目录的用户可读标签（未知目录回退用目录名）
const MIGRATE_LABELS: Record<string, string> = {
  db: '数据库',
  cookiesFile: '账号 Cookie',
  cookies: '浏览器会话',
  uploads: '素材上传记录',
  thumbnails: '封面图片',
  covers: '封面缓存',
  upload_chunks: '上传分片缓存',
  frames: '抽帧图片',
  materials: '素材库文件',
  videoFile: '视频文件',
  s3_video_cache: 'S3 视频缓存',
};

export interface ImportSummaryItem {
  dir: string;
  label: string;
  files: number;
  bytes: number;
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  copiedFiles: number;
  copiedBytes: number;
  items: ImportSummaryItem[];
}

export async function importData(
  srcDataDir: string,
  dstDataDir: string,
  onProgress: (info: { copied: number; total: number; pct: number }) => void,
): Promise<ImportResult> {
  try {
    if (!fs.existsSync(path.join(srcDataDir, 'db', 'database.db'))) {
      return { ok: false, error: '源数据目录无效（缺少 db/database.db）', copiedFiles: 0, copiedBytes: 0, items: [] };
    }
    if (targetHasData(dstDataDir)) {
      return { ok: false, error: '目标数据目录里已有数据（已存在 database.db），为避免覆盖请换一个空目录', copiedFiles: 0, copiedBytes: 0, items: [] };
    }
    // 预统计：扫描源数据目录下全部子目录（跳过日志），不再硬编码清单
    const perDir: Record<string, { files: number; bytes: number }> = {};
    let totalFiles = 0;
    for (const entry of fs.readdirSync(srcDataDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || MIGRATE_SKIP_DIRS.has(entry.name)) continue;
      const s = path.join(srcDataDir, entry.name);
      perDir[entry.name] = { files: 0, bytes: 0 };
      const walk = (d: string) => {
        for (const name of fs.readdirSync(d)) {
          const p = path.join(d, name);
          const st = fs.statSync(p);
          if (st.isDirectory()) walk(p);
          else { perDir[entry.name].files++; perDir[entry.name].bytes += st.size; totalFiles++; }
        }
      };
      walk(s);
    }

    // 异步复制：每 50 个文件让出一次事件循环，避免阻塞主进程（否则进度条不动、界面假死）
    let copied = 0;
    fs.mkdirSync(dstDataDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDataDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || MIGRATE_SKIP_DIRS.has(entry.name)) continue;
      const s = path.join(srcDataDir, entry.name);
      const copyWalk = async (d: string, dd: string): Promise<void> => {
        fs.mkdirSync(dd, { recursive: true });
        for (const name of fs.readdirSync(d)) {
          const sp = path.join(d, name);
          const dp = path.join(dd, name);
          const st = fs.statSync(sp);
          if (st.isDirectory()) {
            await copyWalk(sp, dp);
          } else {
            await fs.promises.copyFile(sp, dp);
            copied++;
            if (copied % 20 === 0 || copied === totalFiles) {
              onProgress({
                copied, total: totalFiles,
                pct: totalFiles === 0 ? 100 : Math.round((copied / totalFiles) * 100),
              });
            }
            if (copied % 50 === 0) {
              await new Promise<void>((r) => setImmediate(r)); // 让出事件循环
            }
          }
        }
      };
      await copyWalk(s, path.join(dstDataDir, entry.name));
    }
    if (totalFiles === 0) onProgress({ copied: 0, total: 0, pct: 100 });

    const items: ImportSummaryItem[] = Object.keys(perDir)
      .filter((dir) => perDir[dir].files > 0)
      .map((dir) => ({ dir, label: MIGRATE_LABELS[dir] || dir, files: perDir[dir].files, bytes: perDir[dir].bytes }));
    items.sort((a, b) => b.bytes - a.bytes);
    const copiedBytes = items.reduce((sum, it) => sum + it.bytes, 0);
    log(`[profiles] 数据导入完成: ${copied} 个文件 (${(copiedBytes / 1048576).toFixed(1)} MB) → ${dstDataDir}`);
    return { ok: true, copiedFiles: copied, copiedBytes, items };
  } catch (e) {
    log(`[profiles] 数据导入失败: ${e}`);
    return { ok: false, error: String(e), copiedFiles: 0, copiedBytes: 0, items: [] };
  }
}

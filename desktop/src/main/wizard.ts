import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  Profile, readRegistry, writeRegistry, getProfile, newProfileId,
  defaultProfileDataDir, saveAvatar, inspectDir, targetHasData,
  importData, ImportResult,
} from './profiles';
import { log } from './log';

/**
 * 启动账户门控：
 * - 无账户 → 直接进入「创建账户向导」
 * - 有账户 → 「账户选择」卡片页（悬浮出现删除，删除需二次确认，可选连数据目录一起删）
 * - 「新建账户」卡片 → 切换到创建向导（资料 → 数据目录 → 可选导入 → 导入汇总）
 * 选择/创建完成后关闭窗口并 resolve，主流程用该账户的数据目录启动后端。
 */

let gateWindow: BrowserWindow | null = null;
let gateDone: ((profile: Profile) => void) | null = null;
let completed = false;
let launchedProfile: Profile | null = null;

export function needsProfileGate(): boolean {
  return readRegistry().profiles.length === 0;
}

// ──────────── SVG 图标（线性风格，stroke: currentColor） ────────────
// 注意：必须去除换行！这些字符串会被嵌入页面内联 JS 的单引号字符串里，
// 多行 SVG 会导致 "未闭合字符串" SyntaxError，整个脚本块失效。
const I = (inner: string, size = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/\n\s*/g, '')}</svg>`.replace(/\n\s*/g, '');

const ICONS = {
  userPlus: I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>'),
  folder: I('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  database: I('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>'),
  import: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  trash: I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),
  alert: I('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  check: I('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  image: I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  edit: I('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
};

/** 内置品牌头像（渐变圆角方块 + 千字），作为 SVG 内联（去除换行，原因同上） */
const BRAND_AVATAR = `<svg width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#059669"/><stop offset="1" stop-color="#07C160"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#bg1)"/><text x="32" y="44" font-family="Microsoft YaHei,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">千</text></svg>`.replace(/\n\s*/g, '');

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ──────────── 页面 ────────────

function gateHtml(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Microsoft YaHei',system-ui,sans-serif}
  :root{
    --brand:#2563eb; --brand2:#4f46e5; --cyan:#06b6d4;
    --bg:#f1f5f9; --card:#ffffff; --border:#e2e8f0;
    --text:#0f172a; --sub:#64748b; --muted:#94a3b8;
    --danger:#dc2626; --ok:#059669;
  }
  body{height:100vh;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#eef2ff,#f1f5f9 45%,#ecfeff);color:var(--text)}
  .shell{width:840px;max-width:94vw;max-height:92vh;display:flex;flex-direction:column;
    background:var(--card);border-radius:18px;box-shadow:0 24px 60px rgba(2,6,23,.18);overflow:hidden}
  .head{padding:22px 30px 14px;border-bottom:1px solid var(--border);
    display:flex;align-items:center;gap:12px}
  .head .mark{width:38px;height:38px;border-radius:10px;flex-shrink:0;
    background:linear-gradient(135deg,#059669,#07C160);display:flex;align-items:center;justify-content:center;
    color:#fff;font-weight:800;font-size:19px}
  .head .t h1{font-size:18px;font-weight:700}
  .head .t p{font-size:12px;color:var(--sub);margin-top:2px}
  .body{padding:22px 30px 26px;overflow-y:auto}
  .foot{padding:14px 30px;border-top:1px solid var(--border);display:flex;
    justify-content:space-between;align-items:center;background:#fafbfd}
  .btn{border:none;border-radius:9px;padding:9px 18px;font-size:13px;cursor:pointer;font-weight:600;transition:all .15s}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .btn-primary{background:linear-gradient(135deg,var(--brand2),var(--brand));color:#fff}
  .btn-primary:hover:not(:disabled){filter:brightness(1.08)}
  .btn-ghost{background:#f1f5f9;color:#475569}
  .btn-ghost:hover{background:#e2e8f0}
  .btn-danger{background:var(--danger);color:#fff}
  .btn-danger:hover{filter:brightness(1.1)}

  /* ── 账户选择 ── */
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
  .pcard{position:relative;border:1.5px solid var(--border);border-radius:14px;background:var(--card);
    padding:22px 16px 18px;display:flex;flex-direction:column;align-items:center;gap:10px;
    cursor:pointer;transition:all .15s}
  .pcard:hover{border-color:var(--brand);box-shadow:0 8px 22px rgba(37,99,235,.14);transform:translateY(-2px)}
  .pcard .avatar{width:64px;height:64px;border-radius:50%;overflow:hidden;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;background:#f8fafc}
  .pcard .avatar svg{width:64px;height:64px}
  .pcard .avatar img{width:64px;height:64px;object-fit:cover}
  .pcard .nm{font-size:14px;font-weight:600}
  .pcard .dir{font-size:11px;color:var(--muted);max-width:190px;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:center}
  .pcard .del{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:8px;
    border:none;background:transparent;color:var(--muted);cursor:pointer;display:none;
    align-items:center;justify-content:center;transition:all .15s}
  .pcard:hover .del{display:flex}
  .pcard .del:hover{background:#fef2f2;color:var(--danger)}
  .pcard .del svg{width:15px;height:15px}
  .pcard.new{border-style:dashed;border-color:#cbd5e1;color:var(--sub);justify-content:center}
  .pcard.new:hover{color:var(--brand)}
  .pcard.new .plus{width:52px;height:52px;border-radius:50%;border:1.5px dashed #cbd5e1;
    display:flex;align-items:center;justify-content:center;margin-bottom:4px}
  .pcard.new:hover .plus{border-color:var(--brand)}
  .pcard.new .plus svg{width:22px;height:22px}

  /* ── 步骤指示 ── */
  .steps{display:flex;align-items:center;gap:6px;margin-bottom:20px}
  .steps .st{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}
  .steps .st .n{width:22px;height:22px;border-radius:50%;border:1.5px solid #cbd5e1;
    display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#fff}
  .steps .st.on{color:var(--brand);font-weight:600}
  .steps .st.on .n{border-color:var(--brand);background:rgba(37,99,235,.08);color:var(--brand)}
  .steps .st.done .n{border-color:var(--ok);background:rgba(5,150,105,.08);color:var(--ok)}
  .steps .ln{flex:0 0 22px;height:1.5px;background:#e2e8f0}

  .frow{margin-bottom:18px}
  .frow label{display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:7px}
  .tip{font-size:11px;color:var(--muted);margin-top:5px;line-height:1.5}
  .tip b{color:#334155}
  input[type=text]{width:100%;border:1.5px solid var(--border);border-radius:9px;
    padding:10px 12px;font-size:13px;color:var(--text);outline:none;transition:border .15s}
  input[type=text]:focus{border-color:var(--brand)}
  input[type=text]::placeholder{color:#cbd5e1}

  /* 头像选择 */
  .avatar-row{display:flex;align-items:center;gap:18px}
  .avatar-prev{width:76px;height:76px;border-radius:50%;overflow:hidden;flex-shrink:0;
    border:2px solid var(--border);background:#f8fafc;display:flex;align-items:center;justify-content:center}
  .avatar-prev svg{width:76px;height:76px}
  .avatar-prev img{width:100%;height:100%;object-fit:cover}
  .avatar-btns{display:flex;flex-direction:column;gap:8px}
  .abtn{display:inline-flex;align-items:center;gap:7px;border:1.5px solid var(--border);
    background:#fff;border-radius:9px;padding:8px 14px;font-size:12px;color:#334155;cursor:pointer;transition:all .15s}
  .abtn:hover{border-color:var(--brand);color:var(--brand)}
  .abtn.on{border-color:var(--brand);background:rgba(37,99,235,.06);color:var(--brand);font-weight:600}
  .abtn svg{width:15px;height:15px}

  .opt-row{display:flex;gap:8px;margin-top:8px}
  .opt-row input{flex:1}
  .hint{display:none;margin-top:8px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.55}
  .hint.ok{display:block;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
  .hint.err{display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}

  .chk{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#475569;cursor:pointer}
  .chk input{margin-top:2px}

  /* 汇总 */
  .sum-list{display:flex;flex-direction:column;gap:6px;margin:12px 0}
  .sum-item{display:flex;align-items:center;gap:9px;padding:9px 13px;background:#f8fafc;
    border:1px solid var(--border);border-radius:9px;font-size:12.5px;color:#334155}
  .sum-item .ic{color:var(--brand);display:flex}
  .sum-item .ic svg{width:15px;height:15px}
  .sum-item .lb{flex:1}
  .sum-item .ct{font-family:Consolas,monospace;font-weight:700;color:var(--brand)}

  /* 进度 */
  .prog{text-align:center;padding:26px 0 8px}
  .bar{height:9px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:16px 0 10px}
  .bar i{display:block;height:100%;width:0%;background:linear-gradient(90deg,var(--brand2),var(--cyan));
    border-radius:99px;transition:width .2s}
  .ptext{font-size:12px;color:var(--sub)}
  .spin{width:30px;height:30px;margin:0 auto 14px;border:3px solid #e2e8f0;
    border-top-color:var(--brand);border-radius:50%;animation:sp .9s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}

  /* 删除确认弹层 */
  .mask{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;
    align-items:center;justify-content:center;z-index:50}
  .mask.show{display:flex}
  .modal{width:430px;background:#fff;border-radius:14px;padding:24px 26px;box-shadow:0 20px 50px rgba(2,6,23,.3)}
  .modal h3{font-size:15px;display:flex;align-items:center;gap:8px;color:var(--danger)}
  .modal h3 svg{width:17px;height:17px}
  .modal p{font-size:12.5px;color:#475569;line-height:1.7;margin:10px 0 14px}
  .warn-box{display:none;margin-top:10px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;
    border-radius:9px;color:#b91c1c;font-size:12px;line-height:1.6;font-weight:600}
  .warn-box.show{display:block}
  .modal .acts{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
  .hide{display:none!important}
</style></head><body>
<div class="shell">
  <div class="head">
    <div class="mark">千</div>
    <div class="t">
      <h1 id="hd-title">选择账户</h1>
      <p id="hd-sub">每个账户拥有独立的数据目录，数据彼此隔离</p>
    </div>
  </div>
  <div class="body">

    <!-- ═══ 视图：账户选择 ═══ -->
    <div id="view-chooser" class="hide">
      <div class="cards" id="cards"></div>
    </div>

    <!-- ═══ 视图：创建向导 ═══ -->
    <div id="view-create" class="hide">
      <div class="steps">
        <div class="st on" data-step="1"><span class="n">1</span>账户资料</div>
        <div class="ln"></div>
        <div class="st" data-step="2"><span class="n">2</span>数据目录</div>
        <div class="ln"></div>
        <div class="st" data-step="3"><span class="n">3</span>完成</div>
      </div>

      <!-- 步骤 1：资料 -->
      <div id="cs1">
        <div class="frow">
          <label>账户名称</label>
          <input type="text" id="f-name" maxlength="20" placeholder="例如：主账号 / 工作号 / 直播号">
          <div class="tip">用于在启动选择页区分不同的数据空间</div>
        </div>
        <div class="frow">
          <label>头像</label>
          <div class="avatar-row">
            <div class="avatar-prev" id="av-prev">${BRAND_AVATAR}</div>
            <div class="avatar-btns">
              <button class="abtn" id="av-upload">${ICONS.image} 上传图片</button>
              <button class="abtn on" id="av-builtin">${ICONS.shield} 使用内置 Logo</button>
            </div>
          </div>
          <div class="tip">支持 PNG / JPG / WebP，建议正方形图片；上传后会按圆形展示</div>
        </div>
      </div>

      <!-- 步骤 2：数据目录 + 可选导入 -->
      <div id="cs2" class="hide">
        <div class="frow">
          <label><span style="display:inline-flex;vertical-align:-3px;margin-right:5px">${ICONS.folder}</span>数据目录</label>
          <label class="chk" style="margin-bottom:8px">
            <input type="checkbox" id="use-custom-dir">
            <span>自定义位置（默认放在应用数据目录下，按账户隔离）</span>
          </label>
          <div class="opt-row" id="row-custom-dir" style="display:none">
            <input type="text" id="f-custom-dir" placeholder="例如 D:\\QianfanData\\我的账户" readonly>
            <button class="btn btn-ghost" id="pick-custom">浏览…</button>
          </div>
          <div class="tip" id="dir-tip">默认位置：${esc(app.getPath('userData'))}\\profiles\\&lt;账户ID&gt;\\data</div>
          <div class="hint" id="hint-dir"></div>
        </div>
        <div class="frow">
          <label><span style="display:inline-flex;vertical-align:-3px;margin-right:5px">${ICONS.import}</span>导入旧数据（可选）</label>
          <div class="opt-row">
            <input type="text" id="f-source" placeholder="选择之前的项目文件夹（内含 data 目录）或旧 data 目录" readonly>
            <button class="btn btn-ghost" id="pick-source">浏览…</button>
          </div>
          <div class="hint" id="hint-source"></div>
          <div class="tip">之前用 start.bat / 源码方式启动过？选择原项目文件夹，会把其中 data 的账号、Cookie、发布记录复制到新账户。跳过 = 空白开始</div>
        </div>
      </div>

      <!-- 步骤 3：导入进度 / 汇总 -->
      <div id="cs3" class="hide">
        <div id="imp-prog" class="prog">
          <div class="spin"></div>
          <h3 style="font-size:15px">正在创建账户并导入数据…</h3>
          <p class="ptext" style="margin-top:4px">数据量大时可能需要几十秒，请勿关闭窗口</p>
          <div class="bar"><i id="bar"></i></div>
          <div class="ptext" id="ptext">准备中…</div>
        </div>
        <div id="imp-done" class="hide">
          <h3 style="font-size:15px;display:flex;align-items:center;gap:7px;color:var(--ok)">
            ${ICONS.check} 账户创建完成
          </h3>
          <div id="sum-wrap"></div>
          <div class="tip" style="margin-top:10px">正在进入千帆云递…</div>
        </div>
      </div>
    </div>
  </div>

  <div class="foot">
    <span style="font-size:11px;color:var(--muted)" id="foot-hint"></span>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost hide" id="back">上一步</button>
      <button class="btn btn-primary" id="next" disabled>下一步</button>
    </div>
  </div>
</div>

<!-- 删除确认 -->
<div class="mask" id="del-mask">
  <div class="modal">
    <h3>${ICONS.alert} 删除账户</h3>
    <p>确认删除账户 <b id="del-name"></b> 吗？该操作会从账户列表中移除此账户。</p>
    <label class="chk">
      <input type="checkbox" id="del-data">
      <span>同时删除数据目录</span>
    </label>
    <div class="warn-box" id="del-warn">
      ⚠ 数据目录将被彻底删除，其中包含数据库、账号 Cookie、发布记录等全部数据，<u>删除后无法恢复</u>！请谨慎勾选。
    </div>
    <div class="acts">
      <button class="btn btn-ghost" id="del-cancel">取消</button>
      <button class="btn btn-danger" id="del-confirm">确认删除</button>
    </div>
  </div>
</div>

<script>
  (function(){
  var wiz = window.qfsProfiles;
  // 注意：contextBridge 暴露的对象不可写，不能用它存状态（wiz.state = x 会静默失败）！
  var state = null;
  // 渲染层错误上报到主进程日志，便于排查
  window.addEventListener('error', function(e){ try { wiz.error(String(e.message || e)); } catch(_){} });
  window.addEventListener('unhandledrejection', function(e){ try { wiz.error('promise: ' + String(e.reason)); } catch(_){} });
  var view = 'chooser';
  var step = 1;
  var avatar = null;        // null = 内置 logo；{dataUrl} = 自定义
  var customDir = null;     // 自定义数据目录（inspect.dataDir）
  var sourcePick = null;    // 导入来源 {path, inspect}
  var deletingId = null;
  var ICON = {
    folder: '${ICONS.folder}',
    db: '${ICONS.database}',
    cookie: '${ICONS.shield}',
    upload: '${ICONS.import}',
    cover: '${ICONS.image}',
    chunk: '${ICONS.database}',
    frames: '${ICONS.image}',
  };
  var LABELS = { db:'数据库', cookiesFile:'账号 Cookie', cookies:'浏览器会话',
    uploads:'素材上传记录', thumbnails:'封面图片', covers:'封面缓存',
    upload_chunks:'上传分片缓存', frames:'抽帧图片', materials:'素材库文件',
    videoFile:'视频文件', s3_video_cache:'S3 视频缓存' };
  var KINDIC = { db:'db', cookiesFile:'cookie', cookies:'cookie', uploads:'upload',
    thumbnails:'cover', covers:'cover', upload_chunks:'chunk', frames:'frames',
    materials:'folder', videoFile:'folder', s3_video_cache:'db' };

  function $(id){ return document.getElementById(id); }
  function show(el,on){ el.classList.toggle('hide',!on); }
  function setStep(n){
    step = n;
    document.querySelectorAll('.steps .st').forEach(function(s){
      var k = +s.dataset.step;
      s.classList.toggle('on', k===n);
      s.classList.toggle('done', k<n);
      s.querySelector('.n').innerHTML = k<n ? '${ICONS.check.replace(/"/g,'&quot;').replace(/\n/g,'')}' : String(k);
    });
    show($('cs1'), n===1); show($('cs2'), n===2); show($('cs3'), n===3);
    show($('back'), n===2);
    var nx = $('next');
    nx.classList.toggle('btn-primary', true);
    nx.textContent = n===1 ? '下一步' : (n===2 ? (hasSource()? '导入并完成' : '完成创建') : '进入千帆云递');
    updateNext();
  }
  function hasSource(){ return !!(sourcePick && sourcePick.inspect && sourcePick.inspect.ok); }
  function updateNext(){
    var nx = $('next');
    if (view === 'chooser') { nx.disabled = true; return; }
    if (step === 1) { nx.disabled = !$('f-name').value.trim(); nx.title = nx.disabled?'请先填写账户名称':''; }
    else if (step === 2) {
      var useCustom = $('use-custom-dir').checked;
      var ok = !useCustom || (customDir !== null);
      nx.disabled = !ok; nx.title = ok?'':'请选择自定义数据目录';
    } else { nx.disabled = false; }
  }
  $('f-name').addEventListener('input', updateNext);
  $('use-custom-dir').addEventListener('change', function(){
    $('row-custom-dir').style.display = this.checked ? 'flex' : 'none';
    updateNext();
  });

  // ── 头像 ──
  function setAvatar(dataUrl){
    avatar = dataUrl ? { dataUrl: dataUrl } : null;
    $('av-prev').innerHTML = dataUrl ? '<img src="'+dataUrl+'">' : '${BRAND_AVATAR.replace(/\\n/g,"")}';
    $('av-upload').classList.toggle('on', !!dataUrl);
    $('av-builtin').classList.toggle('on', !dataUrl);
  }
  $('av-upload').addEventListener('click', async function(){
    var res = await wiz.pickAvatar();
    if (res && res.dataUrl) setAvatar(res.dataUrl);
  });
  $('av-builtin').addEventListener('click', function(){ setAvatar(null); });

  // ── 浏览目录 ──
  $('pick-custom').addEventListener('click', async function(e){
    e.stopPropagation();
    var res = await wiz.pick('custom');
    if (res && !res.canceled && res.path) {
      customDir = res.inspect.ok ? res.inspect.dataDir : null;
      $('f-custom-dir').value = res.path;
      var h = $('hint-dir');
      if (res.inspect.ok && res.inspect.kind === 'data' && res.path === res.inspect.dataDir) {
        h.className='hint ok'; h.textContent = res.inspect.message;
      } else if (res.inspect.ok) {
        h.className='hint err';
        h.textContent = '该目录已有数据（含 db/database.db），作为新账户目录会冲突，请选择空目录';
        customDir = null;
      } else {
        h.className='hint ok'; h.textContent = '将使用该目录作为数据目录（空目录，全新开始）';
      }
      updateNext();
    }
  });
  $('pick-source').addEventListener('click', async function(e){
    e.stopPropagation();
    var res = await wiz.pick('source');
    if (res && !res.canceled && res.path) {
      sourcePick = res;
      $('f-source').value = res.path;
      var h = $('hint-source');
      h.className = 'hint ' + (res.inspect.ok ? 'ok' : 'err');
      h.textContent = res.inspect.message;
    }
  });

  // ── 视图切换 ──
  function showView(v){
    view = v;
    show($('view-chooser'), v==='chooser');
    show($('view-create'), v==='create');
    if (v==='chooser'){ renderCards(); $('hd-title').textContent='选择账户'; $('hd-sub').textContent='每个账户拥有独立的数据目录，数据彼此隔离'; $('next').disabled = true; }
    else { $('hd-title').textContent='创建账户'; $('hd-sub').textContent='为新账户设置名称、头像与数据目录'; setStep(1); }
  }

  function avatarHtml(p){
    return p.avatar ? '<img src="'+p.avatarDataUrl+'">' : '${BRAND_AVATAR.replace(/\\n/g,"")}';
  }
  function renderCards(){
    var wrap = $('cards'); wrap.innerHTML = '';
    ((state && state.profiles) || []).forEach(function(p){
      var d = document.createElement('div'); d.className='pcard';
      d.innerHTML = '<div class="del" title="删除账户">${ICONS.trash}</div>'
        + '<div class="avatar">'+avatarHtml(p)+'</div>'
        + '<div class="nm"></div><div class="dir"></div>';
      d.querySelector('.nm').textContent = p.name;
      d.querySelector('.dir').textContent = p.dataDir;
      d.querySelector('.dir').title = p.dataDir;
      d.addEventListener('click', function(ev){
        if (ev.target.closest('.del')) return;
        wiz.launch(p.id);
      });
      d.querySelector('.del').addEventListener('click', function(ev){
        ev.stopPropagation(); openDelete(p);
      });
      wrap.appendChild(d);
    });
    var n = document.createElement('div'); n.className='pcard new';
    n.innerHTML = '<div class="plus">${ICONS.userPlus}</div><div class="nm">新建账户</div>'
      + '<div class="dir">独立数据目录，互不干扰</div>';
    n.addEventListener('click', function(){ resetCreate(); showView('create'); });
    wrap.appendChild(n);
  }

  // ── 删除 ──
  function openDelete(p){
    deletingId = p.id;
    $('del-name').textContent = p.name + '（' + p.dataDir + '）';
    $('del-data').checked = false;
    $('del-warn').classList.remove('show');
    $('del-confirm').disabled = false;
    $('del-mask').classList.add('show');
  }
  $('del-data').addEventListener('change', function(){
    $('del-warn').classList.toggle('show', this.checked);
  });
  $('del-cancel').addEventListener('click', function(){ $('del-mask').classList.remove('show'); });
  $('del-confirm').addEventListener('click', async function(){
    if (!deletingId) return;
    this.disabled = true;
    await wiz.del(deletingId, $('del-data').checked);
    this.disabled = false;
    $('del-mask').classList.remove('show');
    state = await wiz.gateState();
    renderCards();
    if ((state.profiles||[]).length === 0) showView('create');
  });

  // ── 创建流程 ──
  function resetCreate(){
    $('f-name').value=''; setAvatar(null); customDir=null; sourcePick=null;
    $('use-custom-dir').checked=false; $('row-custom-dir').style.display='none';
    $('f-custom-dir').value=''; $('f-source').value='';
    $('hint-dir').className='hint'; $('hint-source').className='hint';
    setStep(1);
  }
  $('back').addEventListener('click', function(){
    if (view==='create' && step===2) setStep(1);
  });
  $('next').addEventListener('click', async function(){
    var nx = $('next');
    if (view==='chooser') return;
    if (step===1){
      if (!$('f-name').value.trim()) return;
      setStep(2); return;
    }
    if (step===2){
      var useCustom = $('use-custom-dir').checked;
      if (useCustom && !customDir){ nx.disabled=false; return; }
      var hasSrc = hasSource();
      // 立即切到步骤 3 显示加载动画（否则导入期间界面停在步骤 2，看起来像卡死）
      setStep(3);
      nx.disabled = true; // 导入期间锁定，防止中途点「进入」
      show($('imp-done'),false); show($('imp-prog'),true);
      if (!hasSrc){
        document.querySelector('#cs3 .prog h3').textContent = '正在创建账户…';
        $('ptext').textContent = '正在初始化数据目录…';
      }
      wiz.onProgress(function(info){
        $('bar').style.width = info.pct+'%';
        $('ptext').textContent = '已复制 '+info.copied+' / '+info.total+' 个文件（'+info.pct+'%）';
      });
      var res = await wiz.create({
        name: $('f-name').value.trim(),
        avatarDataUrl: avatar ? avatar.dataUrl : null,
        dataDir: useCustom ? customDir : null,
        sourceDir: hasSrc ? sourcePick.inspect.dataDir : null,
      });
      show($('imp-prog'),false); show($('imp-done'),true);
      if (!res || !res.ok){
        $('sum-wrap').innerHTML = '<div class="hint err" style="display:block">'+ (res&&res.error||'创建失败') +'</div>';
        nx.disabled = false; nx.textContent = '返回修改';
        nx.onclick = function(){ resetCreate(); showView('create'); setStep(2); nx.onclick=null; };
        return;
      }
      renderSummary(res);
      nx.disabled = false; nx.textContent = '进入千帆云递';
      nx.onclick = function(){ wiz.launch(res.profile.id); };
      return;
    }
    if (step===3 && window.__lastCreated){ wiz.launch(window.__lastCreated); }
  });

  function renderSummary(res){
    window.__lastCreated = res.profile;
    var items = (res.import && res.import.items) || [];
    var html = '';
    if (res.import && res.import.ok && items.length > 0){
      html += '<p style="font-size:12.5px;color:#475569;margin-top:10px">已从旧数据导入以下内容：</p><div class="sum-list">';
      items.forEach(function(it){
        html += '<div class="sum-item"><span class="ic">'+(ICON[KINDIC[it.dir]]||ICON.folder)+'</span>'
          + '<span class="lb">'+(LABELS[it.dir]||it.dir)+'</span>'
          + '<span class="ct">'+it.files+' 项</span>'
          + '<span style="font-size:11px;color:var(--muted)">'+(it.bytes/1048576).toFixed(1)+' MB</span></div>';
      });
      html += '<div class="sum-item" style="background:rgba(37,99,235,.05);border-color:rgba(37,99,235,.25)">'
        + '<span class="ic">${ICONS.check}</span><span class="lb"><b>合计</b></span>'
        + '<span class="ct">'+res.import.copiedFiles+' 项</span>'
        + '<span style="font-size:11px;color:var(--brand);font-weight:600">'+(res.import.copiedBytes/1048576).toFixed(1)+' MB</span></div></div>';
    } else {
      html += '<p style="font-size:12.5px;color:#475569;margin-top:10px">未导入旧数据，账户将从空白开始。</p>';
    }
    html += '<div class="tip">数据目录：'+ (res.profile?res.profile.dataDir:'') +'</div>';
    $('sum-wrap').innerHTML = html;
  }

  // ── 启动 ──
  (async function init(){
    // gateState 失败不应卡死向导：创建流程不依赖 state（它只影响选择卡片的渲染）
    try {
      state = await wiz.gateState();
    } catch (e) {
      try { wiz.error('gateState failed: ' + String(e)); } catch(_2){}
    }
    if (((state && state.profiles) || []).length === 0){ resetCreate(); showView('create'); }
    else { showView('chooser'); }
  })();
  })();
</script></body></html>`;
}

// ──────────── 窗口与 IPC ────────────

function avatarToDataUrl(profile: Profile): string | null {
  if (!profile.avatar) return null;
  try {
    const abs = path.join(app.getPath('userData'), profile.avatar);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,` + fs.readFileSync(abs).toString('base64');
  } catch { return null; }
}

/** 安全检查：拒绝删除根目录 / userData 本体 */
function isUnsafeDataDir(dir: string): boolean {
  const norm = path.resolve(dir).toLowerCase();
  if (path.parse(norm).root === norm) return true;
  const ud = path.resolve(app.getPath('userData')).toLowerCase();
  if (norm === ud || norm === path.join(ud, 'profiles').toLowerCase()) return true;
  return false;
}

let gateIpcRegistered = false;

function registerGateIpc(): void {
  ipcMain.handle('profiles:gateState', () => {
    const reg = readRegistry();
    return {
      lastUsed: reg.lastUsed,
      profiles: reg.profiles.map(p => ({ ...p, avatarDataUrl: avatarToDataUrl(p) })),
    };
  });

  ipcMain.handle('profiles:pickAvatar', async () => {
    const win = gateWindow;
    if (!win) return { canceled: true };
    const res = await dialog.showOpenDialog(win, {
      title: '选择头像图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    try {
      const buf = fs.readFileSync(res.filePaths[0]);
      if (buf.length > 8 * 1024 * 1024) return { canceled: true, error: '图片超过 8MB' };
      const ext = path.extname(res.filePaths[0]).slice(1).toLowerCase();
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return { canceled: false, dataUrl: `data:image/${mime};base64,` + buf.toString('base64') };
    } catch (e) {
      return { canceled: true, error: String(e) };
    }
  });

  ipcMain.handle('profiles:inspect', (_e, p: string) => inspectDir(p));

  ipcMain.handle('profiles:pickDir', async (_e, kind: 'custom' | 'source') => {
    const win = gateWindow;
    if (!win) return { canceled: true };
    const res = await dialog.showOpenDialog(win, {
      title: kind === 'custom' ? '选择数据目录' : '选择数据来源项目文件夹',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    const selected = res.filePaths[0];
    const inspect = inspectDir(selected);
    if (kind === 'custom' && !inspect.ok) {
      const existsDir = fs.existsSync(selected) && fs.statSync(selected).isDirectory();
      if (existsDir) {
        return {
          canceled: false, path: selected, ok: true,
          inspect: { ok: true, kind: 'data', dataDir: selected, message: '将使用该目录作为数据目录（当前为空，全新开始）' },
        };
      }
    }
    return { canceled: false, path: selected, inspect, ok: inspect.ok };
  });

  ipcMain.handle('profiles:create', async (_e, payload: {
    name: string; avatarDataUrl?: string | null; dataDir?: string | null; sourceDir?: string | null;
  }) => {
    try {
      const name = (payload.name || '').trim();
      if (!name) return { ok: false, error: '账户名称不能为空' };
      const reg = readRegistry();
      if (reg.profiles.some(p => p.name === name)) {
        return { ok: false, error: `账户名称「${name}」已存在，请换一个名字` };
      }
      const id = newProfileId();
      const dataDir = payload.dataDir || defaultProfileDataDir(id);
      if (targetHasData(dataDir)) {
        return { ok: false, error: `所选数据目录已有数据（${path.join(dataDir, 'db', 'database.db')}），请换一个空目录` };
      }
      fs.mkdirSync(dataDir, { recursive: true });
      const avatar = payload.avatarDataUrl ? saveAvatar(id, payload.avatarDataUrl) : null;
      const profile: Profile = {
        id, name, avatar, dataDir,
        createdAt: new Date().toISOString(),
      };
      let importResult: ImportResult | null = null;
      if (payload.sourceDir) {
        const ins = inspectDir(payload.sourceDir);
        if (!ins.ok) {
          return { ok: false, error: `导入来源无效：${ins.message}` };
        }
        importResult = await importData(ins.dataDir, dataDir, (info) => {
          gateWindow?.webContents.send('profiles:import-progress', info);
        });
        if (!importResult.ok) {
          return { ok: false, error: importResult.error, profile };
        }
      }
      reg.profiles.push(profile);
      reg.lastUsed = id;
      writeRegistry(reg);
      log(`[profiles] 账户已创建: ${name} (${id}) dataDir=${dataDir}`);
      return { ok: true, profile, import: importResult || undefined };
    } catch (e) {
      log(`[profiles] 创建失败: ${e}`);
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('profiles:delete', async (_e, id: string, deleteData: boolean) => {
    try {
      const reg = readRegistry();
      const idx = reg.profiles.findIndex(p => p.id === id);
      if (idx === -1) return { ok: false, error: '账户不存在', profiles: reg.profiles };
      const p = reg.profiles[idx];
      if (deleteData) {
        if (isUnsafeDataDir(p.dataDir)) {
          return { ok: false, error: '该数据目录受保护，不能删除', profiles: reg.profiles };
        }
        log(`[profiles] 删除账户 ${p.name} 及其数据目录: ${p.dataDir}`);
        fs.rmSync(p.dataDir, { recursive: true, force: true });
      } else {
        log(`[profiles] 删除账户 ${p.name}（保留数据目录 ${p.dataDir}）`);
      }
      if (p.avatar) {
        try { fs.rmSync(path.join(app.getPath('userData'), p.avatar), { force: true }); } catch {}
      }
      reg.profiles.splice(idx, 1);
      if (reg.lastUsed === id) reg.lastUsed = reg.profiles[0]?.id || null;
      writeRegistry(reg);
      return { ok: true, profiles: reg.profiles };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.on('profiles:error', (_e, msg: string) => {
    log('[profiles-js] 渲染层错误:', msg);
  });

  ipcMain.on('profiles:close', () => {
    gateWindow?.close();
  });

  ipcMain.on('profiles:launch', (_e, id: string) => {
    const p = getProfile(id);
    if (!p) return;
    const reg = readRegistry();
    reg.lastUsed = id;
    const me = reg.profiles.find(x => x.id === id);
    if (me) me.lastUsedAt = new Date().toISOString();
    writeRegistry(reg);
    completed = true;
    launchedProfile = p;
    log(`[profiles] 本次启动账户: ${p.name} (${p.id}) dataDir=${p.dataDir}`);
    gateWindow?.close();
  });
}

// ──────────── 窗口 ────────────

export function runProfileGate(onDone: (profile: Profile) => void): void {
  gateDone = onDone;
  completed = false;
  launchedProfile = null;

  // IPC 只注册一次（切换账户会多次进入门控，重复 handle 会抛异常）
  if (!gateIpcRegistered) {
    registerGateIpc();
    gateIpcRegistered = true;
  }

  gateWindow = new BrowserWindow({
    width: 880,
    height: 640,
    resizable: false,
    title: '千帆云递 · 账户',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  gateWindow.removeMenu();
  gateWindow.once('ready-to-show', () => gateWindow?.show());
  // 渲染层 console / 加载失败 → 主进程日志（排查向导页面问题用）
  gateWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log(`[gate-console][L${level}] ${message} (${path.basename(String(sourceId))}:${line})`);
  });
  gateWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log(`[gate] 页面加载失败 code=${code} ${desc} url=${url}`);
  });
  gateWindow.on('closed', () => {
    gateWindow = null;
    const done = gateDone;
    gateDone = null;
    if (!completed) {
      // 未选择/未创建就关窗：视为退出应用（避免在未知数据目录上启动服务）
      log('[profiles] 账户窗口被直接关闭，退出应用');
      app.exit(0);
      return;
    }
    if (done && launchedProfile) done(launchedProfile);
  });

  gateWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(gateHtml()));
  log('[profiles] 账户门控窗口已显示');
}

/** 在主界面注入右下角齿轮悬浮按钮 + 圆盘菜单（切换账户 / 开启 MCP），外壳层不侵入前端代码 */
export function injectHubButton(
  win: BrowserWindow,
  profileName: string,
  mcp: { running: boolean; port: number | null },
): void {
  const mcpStatus = mcp.running
    ? `已开启 · 端口 ${mcp.port}`
    : '未开启';
  const js = `(function(){
    try {
      var old = document.getElementById('qfs-hub');
      if (old) old.remove();
      var css = document.createElement('style');
      css.textContent = [
        '#qfs-hub{position:fixed;right:16px;bottom:16px;z-index:9999;',
          "font-family:'Microsoft YaHei',system-ui,sans-serif;user-select:none}",
        '#qfs-hub .fab{width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;',
          'background:rgba(15,23,42,0.82);color:#fff;display:flex;align-items:center;justify-content:center;',
          'box-shadow:0 6px 20px rgba(2,6,23,.3);transition:transform .2s,background .15s;margin-left:auto}',
        '#qfs-hub .fab:hover{background:rgba(37,99,235,.95);transform:rotate(45deg)}',
        '#qfs-hub .menu{position:absolute;right:0;bottom:56px;display:flex;flex-direction:column;gap:8px;',
          'align-items:flex-end;pointer-events:none}',
        '#qfs-hub.open .menu{pointer-events:auto}',
        '#qfs-hub .mi{opacity:0;transform:translateY(10px) scale(.9);transition:all .18s ease;',
          'display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:12px;',
          'background:rgba(15,23,42,0.82);color:#fff;font-size:12px;cursor:pointer;',
          'box-shadow:0 6px 20px rgba(2,6,23,.25);backdrop-filter:blur(6px);white-space:nowrap}',
        '#qfs-hub.open .mi{opacity:1;transform:translateY(0) scale(1)}',
        '#qfs-hub .mi:hover{background:rgba(37,99,235,.95)}',
        '#qfs-hub #qfs-mi-mcp{padding-right:20px}',
        '#qfs-hub .mi svg{width:14px;height:14px;flex-shrink:0}',
        '#qfs-hub .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}',
        '#qfs-hub .dot.off{background:#94a3b8}',
        '#qfs-hub .dot.on{background:#22c55e;box-shadow:0 0 6px #22c55e}',
        '#qfs-hub .sub{font-size:10px;opacity:.75}',
      ].join('');
      document.head.appendChild(css);

      var hub = document.createElement('div');
      hub.id = 'qfs-hub';
      var gear = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06' +
        'a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33' +
        'l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09' +
        'A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33' +
        'H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06' +
        'a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09' +
        'a1.65 1.65 0 0 0-1.51 1z"/></svg>';
      var userIc = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
      var zapIc = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 13 2"/></svg>';

      hub.innerHTML =
        '<div class="menu">' +
          '<div class="mi" id="qfs-mi-switch">' + userIc + '<span>切换账户</span>' +
            '<span class="sub">' + ${JSON.stringify(profileName)} + '</span></div>' +
          '<div class="mi" id="qfs-mi-mcp">' + zapIc + '<span id="qfs-mcp-label">开启 MCP</span>' +
            '<span class="dot" id="qfs-mcp-dot"></span>' +
            '<span class="sub" id="qfs-mcp-sub"></span></div>' +
        '</div>' +
        '<button class="fab" id="qfs-fab" title="快捷操作">' + gear + '</button>';
      document.body.appendChild(hub);

      var mcpState = ${JSON.stringify({ running: mcp.running, port: mcp.port })};
      function renderMcp(){
        var dot = document.getElementById('qfs-mcp-dot');
        var sub = document.getElementById('qfs-mcp-sub');
        var label = document.getElementById('qfs-mcp-label');
        if (mcpState.running) {
          dot.className = 'dot on';
          sub.textContent = '已开启 · 端口 ' + mcpState.port;
          label.textContent = '关闭 MCP';
        } else {
          dot.className = 'dot off';
          sub.textContent = '未开启';
          label.textContent = '开启 MCP';
        }
      }
      renderMcp();

      var open = false;
      document.getElementById('qfs-fab').addEventListener('click', function(){
        open = !open;
        hub.classList.toggle('open', open);
      });
      document.getElementById('qfs-mi-switch').addEventListener('click', function(){
        if (window.qfsShell && window.qfsShell.switchProfile) {
          hub.classList.remove('open');
          window.qfsShell.switchProfile();
        }
      });
      document.getElementById('qfs-mi-mcp').addEventListener('click', async function(){
        if (!(window.qfsShell && window.qfsShell.toggleMcp)) return;
        var sub = document.getElementById('qfs-mcp-sub');
        sub.textContent = '切换中…';
        var res = await window.qfsShell.toggleMcp();
        if (res && res.ok) {
          mcpState = { running: !!res.running, port: res.port || null };
          renderMcp();
        } else {
          sub.textContent = '失败：' + ((res && res.error) || '未知错误');
        }
      });
    } catch (e) { console.error('[qfs-hub]', e); }
  })()`;
  win.webContents.executeJavaScript(js).catch((e) => log('[hub] 注入失败:', String(e)));
}

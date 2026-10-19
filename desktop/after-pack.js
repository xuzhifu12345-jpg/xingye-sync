/**
 * electron-builder afterPack 钩子：把「千」字图标嵌入主 exe。
 *
 * 背景：win.signAndEditExecutable=false 跳过了内置 rcedit（其依赖的
 * winCodeSign 在无符号链接权限的机器上解压失败），改由本钩子用仓库内
 * rcedit-x64.exe + app-builder icon 转换完成同等效果。
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const desktopDir = __dirname;
  const appBuilder = path.join(desktopDir, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
  const rcedit = path.join(desktopDir, 'build', 'tools', 'rcedit-x64.exe');
  const iconPng = path.join(desktopDir, 'build', 'icon.png');
  const icoDir = path.join(context.outDir, '.icon-ico');

  if (!fs.existsSync(iconPng)) {
    console.warn('[after-pack] build/icon.png 不存在，跳过图标嵌入');
    return;
  }
  fs.mkdirSync(icoDir, { recursive: true });

  // PNG → ICO（app-builder 本地转换，无网络依赖）
  execFileSync(appBuilder, [
    'icon', '--format', 'ico',
    '--root', path.join(desktopDir, 'build'),
    '--root', desktopDir,
    '--out', icoDir,
    '--input', iconPng,
  ], { stdio: 'inherit' });

  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');
  const ico = path.join(icoDir, 'icon.ico');
  execFileSync(rcedit, [exe, '--set-icon', ico], { stdio: 'inherit' });
  console.log('[after-pack] icon embedded →', exe);
};

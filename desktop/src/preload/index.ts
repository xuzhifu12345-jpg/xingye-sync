import { contextBridge, ipcRenderer } from 'electron';

// P0 最小能力集；P3 扩展 restartBackend/pickPath/checkUpdate/exportDiagnostics
contextBridge.exposeInMainWorld('qfsShell', {
  platform: process.platform,
  shellVersion: '1.3.0-alpha.1',
  ping: () => ipcRenderer.invoke('qfs:ping'),
  switchProfile: () => ipcRenderer.invoke('app:switch-profile'),
  toggleMcp: () => ipcRenderer.invoke('app:mcp-toggle'),
});

// 启动账户门控（选择/创建/删除），仅门控窗口使用
contextBridge.exposeInMainWorld('qfsProfiles', {
  __preloadLoaded: true,
  gateState: () => ipcRenderer.invoke('profiles:gateState'),
  pickAvatar: () => ipcRenderer.invoke('profiles:pickAvatar'),
  pick: (kind: 'custom' | 'source') => ipcRenderer.invoke('profiles:pickDir', kind),
  inspect: (p: string) => ipcRenderer.invoke('profiles:inspect', p),
  create: (payload: unknown) => ipcRenderer.invoke('profiles:create', payload),
  del: (id: string, deleteData: boolean) => ipcRenderer.invoke('profiles:delete', id, deleteData),
  launch: (id: string) => ipcRenderer.send('profiles:launch', id),
  close: () => ipcRenderer.send('profiles:close'),
  error: (msg: string) => ipcRenderer.send('profiles:error', msg),
  onProgress: (cb: (info: { copied: number; total: number; pct: number }) => void) => {
    ipcRenderer.on('profiles:import-progress', (_e, info) => cb(info));
  },
});

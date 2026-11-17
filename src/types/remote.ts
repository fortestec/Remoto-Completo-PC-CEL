export type HostMode = 'local' | 'paired';

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  osRelease: string;
  username: string;
  homeDir: string;
  uptimeSeconds: number;
  cpuModel: string;
  cpuCores: number;
  cpuUsagePercent: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  disks: Array<{
    mount: string;
    label: string;
    totalBytes: number;
    usedBytes: number;
  }>;
  networkInterfaces: Array<{
    name: string;
    address: string;
  }>;
  battery: {
    hasBattery: boolean;
    percent: number;
    charging: boolean;
  };
  capabilities: {
    realDesktopControls: boolean;
    screenCapture: boolean;
    inputControl: boolean;
  };
}

export interface ControlState {
  volume: number;
  muted: boolean;
  brightness: number;
  wifiEnabled: boolean;
  doNotDisturb: boolean;
  media: {
    title: string;
    artist: string;
    app: string;
    playing: boolean;
  };
  clipboard: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
  modifiedAt: string;
  extension: string;
}

export interface FileListResult {
  currentPath: string;
  parentPath: string | null;
  separator: string;
  roots: Array<{ label: string; path: string }>;
  entries: FileEntry[];
}

export interface FileReadResult {
  path: string;
  name: string;
  mimeType: string;
  isText: boolean;
  isImage: boolean;
  content: string; // utf-8 text or base64 for image/binary
  sizeBytes: number;
}

export interface AppShortcut {
  id: string;
  name: string;
  category: string;
  command: string;
  accent: string;
}

export interface WindowItem {
  id: string;
  title: string;
  appName: string;
  pid: number;
  minimized: boolean;
  focused: boolean;
}

export interface ProcessItem {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
}

export interface TerminalExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  durationMs: number;
}

export interface ScreenFrameResult {
  available: boolean;
  mimeType: string;
  dataBase64: string;
  width: number;
  height: number;
  note?: string;
}

export interface RpcRequest {
  hostMode: HostMode;
  pairingCode?: string;
  method: string;
  params?: Record<string, unknown>;
}

import { exec, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  AppShortcut,
  ControlState,
  FileEntry,
  FileListResult,
  FileReadResult,
  ProcessItem,
  ScreenFrameResult,
  SystemInfo,
  TerminalExecResult,
  WindowItem,
} from '../types/remote.ts';

const execAsync = promisify(exec);

const controlState: ControlState = {
  volume: 68,
  muted: false,
  brightness: 82,
  wifiEnabled: true,
  doNotDisturb: false,
  media: {
    title: 'Nenhuma mídia local em reprodução',
    artist: 'Controle ativo quando pareado ao PC',
    app: 'Sistema de Áudio',
    playing: false,
  },
  clipboard: 'Texto de exemplo sincronizado com o MobiHost.',
};

const localWindows: WindowItem[] = [
  { id: 'win-1', title: 'MobiHost — Workspace Local', appName: 'Node.js Runtime', pid: process.pid, minimized: false, focused: true },
  { id: 'win-2', title: 'Explorador de Diretórios', appName: 'Files', pid: process.pid + 12, minimized: false, focused: false },
];

const defaultShortcuts: AppShortcut[] = [
  { id: 'app-terminal', name: 'Terminal', category: 'Sistema', command: 'echo "Terminal iniciado"', accent: 'blue' },
  { id: 'app-files', name: 'Arquivos', category: 'Sistema', command: 'ls -la', accent: 'amber' },
  { id: 'app-node', name: 'Node Status', category: 'Desenvolvimento', command: 'node -v', accent: 'emerald' },
  { id: 'app-disk', name: 'Uso de Disco', category: 'Utilitários', command: 'df -h', accent: 'indigo' },
];

let lastCpuTimes = os.cpus().map((c) => ({ ...c.times }));

function computeCpuPercent(): number {
  const current = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;
  for (let i = 0; i < current.length; i++) {
    const prev = lastCpuTimes[i] ?? current[i].times;
    const curr = current[i].times;
    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }
  lastCpuTimes = current.map((c) => ({ ...c.times }));
  if (totalDiff <= 0) return 14;
  const usage = Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
  return Math.max(1, Math.min(100, usage));
}

async function getDiskInfo(): Promise<SystemInfo['disks']> {
  try {
    const { stdout } = await execAsync('df -B1 /', { timeout: 2500 });
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].trim().split(/\s+/);
      const total = Number(parts[1]) || 0;
      const used = Number(parts[2]) || 0;
      return [{ mount: '/', label: 'Sistema (/)', totalBytes: total, usedBytes: used }];
    }
  } catch {
    // fallback below
  }
  return [{ mount: '/', label: 'Sistema (/)', totalBytes: 64 * 1024 ** 3, usedBytes: 18 * 1024 ** 3 }];
}

function getNetworkAddrs(): SystemInfo['networkInterfaces'] {
  const nets = os.networkInterfaces();
  const list: SystemInfo['networkInterfaces'] = [];
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        list.push({ name, address: addr.address });
      }
    }
  }
  return list.length > 0 ? list : [{ name: 'lo', address: '127.0.0.1' }];
}

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.xml',
  '.yaml', '.yml', '.toml', '.ini', '.env', '.example', '.sh', '.bash', '.py', '.log', '.csv', '.sql',
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.pdf': 'application/pdf',
  };
  return map[ext.toLowerCase()] || 'text/plain';
}

let terminalCwd = process.cwd();

export async function handleLocalRpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  switch (method) {
    case 'system.info': {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const disks = await getDiskInfo();
      const user = os.userInfo();
      return {
        hostname: os.hostname(),
        platform: `${os.type()} (${os.platform()})`,
        arch: os.arch(),
        osRelease: os.release(),
        username: user.username,
        homeDir: os.homedir(),
        uptimeSeconds: Math.floor(os.uptime()),
        cpuModel: os.cpus()[0]?.model || 'CPU',
        cpuCores: os.cpus().length,
        cpuUsagePercent: computeCpuPercent(),
        memoryTotalBytes: totalMem,
        memoryUsedBytes: totalMem - freeMem,
        disks,
        networkInterfaces: getNetworkAddrs(),
        battery: { hasBattery: false, percent: 100, charging: true },
        capabilities: {
          realDesktopControls: false,
          screenCapture: false,
          inputControl: false,
        },
      } satisfies SystemInfo;
    }

    case 'control.getState': {
      return controlState;
    }

    case 'control.volume': {
      const value = Number(params.value);
      if (!Number.isNaN(value)) {
        controlState.volume = Math.max(0, Math.min(100, Math.round(value)));
        if (controlState.volume > 0) controlState.muted = false;
      }
      return controlState;
    }

    case 'control.mute': {
      controlState.muted = typeof params.muted === 'boolean' ? params.muted : !controlState.muted;
      return controlState;
    }

    case 'control.brightness': {
      const value = Number(params.value);
      if (!Number.isNaN(value)) {
        controlState.brightness = Math.max(5, Math.min(100, Math.round(value)));
      }
      return controlState;
    }

    case 'control.toggleTile': {
      const tile = String(params.tile || '');
      if (tile === 'wifi') controlState.wifiEnabled = !controlState.wifiEnabled;
      if (tile === 'dnd') controlState.doNotDisturb = !controlState.doNotDisturb;
      return controlState;
    }

    case 'control.media': {
      const action = String(params.action || 'toggle');
      if (action === 'toggle') controlState.media.playing = !controlState.media.playing;
      if (action === 'play') controlState.media.playing = true;
      if (action === 'pause') controlState.media.playing = false;
      return controlState;
    }

    case 'control.power': {
      const action = String(params.action || 'lock');
      return { ok: true, action, message: `Comando "${action}" simulado no host de demonstração. Em um PC pareado, executa a ação real do sistema.` };
    }

    case 'clipboard.get': {
      return { text: controlState.clipboard };
    }

    case 'clipboard.set': {
      controlState.clipboard = String(params.text ?? '');
      return { ok: true, text: controlState.clipboard };
    }

    case 'fs.list': {
      const requested = typeof params.path === 'string' && params.path.trim() ? params.path : process.cwd();
      const targetPath = path.resolve(requested);
      const dirents = await fs.readdir(targetPath, { withFileTypes: true });
      const entries: FileEntry[] = [];
      for (const d of dirents) {
        if (d.name === 'node_modules' || d.name === '.git') {
          entries.push({
            name: d.name,
            path: path.join(targetPath, d.name),
            isDirectory: d.isDirectory(),
            sizeBytes: 0,
            modifiedAt: new Date().toISOString(),
            extension: '',
          });
          continue;
        }
        const full = path.join(targetPath, d.name);
        try {
          const stat = await fs.stat(full);
          entries.push({
            name: d.name,
            path: full,
            isDirectory: d.isDirectory(),
            sizeBytes: d.isDirectory() ? 0 : stat.size,
            modifiedAt: stat.mtime.toISOString(),
            extension: d.isDirectory() ? '' : path.extname(d.name),
          });
        } catch {
          // ignore unreadable entries
        }
      }
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const parent = path.dirname(targetPath);
      const roots = [
        { label: 'Workspace', path: process.cwd() },
        { label: 'Início', path: os.homedir() },
        { label: 'Raiz', path: '/' },
      ];
      return {
        currentPath: targetPath,
        parentPath: parent !== targetPath ? parent : null,
        separator: path.sep,
        roots,
        entries,
      } satisfies FileListResult;
    }

    case 'fs.read': {
      const filePath = path.resolve(String(params.path || ''));
      const stat = await fs.stat(filePath);
      if (stat.size > 5 * 1024 * 1024) {
        throw new Error('Arquivo excede 5 MB para visualização rápida.');
      }
      const ext = path.extname(filePath).toLowerCase();
      const isImage = IMAGE_EXTENSIONS.has(ext);
      const isText = TEXT_EXTENSIONS.has(ext) || (!isImage && stat.size < 256 * 1024);
      const buf = await fs.readFile(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        mimeType: guessMime(ext),
        isText,
        isImage,
        content: isText ? buf.toString('utf8') : buf.toString('base64'),
        sizeBytes: stat.size,
      } satisfies FileReadResult;
    }

    case 'fs.write': {
      const filePath = path.resolve(String(params.path || ''));
      const encoding = params.encoding === 'base64' ? 'base64' : 'utf8';
      const content = String(params.content ?? '');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(content, encoding));
      return { ok: true, path: filePath };
    }

    case 'fs.mkdir': {
      const dirPath = path.resolve(String(params.path || ''));
      await fs.mkdir(dirPath, { recursive: true });
      return { ok: true, path: dirPath };
    }

    case 'fs.rename': {
      const oldPath = path.resolve(String(params.oldPath || ''));
      const newPath = path.resolve(String(params.newPath || ''));
      await fs.rename(oldPath, newPath);
      return { ok: true, path: newPath };
    }

    case 'fs.delete': {
      const target = path.resolve(String(params.path || ''));
      if (target === '/' || target === process.cwd()) {
        throw new Error('Proteção ativa: diretório raiz não pode ser removido.');
      }
      await fs.rm(target, { recursive: true, force: true });
      return { ok: true };
    }

    case 'terminal.exec': {
      const command = String(params.command || '').trim();
      if (!command) {
        return { stdout: '', stderr: '', exitCode: 0, cwd: terminalCwd, durationMs: 0 } satisfies TerminalExecResult;
      }
      const started = Date.now();
      if (command.startsWith('cd ')) {
        const target = command.slice(3).trim().replace(/^~/, os.homedir());
        const resolved = path.resolve(terminalCwd, target);
        if (fsSync.existsSync(resolved) && fsSync.statSync(resolved).isDirectory()) {
          terminalCwd = resolved;
          return { stdout: '', stderr: '', exitCode: 0, cwd: terminalCwd, durationMs: Date.now() - started } satisfies TerminalExecResult;
        }
        return { stdout: '', stderr: `Diretório não encontrado: ${target}`, exitCode: 1, cwd: terminalCwd, durationMs: Date.now() - started } satisfies TerminalExecResult;
      }
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: terminalCwd, timeout: 12000, maxBuffer: 1024 * 512 });
        return { stdout, stderr, exitCode: 0, cwd: terminalCwd, durationMs: Date.now() - started } satisfies TerminalExecResult;
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
        return {
          stdout: e.stdout || '',
          stderr: e.stderr || e.message || 'Erro ao executar comando',
          exitCode: typeof e.code === 'number' ? e.code : 1,
          cwd: terminalCwd,
          durationMs: Date.now() - started,
        } satisfies TerminalExecResult;
      }
    }

    case 'apps.list': {
      return { shortcuts: defaultShortcuts };
    }

    case 'apps.launch': {
      const cmd = String(params.command || '').trim();
      const name = String(params.name || cmd);
      if (!cmd) throw new Error('Comando inválido.');
      try {
        const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
        child.unref();
      } catch {
        // ignore detached spawn errors
      }
      const newWin: WindowItem = {
        id: `win-${Date.now()}`,
        title: name,
        appName: name,
        pid: Math.floor(1000 + Math.random() * 8000),
        minimized: false,
        focused: true,
      };
      localWindows.forEach((w) => (w.focused = false));
      localWindows.unshift(newWin);
      return { ok: true, launched: name };
    }

    case 'windows.list': {
      return { windows: localWindows };
    }

    case 'windows.action': {
      const id = String(params.id || '');
      const action = String(params.action || 'focus');
      const idx = localWindows.findIndex((w) => w.id === id);
      if (idx !== -1) {
        if (action === 'close') {
          localWindows.splice(idx, 1);
        } else if (action === 'minimize') {
          localWindows[idx].minimized = !localWindows[idx].minimized;
          localWindows[idx].focused = false;
        } else {
          localWindows.forEach((w) => (w.focused = false));
          localWindows[idx].minimized = false;
          localWindows[idx].focused = true;
        }
      }
      return { windows: localWindows };
    }

    case 'processes.list': {
      try {
        const { stdout } = await execAsync('ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -n 30', { timeout: 3000 });
        const lines = stdout.trim().split('\n').slice(1);
        const totalMb = os.totalmem() / (1024 * 1024);
        const processes: ProcessItem[] = lines
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            const pid = Number(parts[0]);
            const cpu = Number(parts[1]) || 0;
            const memPct = Number(parts[2]) || 0;
            const name = parts.slice(3).join(' ') || 'process';
            return {
              pid,
              name,
              cpuPercent: cpu,
              memoryMb: Math.round((memPct / 100) * totalMb),
            };
          })
          .filter((p) => !Number.isNaN(p.pid));
        return { processes };
      } catch {
        return {
          processes: [
            { pid: process.pid, name: 'node server.ts', cpuPercent: 1.4, memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)) },
          ],
        };
      }
    }

    case 'processes.kill': {
      const pid = Number(params.pid);
      if (pid === process.pid || pid <= 1) {
        throw new Error('Processo principal protegido.');
      }
      process.kill(pid, 'SIGTERM');
      return { ok: true, pid };
    }

    case 'screen.capture': {
      return {
        available: false,
        mimeType: 'image/png',
        dataBase64: '',
        width: 1280,
        height: 720,
        note: 'Espelhamento de tela real disponível ao parear um computador Windows, macOS ou Linux com o agente MobiHost.',
      } satisfies ScreenFrameResult;
    }

    case 'input.mouseMove':
    case 'input.mouseClick':
    case 'input.mouseScroll':
    case 'input.typeText':
    case 'input.keyPress': {
      return { ok: true, simulated: true };
    }

    default:
      throw new Error(`Método RPC desconhecido: ${method}`);
  }
}

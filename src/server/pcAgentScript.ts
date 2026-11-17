export function buildPcAgentScript(wsUrl: string, pairingCode: string): string {
  return `#!/usr/bin/env node
/**
 * MobiHost PC Agent (Zero-Dependency)
 * Conecta seu computador (Windows, macOS ou Linux) ao aplicativo MobiHost no Android.
 * Requisitos: Node.js 18+ (recomendado Node 20/22).
 * Uso: node mobihost-agent.mjs
 */

import { exec, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const RELAY_WS_URL = process.env.MOBIHOST_URL || ${JSON.stringify(wsUrl)};
const PAIRING_CODE = process.env.MOBIHOST_CODE || ${JSON.stringify(pairingCode)};

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

let terminalCwd = os.homedir();
const controlState = {
  volume: 65,
  muted: false,
  brightness: 80,
  wifiEnabled: true,
  doNotDisturb: false,
  media: { title: 'Mídia do Computador', artist: os.hostname(), app: 'Sistema', playing: false },
  clipboard: '',
};

const SHORTCUTS = IS_WIN
  ? [
      { id: 'explorer', name: 'Explorador', category: 'Sistema', command: 'explorer.exe', accent: 'amber' },
      { id: 'cmd', name: 'PowerShell', category: 'Sistema', command: 'start powershell', accent: 'blue' },
      { id: 'chrome', name: 'Chrome', category: 'Internet', command: 'start chrome', accent: 'emerald' },
      { id: 'edge', name: 'Edge', category: 'Internet', command: 'start msedge', accent: 'cyan' },
      { id: 'code', name: 'VS Code', category: 'Desenvolvimento', command: 'code', accent: 'indigo' },
      { id: 'spotify', name: 'Spotify', category: 'Mídia', command: 'start spotify:', accent: 'green' },
      { id: 'calc', name: 'Calculadora', category: 'Utilitários', command: 'calc.exe', accent: 'slate' },
      { id: 'taskmgr', name: 'Tarefas', category: 'Sistema', command: 'taskmgr.exe', accent: 'rose' },
    ]
  : IS_MAC
  ? [
      { id: 'finder', name: 'Finder', category: 'Sistema', command: 'open -a Finder', accent: 'blue' },
      { id: 'terminal', name: 'Terminal', category: 'Sistema', command: 'open -a Terminal', accent: 'slate' },
      { id: 'safari', name: 'Safari', category: 'Internet', command: 'open -a Safari', accent: 'cyan' },
      { id: 'chrome', name: 'Chrome', category: 'Internet', command: 'open -a "Google Chrome"', accent: 'emerald' },
      { id: 'code', name: 'VS Code', category: 'Desenvolvimento', command: 'open -a "Visual Studio Code"', accent: 'indigo' },
      { id: 'spotify', name: 'Spotify', category: 'Mídia', command: 'open -a Spotify', accent: 'green' },
    ]
  : [
      { id: 'files', name: 'Arquivos', category: 'Sistema', command: 'xdg-open ~', accent: 'amber' },
      { id: 'terminal', name: 'Terminal', category: 'Sistema', command: 'x-terminal-emulator || gnome-terminal', accent: 'blue' },
      { id: 'browser', name: 'Navegador', category: 'Internet', command: 'xdg-open https://google.com', accent: 'emerald' },
      { id: 'code', name: 'VS Code', category: 'Desenvolvimento', command: 'code', accent: 'indigo' },
    ];

let lastCpu = os.cpus().map((c) => ({ ...c.times }));
function getCpuPercent() {
  const cur = os.cpus();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < cur.length; i++) {
    const p = lastCpu[i] || cur[i].times;
    const c = cur[i].times;
    idle += c.idle - p.idle;
    total += c.user + c.nice + c.sys + c.idle + c.irq - (p.user + p.nice + p.sys + p.idle + p.irq);
  }
  lastCpu = cur.map((c) => ({ ...c.times }));
  if (total <= 0) return 10;
  return Math.max(1, Math.min(100, Math.round(((total - idle) / total) * 100)));
}

async function runPs(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execAsync(\`powershell -NoProfile -NonInteractive -EncodedCommand \${encoded}\`, { timeout: 8000 });
  return stdout.trim();
}

async function getDisks() {
  try {
    if (IS_WIN) {
      const out = await runPs(\`Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null -or $_.Free -ne $null} | Select-Object Name,Used,Free | ConvertTo-Json\`);
      const parsed = JSON.parse(out || '[]');
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map((d) => ({
        mount: \`\${d.Name}:\\\\\`,
        label: \`Disco (\${d.Name}:)\`,
        totalBytes: (Number(d.Used) || 0) + (Number(d.Free) || 0),
        usedBytes: Number(d.Used) || 0,
      }));
    }
    const { stdout } = await execAsync('df -k /', { timeout: 3000 });
    const parts = stdout.trim().split('\\n')[1]?.trim().split(/\\s+/) || [];
    const total = (Number(parts[1]) || 0) * 1024;
    const used = (Number(parts[2]) || 0) * 1024;
    return [{ mount: '/', label: 'Disco (/)', totalBytes: total, usedBytes: used }];
  } catch {
    return [];
  }
}

async function getRoots() {
  const home = os.homedir();
  const base = [
    { label: 'Usuário', path: home },
    { label: 'Área de Trabalho', path: path.join(home, 'Desktop') },
    { label: 'Documentos', path: path.join(home, 'Documents') },
    { label: 'Downloads', path: path.join(home, 'Downloads') },
  ];
  if (IS_WIN) {
    try {
      const out = await runPs(\`(Get-PSDrive -PSProvider FileSystem).Root\`);
      for (const r of out.split(/\\r?\\n/).map((s) => s.trim()).filter(Boolean)) {
        base.push({ label: \`Disco \${r.replace('\\\\', '')}\`, path: r });
      }
    } catch {}
  } else {
    base.push({ label: 'Raiz /', path: '/' });
  }
  return base;
}

async function handleRpc(method, params = {}) {
  switch (method) {
    case 'system.info': {
      const nets = [];
      for (const [name, list] of Object.entries(os.networkInterfaces())) {
        for (const item of list || []) {
          if (item.family === 'IPv4' && !item.internal) nets.push({ name, address: item.address });
        }
      }
      return {
        hostname: os.hostname(),
        platform: \`\${os.type()} (\${os.platform()})\`,
        arch: os.arch(),
        osRelease: os.release(),
        username: os.userInfo().username,
        homeDir: os.homedir(),
        uptimeSeconds: Math.floor(os.uptime()),
        cpuModel: os.cpus()[0]?.model || 'CPU',
        cpuCores: os.cpus().length,
        cpuUsagePercent: getCpuPercent(),
        memoryTotalBytes: os.totalmem(),
        memoryUsedBytes: os.totalmem() - os.freemem(),
        disks: await getDisks(),
        networkInterfaces: nets,
        battery: { hasBattery: false, percent: 100, charging: true },
        capabilities: { realDesktopControls: true, screenCapture: true, inputControl: true },
      };
    }

    case 'control.getState': {
      try {
        if (IS_MAC) {
          const out = await execAsync('osascript -e "output volume of (get volume settings)"');
          controlState.volume = Number(out.stdout.trim()) || controlState.volume;
        }
      } catch {}
      return controlState;
    }

    case 'control.volume': {
      const val = Math.max(0, Math.min(100, Math.round(Number(params.value) || 0)));
      controlState.volume = val;
      controlState.muted = val === 0;
      if (IS_MAC) {
        await execAsync(\`osascript -e "set volume output volume \${val}"\`).catch(() => {});
      } else if (IS_WIN) {
        // Send volume steps via WScript.Shell / CoreAudio fallback
        await runPs(\`$obj = new-object -com wscript.shell; 1..50 | % {$obj.SendKeys([char]174)}; $steps = [math]::Round(\${val}/2); 1..$steps | % {$obj.SendKeys([char]175)}\`).catch(() => {});
      } else {
        await execAsync(\`pactl set-sink-volume @DEFAULT_SINK@ \${val}%\`).catch(() => {});
      }
      return controlState;
    }

    case 'control.mute': {
      controlState.muted = typeof params.muted === 'boolean' ? params.muted : !controlState.muted;
      if (IS_MAC) await execAsync(\`osascript -e "set volume output muted \${controlState.muted}"\`).catch(() => {});
      else if (IS_WIN) await runPs(\`(new-object -com wscript.shell).SendKeys([char]173)\`).catch(() => {});
      else await execAsync('pactl set-sink-mute @DEFAULT_SINK@ toggle').catch(() => {});
      return controlState;
    }

    case 'control.brightness': {
      const val = Math.max(5, Math.min(100, Math.round(Number(params.value) || 80)));
      controlState.brightness = val;
      if (IS_WIN) {
        await runPs(\`(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, \${val})\`).catch(() => {});
      } else if (IS_MAC) {
        await execAsync(\`brightness \${(val / 100).toFixed(2)}\`).catch(() => {});
      }
      return controlState;
    }

    case 'control.media': {
      const action = String(params.action || 'toggle');
      if (action === 'toggle') controlState.media.playing = !controlState.media.playing;
      if (IS_WIN) {
        const keyMap = { toggle: 179, next: 176, prev: 177 };
        const code = keyMap[action] || 179;
        await runPs(\`(new-object -com wscript.shell).SendKeys([char]\${code})\`).catch(() => {});
      } else if (IS_MAC) {
        const cmd = action === 'next' ? 'next track' : action === 'prev' ? 'previous track' : 'playpause';
        await execAsync(\`osascript -e 'tell application "Music" to \${cmd}'\`).catch(() => {});
      } else {
        const cmd = action === 'next' ? 'next' : action === 'prev' ? 'previous' : 'play-pause';
        await execAsync(\`playerctl \${cmd}\`).catch(() => {});
      }
      return controlState;
    }

    case 'control.power': {
      const action = String(params.action || 'lock');
      if (IS_WIN) {
        if (action === 'lock') await execAsync('rundll32.exe user32.dll,LockWorkStation');
        if (action === 'sleep') await execAsync('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
        if (action === 'restart') await execAsync('shutdown /r /t 5');
        if (action === 'shutdown') await execAsync('shutdown /s /t 5');
      } else if (IS_MAC) {
        if (action === 'lock') await execAsync('pmset displaysleepnow');
        if (action === 'sleep') await execAsync('pmset sleepnow');
      } else {
        if (action === 'lock') await execAsync('loginctl lock-session');
        if (action === 'sleep') await execAsync('systemctl suspend');
      }
      return { ok: true, action };
    }

    case 'clipboard.get': {
      try {
        if (IS_WIN) controlState.clipboard = await runPs('Get-Clipboard');
        else if (IS_MAC) controlState.clipboard = (await execAsync('pbpaste')).stdout;
        else controlState.clipboard = (await execAsync('xclip -o -selection clipboard || xsel -ob')).stdout;
      } catch {}
      return { text: controlState.clipboard };
    }

    case 'clipboard.set': {
      const text = String(params.text ?? '');
      controlState.clipboard = text;
      if (IS_WIN) {
        const b64 = Buffer.from(text, 'utf8').toString('base64');
        await runPs(\`[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('\${b64}')) | Set-Clipboard\`).catch(() => {});
      } else if (IS_MAC) {
        const p = spawn('pbcopy'); p.stdin.end(text);
      } else {
        const p = spawn('xclip', ['-selection', 'clipboard']); p.stdin.end(text);
      }
      return { ok: true, text };
    }

    case 'fs.list': {
      const target = path.resolve(String(params.path || os.homedir()));
      const dirents = await fs.readdir(target, { withFileTypes: true });
      const entries = [];
      for (const d of dirents) {
        const full = path.join(target, d.name);
        try {
          const st = await fs.stat(full);
          entries.push({
            name: d.name,
            path: full,
            isDirectory: d.isDirectory(),
            sizeBytes: d.isDirectory() ? 0 : st.size,
            modifiedAt: st.mtime.toISOString(),
            extension: d.isDirectory() ? '' : path.extname(d.name),
          });
        } catch {}
      }
      entries.sort((a, b) => (a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name)));
      const parent = path.dirname(target);
      return {
        currentPath: target,
        parentPath: parent !== target ? parent : null,
        separator: path.sep,
        roots: await getRoots(),
        entries,
      };
    }

    case 'fs.read': {
      const filePath = path.resolve(String(params.path || ''));
      const st = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext);
      const isText = ['.txt', '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.py', '.log', '.csv', '.ini', '.xml'].includes(ext) || (!isImage && st.size < 256 * 1024);
      const buf = await fs.readFile(filePath);
      return {
        path: filePath,
        name: path.basename(filePath),
        mimeType: isImage ? \`image/\${ext.slice(1) === 'jpg' ? 'jpeg' : ext.slice(1)}\` : 'text/plain',
        isText,
        isImage,
        content: isText ? buf.toString('utf8') : buf.toString('base64'),
        sizeBytes: st.size,
      };
    }

    case 'fs.write': {
      const filePath = path.resolve(String(params.path || ''));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, Buffer.from(String(params.content ?? ''), params.encoding === 'base64' ? 'base64' : 'utf8'));
      return { ok: true, path: filePath };
    }

    case 'fs.mkdir': {
      const dirPath = path.resolve(String(params.path || ''));
      await fs.mkdir(dirPath, { recursive: true });
      return { ok: true };
    }

    case 'fs.rename': {
      await fs.rename(path.resolve(String(params.oldPath || '')), path.resolve(String(params.newPath || '')));
      return { ok: true };
    }

    case 'fs.delete': {
      await fs.rm(path.resolve(String(params.path || '')), { recursive: true, force: true });
      return { ok: true };
    }

    case 'terminal.exec': {
      const command = String(params.command || '').trim();
      const started = Date.now();
      if (command.startsWith('cd ')) {
        const next = path.resolve(terminalCwd, command.slice(3).trim().replace(/^~/, os.homedir()));
        if (fsSync.existsSync(next) && fsSync.statSync(next).isDirectory()) {
          terminalCwd = next;
          return { stdout: '', stderr: '', exitCode: 0, cwd: terminalCwd, durationMs: Date.now() - started };
        }
      }
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: terminalCwd, timeout: 15000 });
        return { stdout, stderr, exitCode: 0, cwd: terminalCwd, durationMs: Date.now() - started };
      } catch (e) {
        return { stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.code || 1, cwd: terminalCwd, durationMs: Date.now() - started };
      }
    }

    case 'apps.list': {
      return { shortcuts: SHORTCUTS };
    }

    case 'apps.launch': {
      const cmd = String(params.command || '');
      const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true };
    }

    case 'windows.list': {
      if (IS_WIN) {
        try {
          const out = await runPs(\`Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json\`);
          const arr = JSON.parse(out || '[]');
          const list = (Array.isArray(arr) ? arr : [arr]).map((w, i) => ({
            id: String(w.Id),
            title: w.MainWindowTitle,
            appName: w.ProcessName,
            pid: w.Id,
            minimized: false,
            focused: i === 0,
          }));
          return { windows: list };
        } catch {}
      }
      return { windows: [] };
    }

    case 'windows.action': {
      const pid = Number(params.id);
      const action = String(params.action || 'focus');
      if (IS_WIN && pid) {
        if (action === 'close') await execAsync(\`taskkill /PID \${pid}\`).catch(() => {});
        if (action === 'focus') {
          await runPs(\`$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate(\${pid})\`).catch(() => {});
        }
      }
      return handleRpc('windows.list');
    }

    case 'processes.list': {
      if (IS_WIN) {
        try {
          const out = await runPs(\`Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 30 Id,ProcessName,@{Name='MemMB';Expression={[math]::Round($_.WorkingSet64/1MB)}} | ConvertTo-Json\`);
          const arr = JSON.parse(out || '[]');
          return {
            processes: (Array.isArray(arr) ? arr : [arr]).map((p) => ({
              pid: p.Id,
              name: p.ProcessName,
              cpuPercent: 0,
              memoryMb: p.MemMB || 0,
            })),
          };
        } catch {}
      }
      const { stdout } = await execAsync('ps -eo pid,pcpu,pmem,comm | head -n 30');
      const totalMb = os.totalmem() / (1024 * 1024);
      const processes = stdout.trim().split('\\n').slice(1).map((line) => {
        const parts = line.trim().split(/\\s+/);
        return { pid: Number(parts[0]), cpuPercent: Number(parts[1]) || 0, memoryMb: Math.round(((Number(parts[2]) || 0) / 100) * totalMb), name: parts.slice(3).join(' ') };
      });
      return { processes };
    }

    case 'processes.kill': {
      process.kill(Number(params.pid));
      return { ok: true };
    }

    case 'screen.capture': {
      const tmp = path.join(os.tmpdir(), \`mobihost-screen-\${Date.now()}.jpg\`);
      try {
        if (IS_WIN) {
          await runPs(\`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('\${tmp.replace(/\\\\/g, '\\\\\\\\')}',[System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $bmp.Dispose()\`);
        } else if (IS_MAC) {
          await execAsync(\`screencapture -x -t jpg "\${tmp}"\`);
        } else {
          await execAsync(\`import -window root "\${tmp}" || scrot "\${tmp}"\`);
        }
        const buf = await fs.readFile(tmp);
        await fs.unlink(tmp).catch(() => {});
        return { available: true, mimeType: 'image/jpeg', dataBase64: buf.toString('base64'), width: 1280, height: 720 };
      } catch (e) {
        return { available: false, mimeType: 'image/jpeg', dataBase64: '', width: 1280, height: 720, note: String(e.message || e) };
      }
    }

    case 'input.mouseMove': {
      const dx = Math.round(Number(params.dx) || 0);
      const dy = Math.round(Number(params.dy) || 0);
      if (IS_WIN) {
        await runPs(\`Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; [System.Windows.Forms.Cursor]::Position=New-Object System.Drawing.Point(($p.X + (\${dx})),($p.Y + (\${dy})))\`).catch(() => {});
      } else if (!IS_MAC) {
        await execAsync(\`xdotool mousemove_relative -- \${dx} \${dy}\`).catch(() => {});
      }
      return { ok: true };
    }

    case 'input.mouseClick': {
      const button = params.button === 'right' ? 'right' : 'left';
      if (IS_WIN) {
        await runPs(\`Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int flags,int dx,int dy,int cButtons,int info);' -Name U32 -Namespace W; [W.U32]::mouse_event(\${button === 'right' ? 0x08 : 0x02},0,0,0,0); [W.U32]::mouse_event(\${button === 'right' ? 0x10 : 0x04},0,0,0,0)\`).catch(() => {});
      } else if (!IS_MAC) {
        await execAsync(\`xdotool click \${button === 'right' ? 3 : 1}\`).catch(() => {});
      }
      return { ok: true };
    }

    case 'input.typeText': {
      const text = String(params.text || '');
      if (IS_WIN) {
        const escaped = text.replace(/'/g, "''");
        await runPs(\`(New-Object -ComObject wscript.shell).SendKeys('\${escaped}')\`).catch(() => {});
      } else if (!IS_MAC) {
        await execAsync(\`xdotool type -- \${JSON.stringify(text)}\`).catch(() => {});
      }
      return { ok: true };
    }

    case 'input.keyPress': {
      const key = String(params.key || 'Enter');
      if (IS_WIN) {
        const map = { Enter: '{ENTER}', Escape: '{ESC}', Tab: '{TAB}', Backspace: '{BACKSPACE}', 'Alt+Tab': '%{TAB}', 'Ctrl+C': '^c', 'Ctrl+V': '^v' };
        await runPs(\`(New-Object -ComObject wscript.shell).SendKeys('\${map[key] || key}')\`).catch(() => {});
      } else if (!IS_MAC) {
        await execAsync(\`xdotool key \${key}\`).catch(() => {});
      }
      return { ok: true };
    }

    default:
      throw new Error(\`Método não suportado: \${method}\`);
  }
}

async function connect() {
  const endpoint = \`\${RELAY_WS_URL}/ws/agent?code=\${encodeURIComponent(PAIRING_CODE)}&host=\${encodeURIComponent(os.hostname())}&platform=\${encodeURIComponent(os.platform())}\`;
  console.log(\`[MobiHost] Conectando PC "\${os.hostname()}" ao código \${PAIRING_CODE}...\`);

  if (typeof globalThis.WebSocket !== 'function') {
    console.error('[MobiHost] Este script requer Node.js 20+ com WebSocket nativo.');
    process.exit(1);
  }

  const ws = new globalThis.WebSocket(endpoint);

  ws.addEventListener('open', () => {
    console.log(\`[MobiHost] Conectado! Abra o app MobiHost no Android e use o código \${PAIRING_CODE}.\`);
  });

  ws.addEventListener('message', async (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === 'rpc') {
        try {
          const result = await handleRpc(msg.method, msg.params || {});
          ws.send(JSON.stringify({ type: 'rpc_result', id: msg.id, ok: true, result }));
        } catch (err) {
          ws.send(JSON.stringify({ type: 'rpc_result', id: msg.id, ok: false, error: err?.message || String(err) }));
        }
      }
    } catch {}
  });

  ws.addEventListener('close', () => {
    console.log('[MobiHost] Conexão encerrada. Reconectando em 3s...');
    setTimeout(connect, 3000);
  });

  ws.addEventListener('error', () => {
    // handled by close
  });
}

connect();
`;
}

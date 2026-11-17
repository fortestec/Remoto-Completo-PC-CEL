import React, { useCallback, useEffect, useState } from 'react';
import {
  AppWindow,
  FolderOpen,
  Home,
  Laptop,
  Monitor,
  Moon,
  Sun,
  Terminal,
} from 'lucide-react';
import { AppsView } from './components/AppsView';
import { FilesView } from './components/FilesView';
import { HomeDashboard } from './components/HomeDashboard';
import { PairingSheet } from './components/PairingSheet';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { ScreenTrackpadView } from './components/ScreenTrackpadView';
import { TerminalView } from './components/TerminalView';
import { callRpc } from './lib/rpcClient';
import type { HostMode, SystemInfo } from './types/remote';

type TabId = 'home' | 'files' | 'apps' | 'terminal' | 'screen';

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'files', label: 'Arquivos', icon: FolderOpen },
  { id: 'apps', label: 'Apps', icon: AppWindow },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'screen', label: 'Tela', icon: Monitor },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [darkMode, setDarkMode] = useState(true);
  const [hostMode, setHostMode] = useState<HostMode>('local');
  const [pairingCode, setPairingCode] = useState<string>(() => localStorage.getItem('mobihost_code') || '');
  const [pairedInfo, setPairedInfo] = useState({ connected: false, hostname: '', platform: '' });
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', darkMode ? '#111318' : '#F6F8FC');
    }
  }, [darkMode]);

  const fetchSystemInfo = useCallback(async () => {
    try {
      const info = await callRpc<SystemInfo>(hostMode, pairingCode, 'system.info');
      setSystemInfo(info);
    } catch {
      // keep previous state if transient
    }
  }, [hostMode, pairingCode]);

  useEffect(() => {
    fetchSystemInfo();
    const id = window.setInterval(fetchSystemInfo, 6000);
    return () => window.clearInterval(id);
  }, [fetchSystemInfo]);

  // Real-time WebSocket subscription for pairing status
  useEffect(() => {
    if (!pairingCode) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/client?code=${encodeURIComponent(pairingCode)}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          connected?: boolean;
          hostname?: string;
          platform?: string;
        };
        if (msg.type === 'pair_status') {
          const isConn = Boolean(msg.connected);
          setPairedInfo({
            connected: isConn,
            hostname: msg.hostname || '',
            platform: msg.platform || '',
          });
          if (isConn) {
            setHostMode('paired');
            notify(`PC "${msg.hostname || 'Computador'}" conectado.`);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => ws.close();
  }, [pairingCode, notify]);

  const handleConnectCode = (code: string) => {
    const clean = code.replace(/\D/g, '');
    if (!clean) return;
    setPairingCode(clean);
    localStorage.setItem('mobihost_code', clean);
    fetch(`/api/pair/status/${clean}`)
      .then((r) => r.json())
      .then((d: { connected: boolean; hostname: string; platform: string }) => {
        setPairedInfo(d);
        if (d.connected) {
          setHostMode('paired');
          notify(`Conectado a ${d.hostname}`);
        } else {
          notify(`Código ${clean} ativo. Execute o agente no PC.`);
        }
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-dvh flex bg-[#F6F8FC] dark:bg-[#111318] text-slate-900 dark:text-[#E3E7F1]">
      {/* Desktop / Tablet Material 3 Navigation Rail */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-[#161920] p-4 justify-between sticky top-0 h-dvh">
        <div className="space-y-6">
          <div className="px-3 pt-2 flex items-center justify-between">
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              MobiHost
            </span>
          </div>

          <nav className="space-y-1.5" aria-label="Navegação principal">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[48px] px-4 rounded-2xl flex items-center gap-3.5 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600/12 text-blue-700 dark:bg-[#A8C7FA]/20 dark:text-[#A8C7FA]'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2.5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPairingOpen(true)}
            className="w-full min-h-[48px] px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#222733] dark:hover:bg-[#2B3140] flex items-center gap-3 text-left transition-colors"
          >
            <Laptop className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {hostMode === 'paired' && pairedInfo.connected ? pairedInfo.hostname : 'Host Local'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {hostMode === 'paired' ? `Código ${pairingCode}` : 'Parear outro PC'}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Top App Bar (48px on mobile for <15% sticky height cap) */}
        <header className="sticky top-0 z-30 h-12 sm:h-14 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-[#F6F8FC]/85 dark:bg-[#111318]/85 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              MobiHost
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-slate-700 dark:text-slate-300">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setPairingOpen(true)}
              className="lg:hidden min-h-[38px] px-3 rounded-full bg-slate-200/80 dark:bg-[#1E232E] text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Laptop className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="max-w-[100px] truncate">
                {hostMode === 'paired' && pairedInfo.connected ? pairedInfo.hostname : 'Conectar PC'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="min-h-[38px] min-w-[38px] sm:min-h-[42px] sm:min-w-[42px] rounded-full hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 shrink-0"
              aria-label={darkMode ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Active View */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-20 lg:pb-8">
          {activeTab === 'home' && (
            <HomeDashboard
              hostMode={hostMode}
              pairingCode={pairingCode}
              systemInfo={systemInfo}
              onRefreshSystem={fetchSystemInfo}
              onNavigateTab={setActiveTab}
              onOpenPairing={() => setPairingOpen(true)}
              onNotify={notify}
            />
          )}
          {activeTab === 'files' && (
            <FilesView hostMode={hostMode} pairingCode={pairingCode} onNotify={notify} />
          )}
          {activeTab === 'apps' && (
            <AppsView hostMode={hostMode} pairingCode={pairingCode} onNotify={notify} />
          )}
          {activeTab === 'terminal' && (
            <TerminalView hostMode={hostMode} pairingCode={pairingCode} onNotify={notify} />
          )}
          {activeTab === 'screen' && (
            <ScreenTrackpadView
              hostMode={hostMode}
              pairingCode={pairingCode}
              onOpenPairing={() => setPairingOpen(true)}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Android Material 3 Fixed Bottom Navigation Bar (Mobile / Tablet < lg) */}
      <nav
        aria-label="Navegação inferior Android"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[62px] pb-safe bg-white/95 dark:bg-[#181B22]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center min-h-[48px] gap-0.5 transition-colors"
            >
              <span
                className={`px-3.5 py-1 rounded-full transition-colors ${
                  active
                    ? 'bg-blue-600/15 text-blue-700 dark:bg-[#A8C7FA]/25 dark:text-[#A8C7FA]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-[20px] h-[20px]" />
              </span>
              <span
                className={`text-[10px] font-semibold tracking-tight leading-none ${
                  active ? 'text-blue-700 dark:text-[#A8C7FA]' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Android Snackbar Toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-[#E3E7F1] text-white dark:text-slate-900 text-xs font-semibold shadow-xl pointer-events-none whitespace-nowrap max-w-[90vw] truncate">
          {toast}
        </div>
      )}

      <PairingSheet
        open={pairingOpen}
        hostMode={hostMode}
        pairingCode={pairingCode}
        pairedInfo={pairedInfo}
        onClose={() => setPairingOpen(false)}
        onSelectLocal={() => {
          setHostMode('local');
          notify('Alternado para o ambiente ao vivo integrado.');
        }}
        onConnectCode={handleConnectCode}
        onNotify={notify}
      />

      <OfflineIndicator />
    </div>
  );
}

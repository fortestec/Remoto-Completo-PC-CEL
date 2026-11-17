import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AppWindow,
  FolderOpen,
  Globe,
  Minimize2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { callRpc } from '../lib/rpcClient';
import type { AppShortcut, HostMode, ProcessItem, WindowItem } from '../types/remote';

interface AppsViewProps {
  hostMode: HostMode;
  pairingCode: string;
  onNotify: (msg: string) => void;
}

export const AppsView: React.FC<AppsViewProps> = ({ hostMode, pairingCode, onNotify }) => {
  const [section, setSection] = useState<'apps' | 'windows' | 'processes'>('apps');
  const [shortcuts, setShortcuts] = useState<AppShortcut[]>([]);
  const [customShortcuts, setCustomShortcuts] = useState<AppShortcut[]>(() => {
    try {
      const saved = localStorage.getItem('mobihost_custom_apps');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [windows, setWindows] = useState<WindowItem[]>([]);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, winRes, procRes] = await Promise.all([
        callRpc<{ shortcuts: AppShortcut[] }>(hostMode, pairingCode, 'apps.list'),
        callRpc<{ windows: WindowItem[] }>(hostMode, pairingCode, 'windows.list'),
        callRpc<{ processes: ProcessItem[] }>(hostMode, pairingCode, 'processes.list'),
      ]);
      setShortcuts(appsRes.shortcuts || []);
      setWindows(winRes.windows || []);
      setProcesses(procRes.processes || []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao atualizar aplicativos.');
    } finally {
      setLoading(false);
    }
  }, [hostMode, pairingCode, onNotify]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleLaunch = async (app: AppShortcut) => {
    try {
      await callRpc(hostMode, pairingCode, 'apps.launch', { command: app.command, name: app.name });
      onNotify(`Iniciando ${app.name} no PC.`);
      const winRes = await callRpc<{ windows: WindowItem[] }>(hostMode, pairingCode, 'windows.list');
      setWindows(winRes.windows || []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Falha ao abrir aplicativo.');
    }
  };

  const handleWindowAction = async (id: string, action: 'focus' | 'minimize' | 'close') => {
    try {
      const res = await callRpc<{ windows: WindowItem[] }>(hostMode, pairingCode, 'windows.action', { id, action });
      setWindows(res.windows || []);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro na ação da janela.');
    }
  };

  const handleKillProcess = async (pid: number, name: string) => {
    try {
      await callRpc(hostMode, pairingCode, 'processes.kill', { pid });
      onNotify(`Processo ${name} (${pid}) encerrado.`);
      setProcesses((prev) => prev.filter((p) => p.pid !== pid));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Não foi possível encerrar o processo.');
    }
  };

  const handleSaveCustomApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCommand.trim()) return;
    const item: AppShortcut = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      category: 'Personalizado',
      command: newCommand.trim(),
      accent: 'blue',
    };
    const next = [...customShortcuts, item];
    setCustomShortcuts(next);
    localStorage.setItem('mobihost_custom_apps', JSON.stringify(next));
    setNewName('');
    setNewCommand('');
    setShowAddModal(false);
    onNotify('Atalho salvo na sua gaveta Android.');
  };

  const removeCustomApp = (id: string) => {
    const next = customShortcuts.filter((c) => c.id !== id);
    setCustomShortcuts(next);
    localStorage.setItem('mobihost_custom_apps', JSON.stringify(next));
  };

  const allApps = [...shortcuts, ...customShortcuts].filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredProcesses = processes.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search),
  );

  const pickIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('term') || lower.includes('shell')) return <Terminal className="w-6 h-6" />;
    if (lower.includes('explor') || lower.includes('find') || lower.includes('arquiv')) return <FolderOpen className="w-6 h-6" />;
    if (lower.includes('chrome') || lower.includes('edge') || lower.includes('safari') || lower.includes('naveg'))
      return <Globe className="w-6 h-6" />;
    return <AppWindow className="w-6 h-6" />;
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-3 p-1 rounded-2xl bg-slate-200/70 dark:bg-[#1B1E26] border border-slate-200/50 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setSection('apps')}
            className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'apps'
                ? 'bg-white dark:bg-[#2A303E] text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Aplicativos
          </button>
          <button
            type="button"
            onClick={() => setSection('windows')}
            className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'windows'
                ? 'bg-white dark:bg-[#2A303E] text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Janelas ({windows.length})
          </button>
          <button
            type="button"
            onClick={() => setSection('processes')}
            className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              section === 'processes'
                ? 'bg-white dark:bg-[#2A303E] text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Processos
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full min-h-[42px] pl-9 pr-3 rounded-2xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            type="button"
            onClick={loadAll}
            className="min-h-[42px] min-w-[42px] rounded-2xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200"
            aria-label="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {section === 'apps' && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[42px] px-3.5 rounded-2xl bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Atalho</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Android App Drawer for PC Apps */}
      {section === 'apps' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {allApps.map((app) => {
            const isCustom = app.id.startsWith('custom-');
            return (
              <div
                key={app.id}
                className="relative rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 flex flex-col items-center text-center gap-2.5 hover:bg-slate-50 dark:hover:bg-[#232732] transition-colors"
              >
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => removeCustomApp(app.id)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-500"
                    aria-label="Remover atalho"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleLaunch(app)}
                  className="flex flex-col items-center gap-2.5 w-full"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/12 dark:bg-blue-400/15 text-blue-600 dark:text-blue-300 flex items-center justify-center transition-transform active:scale-95">
                    {pickIcon(app.name)}
                  </div>
                  <div className="w-full">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {app.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {app.category}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Section 2: Open Windows (Android Recents Style) */}
      {section === 'windows' && (
        <div className="space-y-3">
          {windows.length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
              Nenhuma janela gráfica aberta detectada no computador.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {windows.map((win) => (
                <div
                  key={win.id}
                  className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {win.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 tabular-nums">
                      <span>{win.appName}</span>
                      <span aria-hidden="true">·</span>
                      <span>PID {win.pid}</span>
                      {win.focused && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-blue-600 dark:text-blue-400 font-medium">Em foco</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleWindowAction(win.id, 'focus')}
                      className="min-h-[42px] min-w-[42px] rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center"
                      title="Trazer para frente"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWindowAction(win.id, 'minimize')}
                      className="min-h-[42px] min-w-[42px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
                      title="Minimizar"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleWindowAction(win.id, 'close')}
                      className="min-h-[42px] min-w-[42px] rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center"
                      title="Fechar janela"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 3: Process Manager */}
      {section === 'processes' && (
        <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredProcesses.map((proc) => (
            <div key={proc.pid} className="min-h-[60px] px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#252A36] text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {proc.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    PID {proc.pid} · CPU {proc.cpuPercent}% · RAM {proc.memoryMb} MB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleKillProcess(proc.pid, proc.name)}
                className="min-h-[40px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Encerrar</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add Custom PC App Shortcut */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAddModal(false)}
        >
          <form
            onSubmit={handleSaveCustomApp}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Novo Atalho de Programa
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome (ex: Steam, Blender, Notas)"
                className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                required
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                placeholder="Comando no PC (ex: start steam:// ou code)"
                className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-2xl bg-blue-600 text-white text-sm font-semibold"
              >
                Salvar Atalho
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

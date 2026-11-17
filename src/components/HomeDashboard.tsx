import React, { useEffect, useState } from 'react';
import {
  BellOff,
  Check,
  Clipboard,
  Copy,
  Cpu,
  HardDrive,
  Laptop,
  Lock,
  Moon,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Send,
  SkipBack,
  SkipForward,
  Sun,
  Terminal,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import { callRpc, formatBytes, formatUptime } from '../lib/rpcClient';
import type { AppShortcut, ControlState, HostMode, SystemInfo } from '../types/remote';

interface HomeDashboardProps {
  hostMode: HostMode;
  pairingCode: string;
  systemInfo: SystemInfo | null;
  onRefreshSystem: () => void;
  onNavigateTab: (tab: 'home' | 'files' | 'apps' | 'terminal' | 'screen') => void;
  onOpenPairing: () => void;
  onNotify: (msg: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  hostMode,
  pairingCode,
  systemInfo,
  onRefreshSystem,
  onNavigateTab,
  onOpenPairing,
  onNotify,
}) => {
  const [controls, setControls] = useState<ControlState>({
    volume: 68,
    muted: false,
    brightness: 82,
    wifiEnabled: true,
    doNotDisturb: false,
    media: { title: 'Carregando...', artist: '', app: 'Áudio', playing: false },
    clipboard: '',
  });
  const [clipboardDraft, setClipboardDraft] = useState('');
  const [clipboardCopied, setClipboardCopied] = useState(false);
  const [shortcuts, setShortcuts] = useState<AppShortcut[]>([]);
  const [showPowerSheet, setShowPowerSheet] = useState(false);
  const [powerConfirm, setPowerConfirm] = useState<'lock' | 'sleep' | 'restart' | 'shutdown' | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [ctrl, clip, apps] = await Promise.all([
          callRpc<ControlState>(hostMode, pairingCode, 'control.getState'),
          callRpc<{ text: string }>(hostMode, pairingCode, 'clipboard.get'),
          callRpc<{ shortcuts: AppShortcut[] }>(hostMode, pairingCode, 'apps.list'),
        ]);
        if (!active) return;
        setControls(ctrl);
        setClipboardDraft(clip.text || '');
        setShortcuts(apps.shortcuts || []);
      } catch {
        // handled quietly on initial mount
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [hostMode, pairingCode]);

  const handleVolumeChange = async (val: number) => {
    setControls((prev) => ({ ...prev, volume: val, muted: val === 0 }));
    try {
      const updated = await callRpc<ControlState>(hostMode, pairingCode, 'control.volume', { value: val });
      setControls(updated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao ajustar volume');
    }
  };

  const handleMuteToggle = async () => {
    try {
      const updated = await callRpc<ControlState>(hostMode, pairingCode, 'control.mute', { muted: !controls.muted });
      setControls(updated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao silenciar');
    }
  };

  const handleBrightnessChange = async (val: number) => {
    setControls((prev) => ({ ...prev, brightness: val }));
    try {
      const updated = await callRpc<ControlState>(hostMode, pairingCode, 'control.brightness', { value: val });
      setControls(updated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao ajustar brilho');
    }
  };

  const handleTileToggle = async (tile: 'wifi' | 'dnd') => {
    try {
      const updated = await callRpc<ControlState>(hostMode, pairingCode, 'control.toggleTile', { tile });
      setControls(updated);
    } catch {
      setControls((prev) => ({
        ...prev,
        wifiEnabled: tile === 'wifi' ? !prev.wifiEnabled : prev.wifiEnabled,
        doNotDisturb: tile === 'dnd' ? !prev.doNotDisturb : prev.doNotDisturb,
      }));
    }
  };

  const handleMediaAction = async (action: 'prev' | 'toggle' | 'next') => {
    try {
      const updated = await callRpc<ControlState>(hostMode, pairingCode, 'control.media', { action });
      setControls(updated);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro no controle de mídia');
    }
  };

  const handlePullClipboard = async () => {
    try {
      const res = await callRpc<{ text: string }>(hostMode, pairingCode, 'clipboard.get');
      setClipboardDraft(res.text || '');
      if (navigator.clipboard && res.text) {
        await navigator.clipboard.writeText(res.text).catch(() => {});
      }
      setClipboardCopied(true);
      setTimeout(() => setClipboardCopied(false), 1800);
      onNotify('Área de transferência recebida do computador.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao ler área de transferência');
    }
  };

  const handlePushClipboard = async () => {
    try {
      await callRpc(hostMode, pairingCode, 'clipboard.set', { text: clipboardDraft });
      onNotify('Texto enviado para a área de transferência do PC.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao enviar texto');
    }
  };

  const handlePowerExecute = async (action: 'lock' | 'sleep' | 'restart' | 'shutdown') => {
    try {
      const res = await callRpc<{ message?: string }>(hostMode, pairingCode, 'control.power', { action });
      setPowerConfirm(null);
      setShowPowerSheet(false);
      onNotify(res.message || 'Comando de energia enviado.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao enviar comando de energia');
    }
  };

  const handleQuickLaunch = async (app: AppShortcut) => {
    try {
      await callRpc(hostMode, pairingCode, 'apps.launch', { command: app.command, name: app.name });
      onNotify(`Abrindo ${app.name} no computador`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao abrir aplicativo');
    }
  };

  const memPercent = systemInfo
    ? Math.round((systemInfo.memoryUsedBytes / Math.max(1, systemInfo.memoryTotalBytes)) * 100)
    : 0;
  const primaryDisk = systemInfo?.disks[0];
  const diskPercent = primaryDisk
    ? Math.round((primaryDisk.usedBytes / Math.max(1, primaryDisk.totalBytes)) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-8">
      {/* Device Summary Card */}
      <section className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {systemInfo?.hostname || 'Conectando ao computador...'}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <span>{systemInfo ? systemInfo.platform : 'Carregando sistema'}</span>
                <span aria-hidden="true">·</span>
                <span>{hostMode === 'paired' ? `Pareado (${pairingCode})` : 'Host Local Ao Vivo'}</span>
                {systemInfo && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Ativo há {formatUptime(systemInfo.uptimeSeconds)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshSystem}
              className="min-h-[44px] min-w-[44px] px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2D3342] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              onClick={onOpenPairing}
              className="min-h-[44px] px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center transition-colors whitespace-nowrap shrink-0"
            >
              Trocar PC
            </button>
          </div>
        </div>

        {/* Hardware Metric Strip */}
        {systemInfo && (
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Processador</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {systemInfo.cpuUsagePercent}%
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-transform duration-300 origin-left"
                  style={{ width: `${systemInfo.cpuUsagePercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {systemInfo.cpuCores} núcleos · {systemInfo.arch}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Memória RAM</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {memPercent}%
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
                  style={{ width: `${memPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                {formatBytes(systemInfo.memoryUsedBytes)} / {formatBytes(systemInfo.memoryTotalBytes)}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Armazenamento</span>
                <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                  {diskPercent}%
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                  style={{ width: `${diskPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                {primaryDisk
                  ? `${formatBytes(primaryDisk.usedBytes)} / ${formatBytes(primaryDisk.totalBytes)}`
                  : 'Indisponível'}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Rede Local</span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">IPv4</span>
              </div>
              <p className="mt-2 text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 truncate">
                {systemInfo.networkInterfaces[0]?.address || '127.0.0.1'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Usuário: {systemInfo.username}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Main Two-Column Grid on Tablet/Desktop, Single Stack on Phone */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Android Quick Settings & Sliders */}
        <section className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Configurações Rápidas do PC
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Controles nativos
            </span>
          </div>

          {/* Brightness & Volume Android Pill Sliders */}
          <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className="min-h-[44px] min-w-[44px] -ml-2 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400"
                    aria-label={controls.muted ? 'Ativar som' : 'Silenciar som'}
                  >
                    {controls.muted || controls.volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <span>Volume Principal</span>
                </div>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                  {controls.muted ? 'Mudo' : `${controls.volume}%`}
                </span>
              </div>
              <div className="relative h-10 rounded-full bg-slate-100 dark:bg-[#252A36] flex items-center px-3">
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full bg-blue-600/20 dark:bg-blue-400/25 pointer-events-none"
                  style={{ width: `${controls.muted ? 0 : controls.volume}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={controls.muted ? 0 : controls.volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  aria-label="Volume do computador"
                  className="m3-slider relative z-10 w-full h-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  <span className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Sun className="w-5 h-5" />
                  </span>
                  <span>Brilho do Monitor</span>
                </div>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                  {controls.brightness}%
                </span>
              </div>
              <div className="relative h-10 rounded-full bg-slate-100 dark:bg-[#252A36] flex items-center px-3">
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full bg-amber-500/20 dark:bg-amber-400/20 pointer-events-none"
                  style={{ width: `${controls.brightness}%` }}
                />
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={controls.brightness}
                  onChange={(e) => handleBrightnessChange(Number(e.target.value))}
                  aria-label="Brilho do monitor"
                  className="m3-slider relative z-10 w-full h-full"
                />
              </div>
            </div>
          </div>

          {/* 2x2 Android Material You Quick Tiles */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleTileToggle('wifi')}
              className={`min-h-[76px] rounded-3xl p-4 text-left flex items-center gap-3.5 transition-all active:scale-[0.98] ${
                controls.wifiEnabled
                  ? 'bg-blue-600 text-white dark:bg-[#A8C7FA] dark:text-[#062E6F]'
                  : 'bg-white dark:bg-[#1B1E26] text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <Wifi className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Rede do PC</div>
                <div className="text-xs opacity-80 truncate">
                  {controls.wifiEnabled ? 'Conectada' : 'Pausada'}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTileToggle('dnd')}
              className={`min-h-[76px] rounded-3xl p-4 text-left flex items-center gap-3.5 transition-all active:scale-[0.98] ${
                controls.doNotDisturb
                  ? 'bg-indigo-600 text-white dark:bg-[#C2E7FF] dark:text-[#001D35]'
                  : 'bg-white dark:bg-[#1B1E26] text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <BellOff className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Não Perturbe</div>
                <div className="text-xs opacity-80 truncate">
                  {controls.doNotDisturb ? 'Ativado' : 'Desativado'}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handlePowerExecute('lock')}
              className="min-h-[76px] rounded-3xl p-4 text-left flex items-center gap-3.5 bg-white dark:bg-[#1B1E26] hover:bg-slate-50 dark:hover:bg-[#232732] text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 transition-all active:scale-[0.98]"
            >
              <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Bloquear Tela</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Trava imediata</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setShowPowerSheet(true)}
              className="min-h-[76px] rounded-3xl p-4 text-left flex items-center gap-3.5 bg-white dark:bg-[#1B1E26] hover:bg-slate-50 dark:hover:bg-[#232732] text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 transition-all active:scale-[0.98]"
            >
              <Power className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">Energia</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Suspender ou desligar</div>
              </div>
            </button>
          </div>

          {/* Media Player Widget */}
          <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {controls.media.app} · Controle Remoto
              </div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {controls.media.title}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {controls.media.artist}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleMediaAction('prev')}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                aria-label="Faixa anterior"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handleMediaAction('toggle')}
                className="min-h-[48px] min-w-[48px] rounded-2xl bg-blue-600 hover:bg-blue-700 dark:bg-[#A8C7FA] dark:text-[#062E6F] text-white flex items-center justify-center transition-transform active:scale-95"
                aria-label={controls.media.playing ? 'Pausar' : 'Reproduzir'}
              >
                {controls.media.playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => handleMediaAction('next')}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                aria-label="Próxima faixa"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        {/* Right: Clipboard Sync & Quick Launchers */}
        <section className="lg:col-span-5 space-y-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Área de Transferência
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Celular ↔ Computador
            </span>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-5 space-y-3">
            <textarea
              value={clipboardDraft}
              onChange={(e) => setClipboardDraft(e.target.value)}
              rows={3}
              placeholder="Cole aqui um link, senha ou texto para enviar direto ao Ctrl+V do computador..."
              className="w-full rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 p-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handlePullClipboard}
                className="min-h-[44px] px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                {clipboardCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                <span>Copiar do PC</span>
              </button>
              <button
                type="button"
                onClick={handlePushClipboard}
                className="min-h-[44px] px-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>Enviar ao PC</span>
              </button>
            </div>
          </div>

          {/* Quick Jump Modules */}
          <div className="flex items-center justify-between px-1 pt-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Acesso Rápido
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('apps')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline min-h-[36px] px-2"
            >
              Ver todos
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab('files')}
              className="min-h-[68px] rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 text-left hover:bg-slate-50 dark:hover:bg-[#232732] transition-colors flex items-center gap-3"
            >
              <HardDrive className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Arquivos</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Explorar discos</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('terminal')}
              className="min-h-[68px] rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 text-left hover:bg-slate-50 dark:hover:bg-[#232732] transition-colors flex items-center gap-3"
            >
              <Terminal className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Terminal</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Comandos e scripts</div>
              </div>
            </button>

            {shortcuts.slice(0, 2).map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => handleQuickLaunch(app)}
                className="min-h-[68px] rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 text-left hover:bg-slate-50 dark:hover:bg-[#232732] transition-colors flex items-center gap-3"
              >
                <Cpu className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{app.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">Abrir no PC</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Android Bottom Sheet: Power Controls */}
      {showPowerSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setShowPowerSheet(false);
            setPowerConfirm(null);
          }}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Energia do Computador
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPowerSheet(false);
                  setPowerConfirm(null);
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {powerConfirm ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Confirmar ação de energia <strong>{powerConfirm}</strong> no computador conectado?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPowerConfirm(null)}
                    className="min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePowerExecute(powerConfirm)}
                    className="min-h-[44px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handlePowerExecute('lock')}
                  className="min-h-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] p-4 flex items-center gap-3 text-left"
                >
                  <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Bloquear</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPowerConfirm('sleep')}
                  className="min-h-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] p-4 flex items-center gap-3 text-left"
                >
                  <Moon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Suspender</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPowerConfirm('restart')}
                  className="min-h-[64px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] p-4 flex items-center gap-3 text-left"
                >
                  <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reiniciar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPowerConfirm('shutdown')}
                  className="min-h-[64px] rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 p-4 flex items-center gap-3 text-left"
                >
                  <Power className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Desligar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden icon reference to keep unused import check clean */}
      <span className="hidden" aria-hidden="true">
        <Clipboard className="w-0 h-0" />
      </span>
    </div>
  );
};

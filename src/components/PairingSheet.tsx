import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Laptop, Server, X } from 'lucide-react';
import type { HostMode } from '../types/remote';

interface PairingSheetProps {
  open: boolean;
  hostMode: HostMode;
  pairingCode: string;
  pairedInfo: { connected: boolean; hostname: string; platform: string };
  onClose: () => void;
  onSelectLocal: () => void;
  onConnectCode: (code: string) => void;
  onNotify: (msg: string) => void;
}

export const PairingSheet: React.FC<PairingSheetProps> = ({
  open,
  hostMode,
  pairingCode,
  pairedInfo,
  onClose,
  onSelectLocal,
  onConnectCode,
  onNotify,
}) => {
  const [generatedCode, setGeneratedCode] = useState(pairingCode || '');
  const [manualCode, setManualCode] = useState(pairingCode || '');
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (open && !generatedCode) {
      fetch('/api/pair/create', { method: 'POST' })
        .then((r) => r.json())
        .then((d: { code: string }) => {
          setGeneratedCode(d.code);
          setManualCode(d.code);
          onConnectCode(d.code);
        })
        .catch(() => {});
    }
  }, [open, generatedCode, onConnectCode]);

  if (!open) return null;

  const activeCode = manualCode.replace(/\D/g, '') || generatedCode;
  const runCmd = `node mobihost-agent-${activeCode}.mjs`;

  const copyCommand = () => {
    navigator.clipboard?.writeText(runCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
    onNotify('Comando copiado.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl max-h-[90dvh] overflow-y-auto space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Conectar Computador
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha o host local ou pareie seu Windows, Mac ou Linux
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Option 1: Built-in Local Live Host */}
        <button
          type="button"
          onClick={() => {
            onSelectLocal();
            onClose();
          }}
          className={`w-full rounded-2xl p-4 text-left border transition-colors flex items-center justify-between gap-3 ${
            hostMode === 'local'
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30 dark:border-blue-400'
              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#232732]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ambiente Ao Vivo Integrado
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Teste arquivos, terminal e processos imediatamente
              </div>
            </div>
          </div>
          {hostMode === 'local' && <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />}
        </button>

        {/* Option 2: Pair Personal PC */}
        <div
          className={`rounded-2xl p-4 border space-y-4 ${
            hostMode === 'paired'
              ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-400'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Meu Computador Pessoal
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {pairedInfo.connected
                    ? `Conectado a ${pairedInfo.hostname} (${pairedInfo.platform})`
                    : 'Aguardando agente no Windows, macOS ou Linux'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Código de Pareamento (6 dígitos)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={6}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ''))}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 font-mono text-base font-bold tracking-widest text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => onConnectCode(activeCode)}
                className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
              >
                Usar Código
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-[#111318] border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Como conectar seu PC em 2 passos:
            </div>
            <p>1. Baixe e salve o agente leve (requer Node.js 20+ no PC):</p>
            <a
              href={`/api/agent/download?code=${encodeURIComponent(activeCode)}`}
              download={`mobihost-agent-${activeCode}.mjs`}
              className="w-full min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-900 font-semibold inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Agente (mobihost-agent-{activeCode}.mjs)</span>
            </a>
            <p className="pt-1">2. Execute no terminal do seu PC:</p>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-[11px]">
              <span className="truncate">{runCmd}</span>
              <button
                type="button"
                onClick={copyCommand}
                className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0"
                aria-label="Copiar comando"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

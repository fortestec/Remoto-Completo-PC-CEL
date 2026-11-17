import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, CornerDownLeft, Plus, Trash2 } from 'lucide-react';
import { callRpc } from '../lib/rpcClient';
import type { HostMode, TerminalExecResult } from '../types/remote';

interface TerminalViewProps {
  hostMode: HostMode;
  pairingCode: string;
  onNotify: (msg: string) => void;
}

interface HistoryItem {
  id: string;
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface MacroItem {
  id: string;
  label: string;
  command: string;
}

const DEFAULT_MACROS: MacroItem[] = [
  { id: 'm1', label: 'Listar pasta', command: 'ls -la' },
  { id: 'm2', label: 'Git status', command: 'git status' },
  { id: 'm3', label: 'Espaço em disco', command: 'df -h' },
  { id: 'm4', label: 'Versão Node', command: 'node -v' },
  { id: 'm5', label: 'Usuário atual', command: 'whoami' },
];

export const TerminalView: React.FC<TerminalViewProps> = ({ hostMode, pairingCode, onNotify }) => {
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('~');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdIdx, setCmdIdx] = useState(-1);
  const [macros, setMacros] = useState<MacroItem[]>(() => {
    try {
      const saved = localStorage.getItem('mobihost_macros');
      return saved ? JSON.parse(saved) : DEFAULT_MACROS;
    } catch {
      return DEFAULT_MACROS;
    }
  });
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [macroLabel, setMacroLabel] = useState('');
  const [macroCmd, setMacroCmd] = useState('');

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const execute = async (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed || running) return;
    if (trimmed === 'clear' || trimmed === 'cls') {
      setHistory([]);
      setCommand('');
      return;
    }

    setRunning(true);
    setCommand('');
    setCmdHistory((prev) => [trimmed, ...prev.slice(0, 39)]);
    setCmdIdx(-1);

    try {
      const res = await callRpc<TerminalExecResult>(hostMode, pairingCode, 'terminal.exec', { command: trimmed });
      setCwd(res.cwd || cwd);
      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          command: trimmed,
          cwd: res.cwd || cwd,
          stdout: res.stdout,
          stderr: res.stderr,
          exitCode: res.exitCode,
          durationMs: res.durationMs,
        },
      ]);
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          command: trimmed,
          cwd,
          stdout: '',
          stderr: err instanceof Error ? err.message : 'Erro ao executar comando.',
          exitCode: 1,
          durationMs: 0,
        },
      ]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  const navigateHistory = (dir: 'up' | 'down') => {
    if (cmdHistory.length === 0) return;
    if (dir === 'up') {
      const next = Math.min(cmdHistory.length - 1, cmdIdx + 1);
      setCmdIdx(next);
      setCommand(cmdHistory[next]);
    } else {
      const next = cmdIdx - 1;
      if (next < 0) {
        setCmdIdx(-1);
        setCommand('');
      } else {
        setCmdIdx(next);
        setCommand(cmdHistory[next]);
      }
    }
  };

  const insertToken = (token: string) => {
    setCommand((prev) => prev + token);
    inputRef.current?.focus();
  };

  const handleSaveMacro = (e: React.FormEvent) => {
    e.preventDefault();
    if (!macroLabel.trim() || !macroCmd.trim()) return;
    const next = [...macros, { id: `m-${Date.now()}`, label: macroLabel.trim(), command: macroCmd.trim() }];
    setMacros(next);
    localStorage.setItem('mobihost_macros', JSON.stringify(next));
    setMacroLabel('');
    setMacroCmd('');
    setShowMacroModal(false);
    onNotify('Macro salva.');
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-165px)] lg:h-[calc(100dvh-110px)] gap-3">
      {/* 1-Tap Android Macro Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
        <button
          type="button"
          onClick={() => setShowMacroModal(true)}
          className="min-h-[40px] px-3.5 rounded-2xl bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Macro</span>
        </button>
        {macros.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => execute(m.command)}
            className="min-h-[40px] px-3.5 rounded-2xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#232732] whitespace-nowrap shrink-0"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Terminal Output Container */}
      <div className="flex-1 min-h-0 rounded-3xl bg-[#0D1017] text-slate-100 border border-slate-800 flex flex-col overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800/90 flex items-center justify-between gap-2 bg-[#141821]">
          <span className="font-mono text-xs text-slate-400 truncate">{cwd}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                const text = history.map((h) => `$ ${h.command}\n${h.stdout}${h.stderr}`).join('\n');
                navigator.clipboard?.writeText(text);
                onNotify('Saída copiada.');
              }}
              className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center"
              aria-label="Copiar saída"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-slate-800 text-slate-400 flex items-center justify-center"
              aria-label="Limpar terminal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={outputRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs sm:text-sm space-y-4">
          {history.length === 0 ? (
            <div className="text-slate-400 space-y-1">
              <p className="text-slate-200 font-medium">Console Remoto MobiHost</p>
              <p className="text-xs">
                Toque em uma macro acima ou digite qualquer comando para executar direto no computador.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="text-blue-400 font-semibold break-all">
                    <span className="text-emerald-400 mr-1.5">$</span>
                    {item.command}
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {item.exitCode === 0 ? `${item.durationMs} ms` : `erro ${item.exitCode}`}
                  </span>
                </div>
                {item.stdout && (
                  <pre className="whitespace-pre-wrap break-words text-slate-200 leading-relaxed">
                    {item.stdout}
                  </pre>
                )}
                {item.stderr && (
                  <pre className="whitespace-pre-wrap break-words text-rose-400 leading-relaxed">
                    {item.stderr}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Mobile Ergonomic Accessory Key Bar */}
        <div className="px-3 py-2 border-t border-slate-800 bg-[#141821] flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => navigateHistory('up')}
            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0"
            aria-label="Comando anterior"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigateHistory('down')}
            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center shrink-0"
            aria-label="Próximo comando"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          {['~/', './', '|', '&&', 'cd ..', 'ls', 'clear'].map((tok) => (
            <button
              key={tok}
              type="button"
              onClick={() => (tok === 'clear' ? setHistory([]) : insertToken(tok === 'cd ..' || tok === 'ls' ? tok : tok))}
              className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs shrink-0"
            >
              {tok}
            </button>
          ))}
        </div>

        {/* Command Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            execute(command);
          }}
          className="p-2.5 border-t border-slate-800 bg-[#0D1017] flex items-center gap-2"
        >
          <span className="font-mono text-emerald-400 pl-2 text-sm shrink-0">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={running ? 'Executando no PC...' : 'Digite um comando...'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 min-h-[44px] bg-transparent font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={running || !command.trim()}
            className="min-h-[44px] px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
          >
            <CornerDownLeft className="w-4 h-4" />
            <span>Rodar</span>
          </button>
        </form>
      </div>

      {/* Add Macro Modal */}
      {showMacroModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowMacroModal(false)}
        >
          <form
            onSubmit={handleSaveMacro}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nova Macro de 1 Toque</h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                value={macroLabel}
                onChange={(e) => setMacroLabel(e.target.value)}
                placeholder="Nome curto (ex: Atualizar Git)"
                className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                required
                value={macroCmd}
                onChange={(e) => setMacroCmd(e.target.value)}
                placeholder="Comando (ex: git pull)"
                className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowMacroModal(false)}
                className="min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-2xl bg-blue-600 text-white text-sm font-semibold"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

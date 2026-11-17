import React, { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Monitor, MousePointer, Pause, Play, Send } from 'lucide-react';
import { callRpc } from '../lib/rpcClient';
import type { HostMode, ScreenFrameResult } from '../types/remote';

interface ScreenTrackpadViewProps {
  hostMode: HostMode;
  pairingCode: string;
  onOpenPairing: () => void;
  onNotify: (msg: string) => void;
}

export const ScreenTrackpadView: React.FC<ScreenTrackpadViewProps> = ({
  hostMode,
  pairingCode,
  onOpenPairing,
  onNotify,
}) => {
  const [streaming, setStreaming] = useState(false);
  const [frame, setFrame] = useState<ScreenFrameResult | null>(null);
  const [textInput, setTextInput] = useState('');
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const pendingMove = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const moveTimer = useRef<number | null>(null);

  const captureOnce = async () => {
    try {
      const res = await callRpc<ScreenFrameResult>(hostMode, pairingCode, 'screen.capture');
      setFrame(res);
    } catch (err) {
      setStreaming(false);
      onNotify(err instanceof Error ? err.message : 'Erro ao capturar tela.');
    }
  };

  useEffect(() => {
    if (!streaming) return;
    captureOnce();
    const id = window.setInterval(captureOnce, 1600);
    return () => window.clearInterval(id);
  }, [streaming, hostMode, pairingCode]);

  const flushMove = () => {
    const { dx, dy } = pendingMove.current;
    pendingMove.current = { dx: 0, dy: 0 };
    moveTimer.current = null;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    callRpc(hostMode, pairingCode, 'input.mouseMove', { dx: dx * 1.6, dy: dy * 1.6 }).catch(() => {});
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setLastPointer({ x: t.clientX, y: t.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!lastPointer) return;
    const t = e.touches[0];
    const dx = t.clientX - lastPointer.x;
    const dy = t.clientY - lastPointer.y;
    setLastPointer({ x: t.clientX, y: t.clientY });
    pendingMove.current.dx += dx;
    pendingMove.current.dy += dy;
    if (!moveTimer.current) {
      moveTimer.current = window.setTimeout(flushMove, 60);
    }
  };

  const handleMouseClick = async (button: 'left' | 'right') => {
    try {
      await callRpc(hostMode, pairingCode, 'input.mouseClick', { button });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao enviar clique.');
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput) return;
    try {
      await callRpc(hostMode, pairingCode, 'input.typeText', { text: textInput });
      setTextInput('');
      onNotify('Texto digitado no PC.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao digitar texto.');
    }
  };

  const handleKeyPress = async (key: string) => {
    try {
      await callRpc(hostMode, pairingCode, 'input.keyPress', { key });
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao enviar tecla.');
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Optional Live Screen Preview */}
      <section className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-400/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                Visualização de Tela Sob Demanda
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ative somente quando precisar ver janelas visuais do PC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={captureOnce}
              className="min-h-[42px] px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" />
              <span>Capturar</span>
            </button>
            <button
              type="button"
              onClick={() => setStreaming((s) => !s)}
              className={`min-h-[42px] px-4 rounded-2xl text-xs font-semibold inline-flex items-center gap-1.5 ${
                streaming
                  ? 'bg-rose-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {streaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{streaming ? 'Pausar Vídeo' : 'Espelhar Ao Vivo'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0D1017] border border-slate-800 overflow-hidden aspect-video flex items-center justify-center p-4 text-center">
          {frame?.available && frame.dataBase64 ? (
            <img
              src={`data:${frame.mimeType};base64,${frame.dataBase64}`}
              alt="Tela remota do computador"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="max-w-md space-y-3">
              <p className="text-sm text-slate-300">
                {frame?.note ||
                  'Toque em "Espelhar Ao Vivo" quando quiser visualizar a tela completa do seu computador pareado.'}
              </p>
              {hostMode === 'local' && (
                <button
                  type="button"
                  onClick={onOpenPairing}
                  className="min-h-[42px] px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  Parear Meu Computador Real
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Trackpad + Virtual Keyboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <MousePointer className="w-4 h-4 text-blue-500" />
              <span>Trackpad Tátil</span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">Deslize para mover · Toque para clicar</span>
          </div>

          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onClick={() => handleMouseClick('left')}
            className="h-52 sm:h-60 rounded-2xl bg-slate-100 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 flex items-center justify-center select-none touch-none active:bg-slate-200/70 dark:active:bg-[#161922] transition-colors cursor-crosshair"
          >
            <span className="text-xs text-slate-400 pointer-events-none">Área do trackpad</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleMouseClick('left')}
              className="min-h-[48px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] text-slate-900 dark:text-slate-100 text-xs font-semibold active:scale-[0.98]"
            >
              Clique Esquerdo
            </button>
            <button
              type="button"
              onClick={() => handleMouseClick('right')}
              className="min-h-[48px] rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] text-slate-900 dark:text-slate-100 text-xs font-semibold active:scale-[0.98]"
            >
              Clique Direito
            </button>
          </div>
        </section>

        <section className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Keyboard className="w-4 h-4 text-emerald-500" />
            <span>Teclado Remoto</span>
          </div>

          <form onSubmit={handleSendText} className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Digitar texto no PC..."
              className="flex-1 min-w-0 min-h-[46px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <button
              type="submit"
              className="min-h-[46px] px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Enviar</span>
            </button>
          </form>

          <div className="grid grid-cols-3 gap-2">
            {['Enter', 'Escape', 'Tab', 'Backspace', 'Alt+Tab', 'Ctrl+C', 'Ctrl+V'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeyPress(key)}
                className="min-h-[44px] px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-[#252A36] dark:hover:bg-[#2E3443] text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 active:scale-[0.98]"
              >
                {key}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

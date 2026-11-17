import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  Edit3,
  File,
  FileCode2,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  MoreVertical,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { callRpc, formatBytes, formatDateShort } from '../lib/rpcClient';
import type { FileEntry, FileListResult, FileReadResult, HostMode } from '../types/remote';

interface FilesViewProps {
  hostMode: HostMode;
  pairingCode: string;
  onNotify: (msg: string) => void;
}

export const FilesView: React.FC<FilesViewProps> = ({ hostMode, pairingCode, onNotify }) => {
  const [data, setData] = useState<FileListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [previewFile, setPreviewFile] = useState<FileReadResult | null>(null);
  const [editorText, setEditorText] = useState('');
  const [savingFile, setSavingFile] = useState(false);

  const [showFabMenu, setShowFabMenu] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const uploadInputRef = useRef<HTMLInputElement>(null);

  const loadDirectory = useCallback(
    async (targetPath?: string) => {
      setLoading(true);
      setError('');
      try {
        const result = await callRpc<FileListResult>(hostMode, pairingCode, 'fs.list', targetPath ? { path: targetPath } : {});
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao listar diretório.');
      } finally {
        setLoading(false);
      }
    },
    [hostMode, pairingCode],
  );

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const openEntry = async (entry: FileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path);
      return;
    }
    try {
      const fileData = await callRpc<FileReadResult>(hostMode, pairingCode, 'fs.read', { path: entry.path });
      setPreviewFile(fileData);
      setEditorText(fileData.isText ? fileData.content : '');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.');
    }
  };

  const handleSaveEditor = async () => {
    if (!previewFile) return;
    setSavingFile(true);
    try {
      await callRpc(hostMode, pairingCode, 'fs.write', {
        path: previewFile.path,
        content: editorText,
        encoding: 'utf8',
      });
      onNotify(`Arquivo "${previewFile.name}" salvo no computador.`);
      setPreviewFile(null);
      loadDirectory(data?.currentPath);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao salvar arquivo.');
    } finally {
      setSavingFile(false);
    }
  };

  const handleDownloadToPhone = async (entry: FileEntry) => {
    try {
      const fileData = await callRpc<FileReadResult>(hostMode, pairingCode, 'fs.read', { path: entry.path });
      const blob = fileData.isText
        ? new Blob([fileData.content], { type: fileData.mimeType || 'text/plain' })
        : (() => {
            const bin = atob(fileData.content);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: fileData.mimeType || 'application/octet-stream' });
          })();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
      onNotify(`Baixando "${entry.name}" para o celular.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao baixar arquivo.');
    }
  };

  const handleUploadFromPhone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !data) return;
    if (file.size > 6 * 1024 * 1024) {
      onNotify('Arquivo acima de 6 MB para envio rápido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resultStr = String(reader.result || '');
        const base64 = resultStr.split(',')[1] || '';
        const sep = data.separator || '/';
        const dest = `${data.currentPath.replace(/[\\/]+$/, '')}${sep}${file.name}`;
        await callRpc(hostMode, pairingCode, 'fs.write', {
          path: dest,
          content: base64,
          encoding: 'base64',
        });
        onNotify(`"${file.name}" enviado para o computador.`);
        loadDirectory(data.currentPath);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowFabMenu(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !data) return;
    const sep = data.separator || '/';
    const target = `${data.currentPath.replace(/[\\/]+$/, '')}${sep}${newFolderName.trim()}`;
    try {
      await callRpc(hostMode, pairingCode, 'fs.mkdir', { path: target });
      setNewFolderName('');
      setNewFolderOpen(false);
      onNotify('Pasta criada no computador.');
      loadDirectory(data.currentPath);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao criar pasta.');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim() || !data) return;
    const sep = data.separator || '/';
    const parent = data.currentPath.replace(/[\\/]+$/, '');
    const nextPath = `${parent}${sep}${renameValue.trim()}`;
    try {
      await callRpc(hostMode, pairingCode, 'fs.rename', { oldPath: renameTarget.path, newPath: nextPath });
      setRenameTarget(null);
      setSelectedEntry(null);
      onNotify('Item renomeado.');
      loadDirectory(data.currentPath);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao renomear.');
    }
  };

  const handleDelete = async (entry: FileEntry) => {
    try {
      await callRpc(hostMode, pairingCode, 'fs.delete', { path: entry.path });
      setSelectedEntry(null);
      onNotify(`"${entry.name}" removido.`);
      loadDirectory(data?.currentPath);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Erro ao excluir item.');
    }
  };

  const filteredEntries = (data?.entries || []).filter((entry) =>
    entry.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const renderIcon = (entry: FileEntry) => {
    if (entry.isDirectory) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <Folder className="w-5 h-5" />
        </div>
      );
    }
    const ext = entry.extension.toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
          <FileImage className="w-5 h-5" />
        </div>
      );
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.html', '.css'].includes(ext)) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
          <FileCode2 className="w-5 h-5" />
        </div>
      );
    }
    if (['.txt', '.md', '.log', '.csv'].includes(ext)) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-2xl bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
        <File className="w-5 h-5" />
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24 relative">
      {/* Android Storage Quick Shortcuts */}
      {data && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {data.roots.map((root) => {
            const active = data.currentPath === root.path;
            return (
              <button
                key={root.path}
                type="button"
                onClick={() => loadDirectory(root.path)}
                className={`min-h-[40px] px-4 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-blue-600 text-white dark:bg-[#A8C7FA] dark:text-[#062E6F]'
                    : 'bg-white dark:bg-[#1B1E26] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800'
                }`}
              >
                {root.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Path Bar */}
      <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!data?.parentPath}
            onClick={() => data?.parentPath && loadDirectory(data.parentPath)}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-100 dark:bg-[#252A36] disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0"
            aria-label="Voltar pasta"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-[#111318] font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
            {data?.currentPath || 'Carregando...'}
          </div>

          <button
            type="button"
            onClick={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-100 dark:bg-[#252A36] flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0"
            aria-label="Alternar visualização"
          >
            {viewMode === 'list' ? <LayoutGrid className="w-5 h-5" /> : <List className="w-5 h-5" />}
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar arquivos nesta pasta..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200/70 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* File List / Grid */}
      {loading ? (
        <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-8 text-center text-sm text-slate-500">
          Lendo arquivos do computador...
        </div>
      ) : error ? (
        <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-rose-200 dark:border-rose-900/50 p-6 text-center space-y-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          <button
            type="button"
            onClick={() => loadDirectory(data?.currentPath)}
            className="min-h-[44px] px-4 rounded-2xl bg-blue-600 text-white text-xs font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-8 text-center text-sm text-slate-500">
          Nenhum item encontrado nesta pasta.
        </div>
      ) : viewMode === 'list' ? (
        <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80">
          {filteredEntries.map((entry) => (
            <div
              key={entry.path}
              className="min-h-[64px] px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#232732] transition-colors"
            >
              <button
                type="button"
                onClick={() => openEntry(entry)}
                className="flex-1 min-w-0 flex items-center gap-3.5 text-left min-h-[44px]"
              >
                {renderIcon(entry)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {entry.name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
                    <span>{entry.isDirectory ? 'Pasta' : formatBytes(entry.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateShort(entry.modifiedAt)}</span>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedEntry(entry)}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-slate-200/70 dark:hover:bg-slate-700/60 text-slate-500 shrink-0"
                aria-label={`Ações para ${entry.name}`}
              >
                {entry.isDirectory ? <ChevronRight className="w-5 h-5" /> : <MoreVertical className="w-5 h-5" />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {filteredEntries.map((entry) => (
            <div
              key={entry.path}
              className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200/80 dark:border-slate-800/80 p-3.5 flex flex-col justify-between gap-3 hover:bg-slate-50 dark:hover:bg-[#232732]"
            >
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => openEntry(entry)} className="text-left">
                  {renderIcon(entry)}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="min-h-[40px] min-w-[40px] -mr-1.5 -mt-1.5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Opções"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
              <button type="button" onClick={() => openEntry(entry)} className="text-left min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {entry.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                  {entry.isDirectory ? 'Pasta' : formatBytes(entry.sizeBytes)}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Android Floating Action Button (FAB) */}
      <div className="fixed bottom-20 right-4 lg:bottom-8 lg:right-8 z-30 flex flex-col items-end gap-2">
        {showFabMenu && (
          <div className="flex flex-col items-end gap-2 mb-1">
            <button
              type="button"
              onClick={() => {
                setNewFolderOpen(true);
                setShowFabMenu(false);
              }}
              className="min-h-[44px] px-4 rounded-2xl bg-white dark:bg-[#252A36] border border-slate-200 dark:border-slate-700 shadow-lg text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2"
            >
              <FolderPlus className="w-4 h-4 text-amber-500" />
              <span>Nova Pasta</span>
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="min-h-[44px] px-4 rounded-2xl bg-white dark:bg-[#252A36] border border-slate-200 dark:border-slate-700 shadow-lg text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-blue-500" />
              <span>Enviar do Celular</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowFabMenu((v) => !v)}
          className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 dark:bg-[#A8C7FA] dark:text-[#062E6F] text-white shadow-xl flex items-center justify-center transition-transform active:scale-95"
          aria-label="Adicionar ou enviar arquivo"
        >
          <Plus className={`w-6 h-6 transition-transform ${showFabMenu ? 'rotate-45' : ''}`} />
        </button>
      </div>

      <input ref={uploadInputRef} type="file" className="hidden" onChange={handleUploadFromPhone} />

      {/* Bottom Sheet: File Actions */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {selectedEntry.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                {selectedEntry.path}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const entry = selectedEntry;
                setSelectedEntry(null);
                openEntry(entry);
              }}
              className="w-full min-h-[48px] px-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              <Edit3 className="w-4 h-4 text-blue-500" />
              <span>{selectedEntry.isDirectory ? 'Abrir pasta' : 'Visualizar ou editar'}</span>
            </button>

            {!selectedEntry.isDirectory && (
              <button
                type="button"
                onClick={() => {
                  const entry = selectedEntry;
                  setSelectedEntry(null);
                  handleDownloadToPhone(entry);
                }}
                className="w-full min-h-[48px] px-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                <Download className="w-4 h-4 text-emerald-500" />
                <span>Baixar para o celular</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRenameTarget(selectedEntry);
                setRenameValue(selectedEntry.name);
                setSelectedEntry(null);
              }}
              className="w-full min-h-[48px] px-4 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              <Edit3 className="w-4 h-4 text-amber-500" />
              <span>Renomear</span>
            </button>

            <button
              type="button"
              onClick={() => handleDelete(selectedEntry)}
              className="w-full min-h-[48px] px-4 rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-3 text-sm font-medium text-rose-600 dark:text-rose-400"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir do PC</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal: New Folder */}
      {newFolderOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setNewFolderOpen(false)}
        >
          <form
            onSubmit={handleCreateFolder}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nova Pasta no PC</h3>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nome da pasta"
              className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-2xl bg-blue-600 text-white text-sm font-semibold"
              >
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Rename */}
      {renameTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRenameTarget(null)}
        >
          <form
            onSubmit={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Renomear Item</h3>
            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full min-h-[46px] px-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="min-h-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] rounded-2xl bg-blue-600 text-white text-sm font-semibold"
              >
                Renomear
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Native Android File Viewer / Editor Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FC] dark:bg-[#111318]">
          <header className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1B1E26] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                aria-label="Fechar visualizador"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {previewFile.name}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatBytes(previewFile.sizeBytes)} · {previewFile.mimeType}
                </div>
              </div>
            </div>

            {previewFile.isText && (
              <button
                type="button"
                disabled={savingFile}
                onClick={handleSaveEditor}
                className="min-h-[40px] px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{savingFile ? 'Salvando...' : 'Salvar'}</span>
              </button>
            )}
          </header>

          <div className="flex-1 overflow-auto p-4 max-w-5xl w-full mx-auto">
            {previewFile.isImage ? (
              <div className="h-full flex items-center justify-center rounded-3xl bg-white dark:bg-[#1B1E26] p-4 border border-slate-200 dark:border-slate-800">
                <img
                  src={`data:${previewFile.mimeType};base64,${previewFile.content}`}
                  alt={previewFile.name}
                  className="max-h-[75vh] w-auto rounded-2xl object-contain"
                />
              </div>
            ) : previewFile.isText ? (
              <textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                spellCheck={false}
                className="w-full h-full min-h-[70vh] rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-4 font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            ) : (
              <div className="rounded-3xl bg-white dark:bg-[#1B1E26] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Visualização binária não disponível diretamente no editor.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadToPhone({
                      name: previewFile.name,
                      path: previewFile.path,
                      isDirectory: false,
                      sizeBytes: previewFile.sizeBytes,
                      modifiedAt: new Date().toISOString(),
                      extension: '',
                    })
                  }
                  className="min-h-[44px] px-5 rounded-2xl bg-blue-600 text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar arquivo</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import { ArrowLeft, Check, Edit2, History, Terminal, Trash2, X } from "lucide-react";
import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import type { TerminalSession } from "@/stores/terminal-store";

interface TerminalListManagerProps {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onClose: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onBack: () => void;
  onManageHistory?: () => void;
  embedded?: boolean;
}

const TerminalListManager: React.FC<TerminalListManagerProps> = ({
  terminals,
  activeTerminalId,
  onSelect,
  onRename,
  onClose,
  onDelete,
  onClearAll,
  onBack,
  onManageHistory,
  embedded = false,
}) => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const tips = [t("terminal.tipScroll"), t("terminal.tipSplit")];
  const rollingTips = [...tips, ...tips];

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onClose(id);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
    }
  };

  const handleClearAllClick = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    onClearAll();
    setShowClearConfirm(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await onRename(id, editName.trim());
      setEditingId(null);
    } catch {}
  };

  const startEditing = (e: React.MouseEvent, terminal: TerminalSession) => {
    e.stopPropagation();
    setEditingId(terminal.id);
    setEditName(terminal.name);
  };

  return (
    <div className={`flex flex-col h-full bg-ide-panel ${embedded ? "border-t border-ide-border" : ""}`}>
      {!embedded && (
        <div className="h-12 bg-ide-bg border-b border-ide-border flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-md text-ide-accent hover:bg-ide-accent hover:text-ide-bg flex items-center justify-center border border-ide-border transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="font-medium text-ide-text flex-1">{t("terminal.list")}</span>
          {terminals.length > 0 && (
            <button
              onClick={handleClearAllClick}
              className="text-xs text-ide-mute hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={12} />
              <span>{t("terminal.clearAll")}</span>
            </button>
          )}
        </div>
      )}

      {embedded && terminals.length > 0 && (
        <div className="flex justify-end px-3 py-2">
          <button
            onClick={handleClearAllClick}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-red-500 flex items-center gap-1 text-xs"
          >
            <Trash2 size={14} />
            <span>{t("terminal.clearAll")}</span>
          </button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {terminals.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[18%] z-0 flex justify-center px-8">
            <div className="h-14 overflow-hidden text-center text-sm leading-7 tracking-[0.02em] text-ide-mute/40">
              <div className="flex flex-col" style={{ animation: "terminal-list-tips 8s linear infinite" }}>
                {rollingTips.map((tip, index) => (
                  <p key={`${tip}-${index}`} className="whitespace-nowrap">
                    {tip}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 h-full overflow-auto p-3 pt-0 pb-24">
          {terminals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-ide-mute">
              <Terminal size={40} className="mb-4 opacity-50" />
              <p className="text-sm">{t("terminal.noTerminals")}</p>
              <p className="mt-2 text-xs">{t("terminal.createToStart")}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {terminals.map((terminal) => {
                const isCurrent = terminal.id === activeTerminalId;
                const isEditing = editingId === terminal.id;
                const isClosed = terminal.status !== "running";

                return (
                  <div
                    key={terminal.id}
                    onClick={() => onSelect(terminal.id)}
                    className={`group flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${
                      isCurrent
                        ? "bg-ide-accent/10 border-ide-accent/30"
                        : isClosed
                          ? "border-transparent hover:bg-ide-bg/50 hover:border-ide-border opacity-60"
                          : "border-transparent hover:bg-ide-bg hover:border-ide-border"
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg flex-shrink-0 ${
                        isCurrent ? "bg-ide-accent/20" : "bg-ide-bg group-hover:bg-ide-panel"
                      }`}
                    >
                      <Terminal
                        size={18}
                        className={isCurrent ? "text-ide-accent" : isClosed ? "text-ide-mute/50" : "text-ide-mute"}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 px-2 py-0.5 bg-ide-bg border border-ide-accent rounded text-sm text-ide-text outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleRename(terminal.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => void handleRename(terminal.id)}
                            className="p-2 rounded-md text-green-500 hover:bg-ide-bg"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-2 rounded-md text-red-500 hover:bg-ide-bg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium truncate text-sm ${
                              isCurrent ? "text-ide-accent" : isClosed ? "text-ide-mute" : "text-ide-text"
                            }`}
                          >
                            {terminal.name}
                          </span>
                          {isCurrent && !isClosed && (
                            <span className="text-[10px] bg-ide-accent text-ide-bg px-1.5 py-0.5 rounded font-bold">
                              {t("terminal.active")}
                            </span>
                          )}
                          {isClosed && (
                            <span className="text-[10px] bg-ide-mute/30 text-ide-mute px-1.5 py-0.5 rounded">
                              {t("terminal.closed")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => startEditing(e, terminal)}
                          className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
                        >
                          <Edit2 size={14} />
                        </button>
                        {!isClosed && (
                          <button
                            onClick={(e) => handleCloseClick(e, terminal.id)}
                            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteClick(e, terminal.id)}
                          className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {onManageHistory && (
        <div className="border-t border-ide-border px-3 py-3">
          <button
            onClick={onManageHistory}
            className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
          >
            <History size={14} />
            <span>{t("terminal.manageHistory")}</span>
          </button>
        </div>
      )}

      <style>{`
        @keyframes terminal-list-tips {
          0% { transform: translateY(0); }
          45% { transform: translateY(0); }
          55% { transform: translateY(-50%); }
          100% { transform: translateY(-50%); }
        }
      `}</style>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("terminal.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("terminal.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} variant="destructive">
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("terminal.clearAllTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("terminal.clearAllConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClear} variant="destructive">
              {t("terminal.clearAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TerminalListManager;

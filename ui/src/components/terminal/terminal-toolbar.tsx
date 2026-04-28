import { LayoutList, Plus, Trash2 } from "lucide-react";
import React from "react";
import TerminalTabs from "@/components/terminal/terminal-tabs";
import { useTranslation } from "@/lib/i18n";
import { useAppStore } from "@/stores";
import type { TerminalSession } from "@/stores/terminal-store";

interface TerminalToolbarProps {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTerminal: () => void;
  onToggleListMode: () => void;
  isListMode: boolean;
  onClearAll?: () => void;
}

const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
  terminals,
  activeTerminalId,
  onTabClick,
  onTabClose,
  onNewTerminal,
  onToggleListMode,
  isListMode,
  onClearAll,
}) => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);

  return (
    <div className="flex flex-col bg-ide-panel border-b border-ide-border">
      <div className="flex items-center gap-1 h-10 px-2">
        <div className="flex-1 overflow-hidden h-full flex items-center">
          {!isListMode ? (
            <TerminalTabs
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              onTabClick={onTabClick}
              onTabClose={onTabClose}
            />
          ) : (
            <span className="text-sm font-medium text-ide-text ml-2">{t("terminal.list")}</span>
          )}
        </div>

        <div className="flex items-center gap-1 pl-2 border-l border-ide-border ml-2">
          <button
            onClick={onToggleListMode}
            className={`p-2 rounded-md hover:bg-ide-bg ${isListMode ? "text-ide-mute" : "text-ide-accent"}`}
            title={isListMode ? t("terminal.backToTerminal") : t("terminal.list")}
          >
            {isListMode ? <LayoutList size={18} className="rotate-180" /> : <LayoutList size={18} />}
          </button>

          <button
            onClick={onNewTerminal}
            className="p-2 rounded-md text-ide-mute hover:bg-ide-bg hover:text-ide-text"
            title={t("terminal.new")}
          >
            <Plus size={18} />
          </button>

          {onClearAll && isListMode && terminals.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-2 rounded-md text-ide-mute hover:bg-red-500/10 hover:text-red-500"
              title={t("terminal.clearAll")}
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalToolbar;

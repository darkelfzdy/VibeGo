import { type FC, useCallback, useEffect, useRef, useState } from "react";
import type { GenericGroup } from "@/stores/frame-store";

export type WorkspaceHintPlacement = "right" | "top";

interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface WorkspaceHintState {
  name: string;
  path: string;
  anchor: AnchorRect;
  placement: WorkspaceHintPlacement;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getWorkspacePath(group: GenericGroup): string {
  return group.pages.find((page) => page.path)?.path || "";
}

export function getWorkspaceGroupTitle(group: GenericGroup): string {
  const path = getWorkspacePath(group);
  return path ? `${group.name} - ${path}` : group.name;
}

function compactPath(path: string): string {
  if (!path) return "";
  const normalized = path.replace(/[\\/]+$/, "") || path;
  if (normalized === "/" || normalized === "\\") return normalized;
  const separator = normalized.includes("\\") ? "\\" : "/";
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 4) return normalized;
  const prefix = normalized.startsWith(separator) ? separator : "";
  return `${prefix}${parts[0]}${separator}...${separator}${parts.slice(-2).join(separator)}`;
}

export function useWorkspaceHint(placement: WorkspaceHintPlacement) {
  const [hint, setHint] = useState<WorkspaceHintState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showWorkspaceHint = useCallback(
    (group: GenericGroup, target: HTMLElement) => {
      const path = getWorkspacePath(group);
      if (!path) return;
      const rect = target.getBoundingClientRect();
      if (timerRef.current) clearTimeout(timerRef.current);
      setHint({
        name: group.name,
        path,
        anchor: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        placement,
      });
      timerRef.current = setTimeout(() => setHint(null), 1500);
    },
    [placement]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { hint, showWorkspaceHint };
}

const WorkspaceHintBubble: FC<{ hint: WorkspaceHintState | null }> = ({ hint }) => {
  if (!hint) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.min(320, viewportWidth - 24);
  const centerX = hint.anchor.left + hint.anchor.width / 2;
  const centerY = hint.anchor.top + hint.anchor.height / 2;
  const isTop = hint.placement === "top";
  const style = isTop
    ? {
        left: clamp(centerX, 12 + maxWidth / 2, viewportWidth - 12 - maxWidth / 2),
        top: hint.anchor.top - 8,
        maxWidth,
        transform: "translate(-50%, -100%)",
      }
    : {
        left: Math.min(hint.anchor.left + hint.anchor.width + 8, viewportWidth - 12),
        top: clamp(centerY, 12, viewportHeight - 12),
        maxWidth,
        transform: "translateY(-50%)",
      };

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border border-ide-border bg-ide-panel/95 px-2.5 py-2 text-left shadow-lg backdrop-blur-sm"
      style={style}
    >
      <span
        className={`absolute h-2 w-2 rotate-45 border-ide-border bg-ide-panel/95 ${
          isTop
            ? "bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r"
            : "left-[-5px] top-1/2 -translate-y-1/2 border-b border-l"
        }`}
      />
      <div className="relative min-w-0 max-w-full">
        <div className="truncate text-xs font-medium text-ide-text">{hint.name}</div>
        <div className="truncate text-[10px] text-ide-mute" title={hint.path}>
          {compactPath(hint.path)}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceHintBubble;

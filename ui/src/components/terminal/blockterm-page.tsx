import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { Check, Copy, Maximize2, Minimize2, Play, Plus, RotateCcw, Server, Square, Trash2, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalApi } from "@/api/terminal";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { useTranslation } from "@/lib/i18n";
import { useAppStore, useFrameStore, useSessionStore, useTerminalStore } from "@/stores";

type BlockStatus = "running" | "success" | "error" | "interrupted";
type BlockMode = "text" | "terminal";

interface BlockTermBlock {
  id: string;
  command: string;
  output: string;
  status: BlockStatus;
  mode: BlockMode;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt?: number;
}

interface BlockTermSession {
  id: string;
  name: string;
  cwd: string;
  status: "connecting" | "ready" | "running" | "exited";
  blocks: BlockTermBlock[];
  draft: string;
  activeBlockId: string | null;
}

interface ParsedFrame {
  kind: "start" | "end";
  id: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
}

type TerminalSegment = { type: "text"; value: string; hasTuiSequence: boolean } | { type: "frame"; frame: ParsedFrame };

interface SessionRuntime {
  decoder: TextDecoder;
  parseBuffer: string;
  shellReady: boolean;
  ws: WebSocket | null;
}

interface TerminalRuntime {
  fitAddon: FitAddon;
  terminal: XTerm;
}

interface BlockTermPageProps {
  groupId: string;
}

const MARK_PREFIX = "__VIBEGO_BLOCKTERM__";
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const OSC_SEQUENCE_RE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");
const CSI_SEQUENCE_RE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");
const CHARSET_SEQUENCE_RE = new RegExp(`${ESC}[()][A-Za-z0-9]`, "g");
const TUI_SEQUENCE_RE = new RegExp(`${ESC}\\[\\?(?:47|1047|1049)h`);
const MAX_TEXT_OUTPUT_LENGTH = 200_000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const TUI_COMMANDS = new Set([
  "btop",
  "fzf",
  "htop",
  "k9s",
  "lazygit",
  "less",
  "man",
  "more",
  "nano",
  "nvim",
  "screen",
  "ssh",
  "tig",
  "tmux",
  "top",
  "vi",
  "vim",
]);

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function encodeUtf8Base64(data: string): string {
  const bytes = new TextEncoder().encode(data);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function decodeBase64Utf8(data: string, decoder: TextDecoder): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return decoder.decode(bytes, { stream: true });
}

function decodeBase64Text(data: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0)));
  } catch {
    return "";
  }
}

function getInitialCwd(): string {
  const groups = useFrameStore.getState().groups;
  for (const group of groups) {
    if (group.type !== "group") continue;
    const page = group.pages.find((item) => item.type === "files" && item.path);
    if (page?.path) return page.path;
  }
  return ".";
}

function getCompactPath(path: string): string {
  if (!path || path === ".") return path || ".";
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return normalized || "/";
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function shouldFullscreenTerminalMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

function escapeShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildWrappedCommand(command: string, blockId: string): string {
  const userCommand = command.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const id = escapeShellSingleQuoted(blockId);
  const prefix = escapeShellSingleQuoted(MARK_PREFIX);
  const command64 = escapeShellSingleQuoted(encodeUtf8Base64(userCommand));
  return [
    `{`,
    `printf '\\033]633;%s;start;%s;%s;%s\\007\\n' ${prefix} ${id} "$(pwd)" ${command64}`,
    userCommand,
    `__vibego_blockterm_exit=$?`,
    `printf '\\n\\033]633;%s;end;%s;%s;%s\\007\\n' ${prefix} ${id} "$__vibego_blockterm_exit" "$(pwd)"`,
    `unset __vibego_blockterm_exit`,
    `}`,
    "",
  ].join("\n");
}

function stripAnsiForText(value: string): string {
  return value
    .replace(OSC_SEQUENCE_RE, "")
    .replace(CSI_SEQUENCE_RE, "")
    .replace(CHARSET_SEQUENCE_RE, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function findOscTerminator(value: string, start: number): { index: number; length: number } | null {
  const bellIndex = value.indexOf("\x07", start);
  const stIndex = value.indexOf("\x1b\\", start);
  if (bellIndex === -1 && stIndex === -1) return null;
  if (bellIndex !== -1 && (stIndex === -1 || bellIndex < stIndex)) return { index: bellIndex, length: 1 };
  return { index: stIndex, length: 2 };
}

function extractSegmentsFromBuffer(value: string): { segments: TerminalSegment[]; rest: string } {
  const segments: TerminalSegment[] = [];
  let index = 0;
  while (index < value.length) {
    const markerStart = value.indexOf("\x1b]633;", index);
    if (markerStart === -1) break;
    if (markerStart > index) {
      const text = value.slice(index, markerStart);
      segments.push({ type: "text", value: text, hasTuiSequence: TUI_SEQUENCE_RE.test(text) });
    }
    const terminator = findOscTerminator(value, markerStart + 6);
    if (!terminator) return { segments, rest: value.slice(markerStart) };
    const parts = value.slice(markerStart + 6, terminator.index).split(";");
    if (parts[0] === MARK_PREFIX) {
      if (parts[1] === "start" && parts[2]) {
        segments.push({
          type: "frame",
          frame: { kind: "start", id: parts[2], cwd: parts[3], command: parts[4] ? decodeBase64Text(parts[4]) : "" },
        });
      }
      if (parts[1] === "end" && parts[2]) {
        const exitCode = Number.parseInt(parts[3] || "0", 10);
        segments.push({
          type: "frame",
          frame: {
            kind: "end",
            id: parts[2],
            exitCode: Number.isFinite(exitCode) ? exitCode : 1,
            cwd: parts.slice(4).join(";"),
          },
        });
      }
    }
    index = terminator.index + terminator.length;
  }
  const trailing = value.slice(index);
  const possibleMarkerStarts = ["\x1b]633;", "\x1b]633", "\x1b]63", "\x1b]6", "\x1b]", "\x1b"];
  let partialIndex = -1;
  for (const marker of possibleMarkerStarts) {
    const found = trailing.lastIndexOf(marker);
    if (found > partialIndex) partialIndex = found;
  }
  if (partialIndex >= 0) {
    const text = trailing.slice(0, partialIndex);
    if (text) segments.push({ type: "text", value: text, hasTuiSequence: TUI_SEQUENCE_RE.test(text) });
    return { segments, rest: trailing.slice(partialIndex) };
  }
  if (trailing) {
    segments.push({ type: "text", value: trailing, hasTuiSequence: TUI_SEQUENCE_RE.test(trailing) });
  }
  return { segments, rest: "" };
}

function shouldUseTerminalMode(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const firstToken =
    trimmed
      .match(/^(?:sudo\s+|env\s+)*(?:[\w./-]+)/)?.[0]
      .trim()
      .split(/\s+/)
      .pop() || "";
  const commandName = firstToken.split("/").pop() || firstToken;
  if (TUI_COMMANDS.has(commandName)) return true;
  if (/\|\s*(less|more|fzf)\b/.test(trimmed)) return true;
  if (/\b(git\s+(log|show|diff|blame)|gh\s+[^|]*\|\s*less)\b/.test(trimmed)) return true;
  return false;
}

function getXtermTheme(theme: string) {
  const isDark = theme !== "light";
  return {
    background: isDark ? "#18181b" : "#ffffff",
    foreground: isDark ? "#d4d4d8" : "#18181b",
    cursor: isDark ? "#a1a1aa" : "#52525b",
    selectionBackground: isDark ? "rgba(161,161,170,0.3)" : "rgba(82,82,91,0.25)",
  };
}

function blockStatusClass(status: BlockStatus): string {
  switch (status) {
    case "running":
      return "text-blue-500";
    case "success":
      return "text-green-500";
    case "error":
      return "text-red-500";
    case "interrupted":
      return "text-yellow-500";
  }
}

const BlockTerminalView: React.FC<{
  blockId: string;
  fullscreen: boolean;
  isActive: boolean;
  onMount: (blockId: string, element: HTMLDivElement) => void;
  onUnmount: (blockId: string) => void;
  onToggleFullscreen: () => void;
}> = ({ blockId, fullscreen, isActive, onMount, onUnmount, onToggleFullscreen }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    onMount(blockId, element);
    return () => onUnmount(blockId);
  }, [blockId, onMount, onUnmount]);

  return (
    <div
      className={`border border-ide-border bg-black overflow-hidden ${fullscreen ? "fixed inset-0 z-50" : "h-[52vh] min-h-72"}`}
    >
      <div className="h-9 px-2 border-b border-ide-border bg-ide-panel flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-ide-mute">
          <Server size={14} />
          <span>{isActive ? "TUI" : "TUI snapshot"}</span>
        </div>
        <button
          className="p-1.5 text-ide-mute hover:text-ide-text hover:bg-ide-bg rounded"
          onClick={onToggleFullscreen}
        >
          {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      <div ref={ref} className="h-[calc(100%-36px)] w-full" />
    </div>
  );
};

const BlockTermPage: React.FC<BlockTermPageProps> = ({ groupId }) => {
  const locale = useAppStore((state) => state.locale);
  const theme = useAppStore((state) => state.theme);
  const t = useTranslation(locale);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const removeTerminal = useTerminalStore((state) => state.removeTerminal);
  const setTerminalStatus = useTerminalStore((state) => state.setTerminalStatus);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);

  const [sessions, setSessions] = useState<BlockTermSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [fullscreenBlockId, setFullscreenBlockId] = useState<string | null>(null);

  const runtimesRef = useRef<Map<string, SessionRuntime>>(new Map());
  const outputRef = useRef<Record<string, string>>({});
  const modeRef = useRef<Record<string, BlockMode>>({});
  const xtermRefs = useRef<Map<string, TerminalRuntime>>(new Map());
  const pendingTerminalOutputRef = useRef<Map<string, string[]>>(new Map());
  const sessionActiveBlockRef = useRef<Record<string, string | null>>({});
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const connectSessionRef = useRef<(sessionId: string) => void>(() => {});

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [activeSessionId, sessions]
  );

  const setSessionPatch = useCallback((sessionId: string, patch: Partial<BlockTermSession>) => {
    setSessions((items) => items.map((item) => (item.id === sessionId ? { ...item, ...patch } : item)));
  }, []);

  const updateSessionBlock = useCallback((sessionId: string, blockId: string, patch: Partial<BlockTermBlock>) => {
    setSessions((items) =>
      items.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              blocks: session.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
            }
          : session
      )
    );
  }, []);

  const sendInput = useCallback((sessionId: string, data: string): boolean => {
    const ws = runtimesRef.current.get(sessionId)?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify({ type: "input", data: encodeUtf8Base64(data) }));
    return true;
  }, []);

  const resizeSession = useCallback((sessionId: string, cols = DEFAULT_COLS, rows = DEFAULT_ROWS) => {
    const ws = runtimesRef.current.get(sessionId)?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "resize", cols, rows }));
  }, []);

  const appendBlockOutput = useCallback(
    (sessionId: string, blockId: string, raw: string) => {
      const clean = stripAnsiForText(raw);
      if (!clean) return;
      const previous = outputRef.current[blockId] || "";
      const next =
        previous.length + clean.length > MAX_TEXT_OUTPUT_LENGTH
          ? `${previous}${clean}`.slice(-MAX_TEXT_OUTPUT_LENGTH)
          : `${previous}${clean}`;
      outputRef.current[blockId] = next;
      updateSessionBlock(sessionId, blockId, { output: next });
    },
    [updateSessionBlock]
  );

  const writeTerminalOutput = useCallback((blockId: string, raw: string) => {
    if (!raw) return;
    const runtime = xtermRefs.current.get(blockId);
    if (runtime) {
      runtime.terminal.write(raw);
      return;
    }
    const pending = pendingTerminalOutputRef.current.get(blockId) || [];
    pending.push(raw);
    pendingTerminalOutputRef.current.set(blockId, pending);
  }, []);

  const promoteBlockToTerminal = useCallback(
    (sessionId: string, blockId: string) => {
      modeRef.current[blockId] = "terminal";
      updateSessionBlock(sessionId, blockId, { mode: "terminal" });
      if (shouldFullscreenTerminalMode()) setFullscreenBlockId(blockId);
      const existingOutput = outputRef.current[blockId];
      if (existingOutput) writeTerminalOutput(blockId, existingOutput);
    },
    [updateSessionBlock, writeTerminalOutput]
  );

  const finishBlock = useCallback((sessionId: string, blockId: string, exitCode: number, nextCwd?: string) => {
    sessionActiveBlockRef.current[sessionId] = null;
    setSessions((items) =>
      items.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              cwd: nextCwd || session.cwd,
              status: "ready",
              activeBlockId: null,
              blocks: session.blocks.map((block) =>
                block.id === blockId
                  ? {
                      ...block,
                      cwd: nextCwd || block.cwd,
                      exitCode,
                      finishedAt: Date.now(),
                      status: block.status === "interrupted" ? "interrupted" : exitCode === 0 ? "success" : "error",
                    }
                  : block
              ),
            }
          : session
      )
    );
  }, []);

  const handleTerminalData = useCallback(
    (sessionId: string, raw: string) => {
      const runtime = runtimesRef.current.get(sessionId);
      if (!runtime) return;
      const parsed = extractSegmentsFromBuffer(`${runtime.parseBuffer}${raw}`);
      runtime.parseBuffer = parsed.rest;
      for (const segment of parsed.segments) {
        if (segment.type === "text") {
          const activeBlockId = sessionActiveBlockRef.current[sessionId];
          if (!activeBlockId) continue;
          if (segment.hasTuiSequence) promoteBlockToTerminal(sessionId, activeBlockId);
          if (modeRef.current[activeBlockId] === "terminal") {
            writeTerminalOutput(activeBlockId, segment.value);
            continue;
          }
          appendBlockOutput(sessionId, activeBlockId, segment.value);
          continue;
        }

        const { frame } = segment;
        if (frame.kind === "start") {
          sessionActiveBlockRef.current[sessionId] = frame.id;
          if (!modeRef.current[frame.id]) {
            const command = frame.command || "";
            modeRef.current[frame.id] = shouldUseTerminalMode(command) ? "terminal" : "text";
            outputRef.current[frame.id] = outputRef.current[frame.id] || "";
            setSessions((items) =>
              items.map((session) => {
                if (session.id !== sessionId || session.blocks.some((block) => block.id === frame.id)) return session;
                return {
                  ...session,
                  cwd: frame.cwd || session.cwd,
                  status: "running",
                  blocks: [
                    ...session.blocks,
                    {
                      id: frame.id,
                      command,
                      output: "",
                      status: "running",
                      mode: modeRef.current[frame.id],
                      cwd: frame.cwd || session.cwd,
                      exitCode: null,
                      startedAt: Date.now(),
                    },
                  ],
                };
              })
            );
          }
          if (frame.cwd) setSessionPatch(sessionId, { cwd: frame.cwd, status: "running" });
          continue;
        }
        finishBlock(sessionId, frame.id, frame.exitCode ?? 1, frame.cwd);
      }
    },
    [appendBlockOutput, finishBlock, promoteBlockToTerminal, setSessionPatch, writeTerminalOutput]
  );

  const connectSession = useCallback(
    (sessionId: string) => {
      let runtime = runtimesRef.current.get(sessionId);
      if (!runtime) {
        runtime = { decoder: new TextDecoder("utf-8", { fatal: false }), parseBuffer: "", shellReady: false, ws: null };
        runtimesRef.current.set(sessionId, runtime);
      }
      runtime.decoder = new TextDecoder("utf-8", { fatal: false });
      runtime.parseBuffer = "";
      runtime.shellReady = false;
      setSessionPatch(sessionId, { status: "connecting" });

      const oldTimer = reconnectTimersRef.current.get(sessionId);
      if (oldTimer) clearTimeout(oldTimer);
      reconnectTimersRef.current.delete(sessionId);

      if (runtime.ws) {
        runtime.ws.onclose = null;
        runtime.ws.close();
      }

      const ws = new WebSocket(terminalApi.wsUrl(sessionId));
      runtime.ws = ws;
      ws.onopen = () => resizeSession(sessionId);
      ws.onmessage = (event) => {
        if (runtimesRef.current.get(sessionId)?.ws !== ws) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "replay_done") {
            const current = runtimesRef.current.get(sessionId);
            if (current) current.shellReady = true;
            ws.send(JSON.stringify({ type: "input", data: encodeUtf8Base64("stty -echo\n") }));
            setSessionPatch(sessionId, { status: sessionActiveBlockRef.current[sessionId] ? "running" : "ready" });
            return;
          }
          if (msg.type === "state") {
            updateTerminal(groupId, sessionId, {
              currentCwd: typeof msg.current_cwd === "string" ? msg.current_cwd : undefined,
              readonly: !!msg.readonly,
              status:
                msg.status === "running" || msg.status === "exited" || msg.status === "closed" ? msg.status : undefined,
            });
            if (typeof msg.current_cwd === "string" && msg.current_cwd)
              setSessionPatch(sessionId, { cwd: msg.current_cwd });
            return;
          }
          if (msg.type === "output" || msg.type === "replay") {
            const current = runtimesRef.current.get(sessionId);
            if (!current || typeof msg.data !== "string") return;
            handleTerminalData(sessionId, decodeBase64Utf8(msg.data, current.decoder));
            return;
          }
          if (msg.type === "pty_exited") {
            setSessionPatch(sessionId, { status: "exited", activeBlockId: null });
            setTerminalStatus(groupId, sessionId, "exited");
          }
        } catch {}
      };
      ws.onclose = () => {
        if (runtimesRef.current.get(sessionId)?.ws !== ws) return;
        const current = runtimesRef.current.get(sessionId);
        if (current) current.ws = null;
        setSessionPatch(sessionId, { status: "connecting" });
        const timer = setTimeout(() => connectSessionRef.current(sessionId), 1200);
        reconnectTimersRef.current.set(sessionId, timer);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    },
    [groupId, handleTerminalData, resizeSession, setSessionPatch, setTerminalStatus, updateTerminal]
  );

  useEffect(() => {
    connectSessionRef.current = connectSession;
  }, [connectSession]);

  const createSession = useCallback(async () => {
    const cwd = getInitialCwd();
    const index = sessions.length + 1;
    const result = await terminalApi.create({
      cwd,
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      group_id: groupId,
      name: `BlockTerm ${index}`,
      workspace_session_id: currentSessionId || undefined,
    });
    const session: BlockTermSession = {
      id: result.id,
      name: result.name || `BlockTerm ${index}`,
      cwd,
      status: "connecting",
      blocks: [],
      draft: "",
      activeBlockId: null,
    };
    addTerminal(groupId, { id: result.id, name: session.name, pinned: true, cwd });
    setSessions((items) => [...items, session]);
    setActiveSessionId(result.id);
    connectSession(result.id);
  }, [addTerminal, connectSession, currentSessionId, groupId, sessions.length]);

  useEffect(() => {
    if (sessions.length === 0) void createSession();
  }, [createSession, sessions.length]);

  useEffect(() => {
    return () => {
      for (const timer of reconnectTimersRef.current.values()) clearTimeout(timer);
      for (const runtime of runtimesRef.current.values()) {
        if (runtime.ws) {
          runtime.ws.onclose = null;
          runtime.ws.close();
        }
      }
      for (const runtime of xtermRefs.current.values()) runtime.terminal.dispose();
      xtermRefs.current.clear();
    };
  }, []);

  const setDraft = useCallback(
    (sessionId: string, draft: string) => {
      setSessionPatch(sessionId, { draft });
    },
    [setSessionPatch]
  );

  const runCommand = useCallback(
    (sessionId: string, command: string) => {
      const trimmed = command.trim();
      const session = sessions.find((item) => item.id === sessionId);
      if (!trimmed || !session || session.status === "connecting" || sessionActiveBlockRef.current[sessionId]) return;
      const blockId = generateId();
      const mode: BlockMode = shouldUseTerminalMode(trimmed) ? "terminal" : "text";
      outputRef.current[blockId] = "";
      modeRef.current[blockId] = mode;
      sessionActiveBlockRef.current[sessionId] = blockId;
      if (mode === "terminal" && shouldFullscreenTerminalMode()) setFullscreenBlockId(blockId);
      setSessions((items) =>
        items.map((item) =>
          item.id === sessionId
            ? {
                ...item,
                draft: "",
                status: "running",
                activeBlockId: blockId,
                blocks: [
                  ...item.blocks,
                  {
                    id: blockId,
                    command,
                    output: "",
                    status: "running",
                    mode,
                    cwd: item.cwd,
                    exitCode: null,
                    startedAt: Date.now(),
                  },
                ],
              }
            : item
        )
      );
      sendInput(sessionId, buildWrappedCommand(command, blockId));
    },
    [sendInput, sessions]
  );

  const stopSession = useCallback(
    (sessionId: string) => {
      const blockId = sessionActiveBlockRef.current[sessionId];
      if (!blockId) return;
      sendInput(sessionId, "\x03");
      sessionActiveBlockRef.current[sessionId] = null;
      setSessions((items) =>
        items.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                status: "ready",
                activeBlockId: null,
                blocks: session.blocks.map((block) =>
                  block.id === blockId
                    ? { ...block, status: "interrupted", finishedAt: Date.now(), exitCode: null }
                    : block
                ),
              }
            : session
        )
      );
    },
    [sendInput]
  );

  const closeSession = useCallback(
    async (sessionId: string) => {
      const runtime = runtimesRef.current.get(sessionId);
      if (runtime?.ws) {
        runtime.ws.onclose = null;
        runtime.ws.close();
      }
      runtimesRef.current.delete(sessionId);
      const timer = reconnectTimersRef.current.get(sessionId);
      if (timer) clearTimeout(timer);
      reconnectTimersRef.current.delete(sessionId);
      sessionActiveBlockRef.current[sessionId] = null;
      const session = sessions.find((item) => item.id === sessionId);
      if (session) {
        for (const block of session.blocks) {
          const terminalRuntime = xtermRefs.current.get(block.id);
          if (terminalRuntime) {
            terminalRuntime.terminal.dispose();
            xtermRefs.current.delete(block.id);
          }
          pendingTerminalOutputRef.current.delete(block.id);
          delete modeRef.current[block.id];
          delete outputRef.current[block.id];
        }
      }
      await terminalApi.close(sessionId).catch(() => {});
      removeTerminal(groupId, sessionId);
      setSessions((items) => {
        const next = items.filter((item) => item.id !== sessionId);
        if (activeSessionId === sessionId) setActiveSessionId(next[0]?.id ?? null);
        return next;
      });
    },
    [activeSessionId, groupId, removeTerminal, sessions]
  );

  const deleteBlock = useCallback((blockId: string) => {
    outputRef.current[blockId] = "";
    delete modeRef.current[blockId];
    const runtime = xtermRefs.current.get(blockId);
    if (runtime) {
      runtime.terminal.dispose();
      xtermRefs.current.delete(blockId);
    }
    pendingTerminalOutputRef.current.delete(blockId);
    setSessions((items) =>
      items.map((session) => ({ ...session, blocks: session.blocks.filter((block) => block.id !== blockId) }))
    );
  }, []);

  const copyText = useCallback((id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    });
  }, []);

  const mountTerminal = useCallback(
    (blockId: string, element: HTMLDivElement) => {
      if (xtermRefs.current.has(blockId)) return;
      const terminal = new XTerm({
        allowProposedApi: true,
        convertEol: true,
        cursorBlink: Object.values(sessionActiveBlockRef.current).includes(blockId),
        disableStdin: !Object.values(sessionActiveBlockRef.current).includes(blockId),
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        scrollback: 4000,
        theme: getXtermTheme(theme),
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(element);
      fitAddon.fit();
      terminal.onData((data) => {
        const sessionId = Object.entries(sessionActiveBlockRef.current).find(
          ([, activeBlockId]) => activeBlockId === blockId
        )?.[0];
        if (sessionId) sendInput(sessionId, data);
      });
      xtermRefs.current.set(blockId, { fitAddon, terminal });
      const pending = pendingTerminalOutputRef.current.get(blockId);
      if (pending) {
        for (const raw of pending) terminal.write(raw);
        pendingTerminalOutputRef.current.delete(blockId);
      }
      setTimeout(() => fitAddon.fit(), 50);
    },
    [sendInput, theme]
  );

  const unmountTerminal = useCallback((blockId: string) => {
    const runtime = xtermRefs.current.get(blockId);
    if (!runtime) return;
    runtime.terminal.dispose();
    xtermRefs.current.delete(blockId);
  }, []);

  useEffect(() => {
    for (const [blockId, runtime] of xtermRefs.current.entries()) {
      const active = Object.values(sessionActiveBlockRef.current).includes(blockId);
      runtime.terminal.options.theme = getXtermTheme(theme);
      runtime.terminal.options.disableStdin = !active;
      runtime.terminal.options.cursorBlink = active;
      setTimeout(() => runtime.fitAddon.fit(), 0);
    }
  }, [theme, sessions, fullscreenBlockId]);

  const topBarConfig = useMemo(
    () => ({
      show: true,
      centerContent: (
        <div className="flex items-center gap-2 min-w-0">
          <Server size={16} className="text-ide-accent shrink-0" />
          <span className="text-sm font-medium text-ide-text shrink-0">{t("plugin.blockTerm.title")}</span>
          {activeSession && (
            <span className="text-xs text-ide-mute truncate hidden sm:inline">
              /{getCompactPath(activeSession.cwd)}
            </span>
          )}
        </div>
      ),
      rightButtons: [
        {
          icon: <Plus size={16} />,
          title: t("plugin.blockTerm.newSession"),
          onClick: () => void createSession(),
        },
      ],
    }),
    [activeSession, createSession, t]
  );

  usePageTopBar(topBarConfig, [topBarConfig]);

  return (
    <div className="h-full bg-ide-bg text-ide-text flex flex-col overflow-hidden">
      <div className="h-10 shrink-0 border-b border-ide-border bg-ide-panel flex items-center gap-2 px-2 overflow-x-auto custom-scrollbar touch-pan-x">
        {sessions.map((session) => {
          const active = session.id === activeSession?.id;
          return (
            <button
              key={session.id}
              className={`h-7 shrink-0 px-2 flex items-center gap-2 border text-xs ${
                active
                  ? "bg-ide-bg border-ide-accent text-ide-accent"
                  : "bg-transparent border-ide-border text-ide-mute hover:text-ide-text hover:bg-ide-bg"
              }`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <Server size={13} />
              <span className="max-w-[120px] truncate">{session.name}</span>
              <span className="hidden sm:inline text-[10px] opacity-70">/{getCompactPath(session.cwd)}</span>
              {sessions.length > 1 && (
                <span
                  className="p-0.5 hover:text-red-500"
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeSession(session.id);
                  }}
                >
                  <X size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 sm:px-4 py-3">
        {!activeSession ? null : (
          <div className="max-w-5xl mx-auto flex flex-col gap-2 pb-8">
            {activeSession.blocks.map((block) => {
              const isRunning = block.status === "running";
              const duration = block.finishedAt
                ? `${((block.finishedAt - block.startedAt) / 1000).toFixed(1)}s`
                : isRunning
                  ? t("plugin.blockTerm.running")
                  : "";
              return (
                <div key={block.id} className="group border border-ide-border bg-ide-panel">
                  <div className="px-3 py-2 flex items-start gap-2">
                    <span className="text-[11px] text-ide-mute font-mono pt-0.5 shrink-0">~ ›</span>
                    <div className="flex-1 min-w-0">
                      <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words font-mono text-ide-text">
                        {block.command}
                      </pre>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`hidden sm:inline text-[11px] ${blockStatusClass(block.status)}`}>
                        {duration}
                        {block.exitCode !== null ? ` · ${block.exitCode}` : ""}
                      </span>
                      {isRunning ? (
                        <button
                          className="p-1.5 text-ide-mute hover:text-yellow-500 hover:bg-ide-bg"
                          onClick={() => stopSession(activeSession.id)}
                        >
                          <Square size={14} />
                        </button>
                      ) : (
                        <button
                          className="p-1.5 text-ide-mute hover:text-ide-text hover:bg-ide-bg"
                          onClick={() => runCommand(activeSession.id, block.command)}
                          disabled={activeSession.status === "connecting" || !!activeSession.activeBlockId}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        className="p-1.5 text-ide-mute hover:text-ide-text hover:bg-ide-bg"
                        onClick={() => copyText(block.id, block.output || block.command)}
                      >
                        {copiedId === block.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      {!isRunning && (
                        <button
                          className="p-1.5 text-ide-mute hover:text-red-500 hover:bg-ide-bg"
                          onClick={() => deleteBlock(block.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {block.mode === "terminal" ? (
                    <BlockTerminalView
                      blockId={block.id}
                      fullscreen={fullscreenBlockId === block.id}
                      isActive={isRunning}
                      onMount={mountTerminal}
                      onUnmount={unmountTerminal}
                      onToggleFullscreen={() =>
                        setFullscreenBlockId((current) => (current === block.id ? null : block.id))
                      }
                    />
                  ) : (
                    <pre
                      className={`px-3 pb-3 min-h-6 max-h-[52vh] overflow-auto custom-scrollbar text-xs sm:text-sm leading-relaxed font-mono whitespace-pre-wrap break-words ${
                        block.status === "error" ? "text-red-500" : "text-ide-text"
                      }`}
                    >
                      {block.output || (isRunning ? t("plugin.blockTerm.waitingOutput") : "")}
                    </pre>
                  )}
                </div>
              );
            })}

            <div className="border border-ide-border bg-ide-panel shadow-sm focus-within:border-ide-accent">
              <div className="px-3 py-2 flex items-start gap-2">
                <span className="text-[11px] text-ide-mute font-mono pt-1 shrink-0">~ ›</span>
                <textarea
                  value={activeSession.draft}
                  onChange={(event) => setDraft(activeSession.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
                    event.preventDefault();
                    runCommand(activeSession.id, activeSession.draft);
                  }}
                  disabled={activeSession.status === "connecting" || activeSession.status === "running"}
                  rows={Math.min(8, Math.max(2, activeSession.draft.split("\n").length))}
                  className="flex-1 min-h-16 resize-none bg-transparent text-sm font-mono text-ide-text outline-none disabled:opacity-60"
                  placeholder={t("plugin.blockTerm.placeholder")}
                />
                <button
                  className="h-8 px-2 border border-ide-border bg-ide-accent text-ide-on-accent disabled:opacity-50 disabled:bg-ide-border disabled:text-ide-mute flex items-center gap-1.5"
                  onClick={() => runCommand(activeSession.id, activeSession.draft)}
                  disabled={
                    activeSession.status === "connecting" ||
                    activeSession.status === "running" ||
                    !activeSession.draft.trim()
                  }
                >
                  <Play size={14} />
                  <span className="hidden sm:inline text-xs">{t("plugin.blockTerm.run")}</span>
                </button>
              </div>
              <div className="px-3 pb-2 text-[11px] text-ide-mute font-mono truncate">
                {activeSession.status === "connecting"
                  ? t("plugin.blockTerm.connecting")
                  : activeSession.status === "running"
                    ? t("plugin.blockTerm.running")
                    : activeSession.status === "exited"
                      ? t("plugin.blockTerm.disconnected")
                      : t("plugin.blockTerm.ready")}{" "}
                · {activeSession.cwd}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockTermPage;

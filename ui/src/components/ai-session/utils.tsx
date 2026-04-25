import React from "react";
import type { AIProviderId, AISessionMessage, AISessionMeta } from "@/types/ai-session";

export const providerOrder: AIProviderId[] = ["claude", "codex", "gemini", "opencode", "openclaw"];

export const providerLabels: Record<AIProviderId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

export function formatCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderHighlightedText(content: string, query: string) {
  const needle = query.trim();
  if (!needle) {
    return content;
  }
  const matcher = new RegExp(`(${escapeRegExp(needle)})`, "ig");
  return content.split(matcher).map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="bg-amber-300/60 px-0.5 text-ide-text">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    )
  );
}

export function roleTone(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return "border-l-2 border-l-blue-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "user") {
    return "border-l-2 border-l-emerald-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "tool") {
    return "border-l-2 border-l-amber-500/70 border-ide-border bg-ide-panel";
  }
  if (normalized === "system") {
    return "border-l-2 border-l-violet-500/70 border-ide-border bg-ide-panel";
  }
  return "border-l-2 border-l-ide-border border-ide-border bg-ide-panel";
}

export function roleLabelTone(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return "border-blue-500/30 text-blue-500";
  }
  if (normalized === "user") {
    return "border-emerald-500/30 text-emerald-500";
  }
  if (normalized === "tool") {
    return "border-amber-500/35 text-amber-500";
  }
  if (normalized === "system") {
    return "border-violet-500/35 text-violet-500";
  }
  return "border-ide-border text-ide-mute";
}

export function roleLabel(role: string, t: (key: string) => string) {
  const normalized = role.toLowerCase();
  if (normalized === "assistant") {
    return t("plugin.aiSessionManager.roleAssistant");
  }
  if (normalized === "user") {
    return t("plugin.aiSessionManager.roleUser");
  }
  if (normalized === "tool") {
    return t("plugin.aiSessionManager.roleTool");
  }
  if (normalized === "system") {
    return t("plugin.aiSessionManager.roleSystem");
  }
  return role || t("plugin.aiSessionManager.roleUnknown");
}

export function formatRelativeTime(value: number | undefined, locale: "en" | "zh", t: (key: string) => string) {
  if (!value) {
    return t("plugin.aiSessionManager.unknownTime");
  }
  const diff = Date.now() - value;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes <= 0) {
    return t("time.now");
  }
  if (minutes < 60) {
    return formatCount(t("time.minutesAgoShort"), minutes);
  }
  if (hours < 24) {
    return formatCount(t("time.hoursAgoShort"), hours);
  }
  if (days < 7) {
    return formatCount(t("time.daysAgoShort"), days);
  }
  return new Date(value).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US");
}

export function formatDateTime(value: number | undefined, locale: "en" | "zh") {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function buildSessionSearchText(session: AISessionMeta) {
  return [session.sessionId, session.title, session.summary, session.projectDir, session.sourcePath]
    .filter(Boolean)
    .join(" ");
}

export const MESSAGE_COLLAPSE_CHAR_THRESHOLD = 1800;
export const MESSAGE_COLLAPSE_LINE_THRESHOLD = 28;
export const MESSAGE_COLLAPSED_LENGTH = 900;

export interface SessionOutlineItem {
  index: number;
  content: string;
}

const OUTLINE_TITLE_MAX_CHARS = 96;

function truncateText(value: string, limit: number) {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit).trim()}...`;
}

function stripCodeBlocks(value: string) {
  return value.replace(/```[\s\S]*?```/g, "\n");
}

function stripTaggedBlocks(value: string) {
  return value
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "\n")
    .replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi, "\n");
}

function isGeneratedContextMessage(value: string) {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith("# agents.md instructions") ||
    lower.startsWith("<local-command-caveat>") ||
    lower.startsWith("<command-name>") ||
    lower.startsWith("knowledge cutoff:") ||
    lower.includes("<local-command-caveat>")
  );
}

function normalizeOutlineLine(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^>\s+/, "")
    .trim();
}

function isUsefulOutlineLine(value: string) {
  if (!value || value === "```") {
    return false;
  }
  if (/^<\/?[a-z][\w-]*(\s[^>]*)?>$/i.test(value)) {
    return false;
  }
  if (/^\[[a-z_ -]+:\s*.+\]$/i.test(value)) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(value);
}

function extractOutlineTitle(content: string) {
  const trimmed = content.trim();
  if (!trimmed || isGeneratedContextMessage(trimmed)) {
    return "";
  }
  const cleaned = stripTaggedBlocks(stripCodeBlocks(trimmed));
  const lines = cleaned.split(/\r?\n/).map(normalizeOutlineLine).filter(isUsefulOutlineLine);
  const heading = lines.find((line) => line.length >= 4) || lines[0] || "";
  return truncateText(heading, OUTLINE_TITLE_MAX_CHARS);
}

export function isLongAISessionMessage(content: string) {
  return (
    content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD || content.split(/\r?\n/).length > MESSAGE_COLLAPSE_LINE_THRESHOLD
  );
}

export function buildSessionOutlineItems(messages: AISessionMessage[]): SessionOutlineItem[] {
  const items: SessionOutlineItem[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role.toLowerCase() !== "user") {
      continue;
    }
    const content = extractOutlineTitle(message.content);
    if (!content) {
      continue;
    }
    const previous = items[items.length - 1];
    if (previous?.content.toLowerCase() === content.toLowerCase()) {
      continue;
    }
    items.push({ index, content });
  }
  return items;
}

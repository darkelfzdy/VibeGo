export type AIProviderId = "claude" | "codex" | "gemini" | "opencode" | "openclaw";

export interface AIProviderConfig {
  enabled: boolean;
  paths: string[];
}

export interface AISessionConfig {
  providers: Record<string, AIProviderConfig>;
  autoRescanOnOpen: boolean;
  cacheEnabled: boolean;
  showParseErrors: boolean;
}

export interface AISessionMeta {
  providerId: string;
  sessionId: string;
  title?: string;
  summary?: string;
  projectDir?: string;
  resumeCommand?: string;
  createdAt?: number;
  lastActiveAt?: number;
  sourcePath: string;
  messageCount?: number;
  parseError?: string;
  fileSize?: number;
  fileModTime?: number;
  scannedAt?: number;
}

export interface AISessionMessage {
  role: string;
  content: string;
  ts?: number;
}

export interface AIProviderStatus {
  providerId: string;
  enabled: boolean;
  paths: string[];
  available: boolean;
  sessionCount: number;
  errorCount: number;
  lastScanAt?: number;
}

export interface AIOverviewResponse {
  totalSessions: number;
  enabledProviders: number;
  scannedAt?: number;
  fromCache: boolean;
  providerStatus: AIProviderStatus[];
}

export interface AIListResponse {
  sessions: AISessionMeta[];
  providerStatus: AIProviderStatus[];
  fromCache: boolean;
  scannedAt?: number;
  config: AISessionConfig;
}

export interface AIMessagesResponse {
  session: AISessionMeta;
  messages: AISessionMessage[];
  parseWarnings: string[];
}

export interface AIDeleteRequest {
  providerId: string;
  sessionId: string;
  sourcePath: string;
}

export interface AIDeleteOutcome extends AIDeleteRequest {
  success: boolean;
  error?: string;
}

export const AI_PROVIDER_ORDER: AIProviderId[] = ["claude", "codex", "gemini", "opencode", "openclaw"];

export const AI_PROVIDER_TONE: Record<AIProviderId, string> = {
  claude: "bg-orange-500/12 text-orange-500 border-orange-500/20",
  codex: "bg-emerald-500/12 text-emerald-500 border-emerald-500/20",
  gemini: "bg-sky-500/12 text-sky-500 border-sky-500/20",
  opencode: "bg-amber-500/12 text-amber-600 border-amber-500/20",
  openclaw: "bg-rose-500/12 text-rose-500 border-rose-500/20",
};

import { request } from "@/api/request";
import type {
  AIDeleteOutcome,
  AIDeleteRequest,
  AIListResponse,
  AIMessagesResponse,
  AIOverviewResponse,
  AISessionConfig,
} from "@/types/ai-session";

export const aiSessionApi = {
  overview: () => request<AIOverviewResponse>("/ai-sessions/overview"),

  list: () => request<AIListResponse>("/ai-sessions"),

  rescan: () =>
    request<AIListResponse>("/ai-sessions/rescan", {
      method: "POST",
    }),

  messages: (providerId: string, sourcePath: string) =>
    request<AIMessagesResponse>("/ai-sessions/messages", {
      method: "POST",
      body: JSON.stringify({ providerId, sourcePath }),
    }),

  delete: (item: AIDeleteRequest) =>
    request<{ ok: boolean }>("/ai-sessions/delete", {
      method: "POST",
      body: JSON.stringify(item),
    }),

  deleteMany: (items: AIDeleteRequest[]) =>
    request<AIDeleteOutcome[]>("/ai-sessions/delete-batch", {
      method: "POST",
      body: JSON.stringify(items),
    }),

  getConfig: () => request<AISessionConfig>("/ai-sessions/config"),

  saveConfig: (config: AISessionConfig) =>
    request<AISessionConfig>("/ai-sessions/config", {
      method: "POST",
      body: JSON.stringify(config),
    }),
};

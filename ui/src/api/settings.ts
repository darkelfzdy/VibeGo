import { request } from "@/api/request";

export const settingsApi = {
  list: () => request<Record<string, string>>("/settings/list"),

  get: (key: string) => request<{ key: string; value: string }>(`/settings/get?key=${encodeURIComponent(key)}`),

  set: (key: string, value: string) =>
    request<{ ok: boolean }>("/settings/set", {
      method: "POST",
      body: JSON.stringify({ key, value }),
    }),

  delete: (key: string) =>
    request<{ ok: boolean }>(`/settings/${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),

  reset: () => request<{ ok: boolean }>("/settings/reset", { method: "POST" }),
};

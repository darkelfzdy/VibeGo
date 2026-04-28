import { request } from "@/api/request";

export interface PortInfo {
  port: number;
  protocol: string;
  localAddr: string;
  remoteAddr: string;
  status: string;
  pid: number;
  processName: string;
}

export interface ForwardRule {
  id: string;
  listenPort: number;
  protocol: string;
  targetAddr: string;
  enabled: boolean;
  error?: string;
}

export const portApi = {
  list: () => request<{ ports: PortInfo[] }>("/port"),

  killProcess: (pid: number) =>
    request<{ ok: boolean }>("/port/kill", {
      method: "POST",
      body: JSON.stringify({ pid }),
    }),

  listForwards: () => request<{ forwards: ForwardRule[] }>("/port/forwards"),

  addForward: (data: { listenPort: number; protocol: string; targetAddr: string; enabled: boolean }) =>
    request<ForwardRule>("/port/forwards", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  removeForward: (id: string) =>
    request<{ ok: boolean }>(`/port/forwards/${id}`, {
      method: "DELETE",
    }),

  toggleForward: (id: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/port/forwards/${id}/toggle`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
};

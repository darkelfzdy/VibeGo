import { request } from "@/api/request";

export interface CPUStats {
  usagePercent: number;
  cores: number;
  modelName: string;
  perCoreUsage?: number[];
}

export interface MemoryStats {
  total: number;
  used: number;
  available: number;
  usedPercent: number;
}

export interface LoadAverage {
  load1: number;
  load5: number;
  load15: number;
}

export interface SystemStats {
  cpu: CPUStats;
  memory: MemoryStats;
  loadAvg: LoadAverage;
  uptime: number;
  numProcess: number;
  os: string;
  arch: string;
  hostname: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  username: string;
  cpuPercent: number;
  memPercent: number;
  memRss: number;
  status: string;
  createTime: number;
  cmdline: string;
  ppid: number;
  numThreads: number;
}

export interface CombinedStats {
  system: SystemStats;
  processes: ProcessInfo[];
  total: number;
}

export const processApi = {
  systemStats: () => request<SystemStats>("/system/stats"),

  list: () => request<{ processes: ProcessInfo[] }>("/process"),

  combined: (limit = 100, offset = 0) => request<CombinedStats>(`/system/combined?limit=${limit}&offset=${offset}`),

  detail: (pid: number) => request<ProcessInfo>(`/process/${pid}`),

  kill: (pid: number, signal?: string) =>
    request<{ ok: boolean }>(`/process/${pid}/kill`, {
      method: "POST",
      body: JSON.stringify({ signal: signal || "SIGTERM" }),
    }),
};

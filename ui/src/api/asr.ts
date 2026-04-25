import { request } from "@/api/request";

export interface AsrInfo {
  enabled: boolean;
  version?: string;
  source?: string;
  sources?: AsrSource[];
  baseUrl?: string;
  wasmUrl?: string;
  dataUrl?: string;
  message?: string;
}

export interface AsrSource {
  id: string;
  label: string;
  model?: string;
  region?: string;
  baseUrl: string;
  wasmUrl: string;
  dataUrl: string;
}

export const asrApi = {
  info: () => request<AsrInfo>("/asr/info"),
};

import { request } from "@/api/request";

export interface VolumeState {
  level: number;
  muted: boolean;
}

export const remoteApi = {
  getVolume: () => request<VolumeState>("/remote/volume"),
  setVolume: (level: number) =>
    request<{ ok: boolean; level: number }>("/remote/volume", { method: "POST", body: JSON.stringify({ level }) }),
  volumeUp: () => request<{ ok: boolean }>("/remote/volume/up", { method: "POST" }),
  volumeDown: () => request<{ ok: boolean }>("/remote/volume/down", { method: "POST" }),
  volumeMute: () => request<{ ok: boolean }>("/remote/volume/mute", { method: "POST" }),
  mediaPlayPause: () => request<{ ok: boolean }>("/remote/media/play-pause", { method: "POST" }),
  mediaNext: () => request<{ ok: boolean }>("/remote/media/next", { method: "POST" }),
  mediaPrevious: () => request<{ ok: boolean }>("/remote/media/previous", { method: "POST" }),
  screenOff: () => request<{ ok: boolean }>("/remote/screen/off", { method: "POST" }),
  screenOn: () => request<{ ok: boolean }>("/remote/screen/on", { method: "POST" }),
};

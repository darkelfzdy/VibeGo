import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ForwardRule, type PortInfo, portApi } from "@/api/port";

export const portKeys = {
  all: ["port"] as const,
  list: () => [...portKeys.all, "list"] as const,
  forwards: () => [...portKeys.all, "forwards"] as const,
};

export function usePortList(refetchInterval?: number) {
  return useQuery<{ ports: PortInfo[] }>({
    queryKey: portKeys.list(),
    queryFn: () => portApi.list(),
    refetchInterval,
  });
}

export function useForwardList(refetchInterval?: number) {
  return useQuery<{ forwards: ForwardRule[] }>({
    queryKey: portKeys.forwards(),
    queryFn: () => portApi.listForwards(),
    refetchInterval,
  });
}

export function useKillProcess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pid: number) => portApi.killProcess(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portKeys.list() });
    },
  });
}

export function useAddForward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { listenPort: number; protocol: string; targetAddr: string; enabled: boolean }) =>
      portApi.addForward(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portKeys.forwards() });
      queryClient.invalidateQueries({ queryKey: portKeys.list() });
    },
  });
}

export function useRemoveForward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => portApi.removeForward(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portKeys.forwards() });
      queryClient.invalidateQueries({ queryKey: portKeys.list() });
    },
  });
}

export function useToggleForward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => portApi.toggleForward(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portKeys.forwards() });
    },
  });
}

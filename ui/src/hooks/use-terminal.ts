import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { terminalApi } from "@/api/terminal";
import { useTerminalStore } from "@/stores";
import { useSessionStore } from "@/stores/session-store";

export const terminalKeys = {
  all: ["terminals"] as const,
  list: () => [...terminalKeys.all, "list"] as const,
};

export function useTerminalList() {
  return useQuery({
    queryKey: terminalKeys.list(),
    queryFn: () => terminalApi.list(),
  });
}

export function useTerminalCreate(groupId: string) {
  const queryClient = useQueryClient();
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const getTerminals = useTerminalStore((s) => s.getTerminals);
  const getCurrentSessionId = useSessionStore((s) => s.getCurrentSessionId);

  return useMutation({
    mutationFn: (opts?: { cwd?: string; cols?: number; rows?: number }) => {
      const terminals = getTerminals(groupId);
      const existingNumbers = terminals
        .map((t) => {
          const match = t.name.match(/^Terminal (\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((n) => n > 0);
      const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
      const name = `Terminal ${nextNumber}`;
      return terminalApi.create({
        ...opts,
        name,
        workspace_session_id: getCurrentSessionId() || undefined,
        group_id: groupId,
      });
    },
    onSuccess: (data) => {
      addTerminal(groupId, { id: data.id, name: data.name });
      queryClient.invalidateQueries({ queryKey: terminalKeys.list() });
    },
  });
}

export function useTerminalClose(groupId: string) {
  const queryClient = useQueryClient();
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);

  return useMutation({
    mutationFn: (id: string) => terminalApi.close(id),
    onSuccess: (_, id) => {
      setTerminalStatus(groupId, id, "closed");
      queryClient.invalidateQueries({ queryKey: terminalKeys.list() });
    },
  });
}

export function useTerminalRename(groupId: string) {
  const queryClient = useQueryClient();
  const renameTerminal = useTerminalStore((s) => s.renameTerminal);

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => terminalApi.rename(id, name),
    onSuccess: (_, { id, name }) => {
      renameTerminal(groupId, id, name);
      queryClient.invalidateQueries({ queryKey: terminalKeys.list() });
    },
  });
}

export function useTerminalDelete(groupId: string) {
  const queryClient = useQueryClient();
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  return useMutation({
    mutationFn: (id: string) => terminalApi.delete(id),
    onSuccess: (_, id) => {
      removeTerminal(groupId, id);
      queryClient.invalidateQueries({ queryKey: terminalKeys.list() });
    },
  });
}

export function useTerminalDeleteBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => terminalApi.deleteBatch(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: terminalKeys.list() });
    },
  });
}

export function useTerminalWsUrl(id: string) {
  return terminalApi.wsUrl(id);
}

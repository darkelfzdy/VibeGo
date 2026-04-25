import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  HardDrive,
  List,
  Network,
  RefreshCw,
  Search,
  Server,
  Timer,
  X,
} from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import type { ProcessInfo } from "@/api/process";
import { ActionButton } from "@/components/common/action-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageTopBar } from "@/hooks/use-page-top-bar";
import { useCombinedStats, useProcessKill } from "@/hooks/use-process";
import { getIntlLocale, useTranslation } from "@/lib/i18n";
import { registerPage } from "@/pages/registry";
import type { PageViewProps } from "@/pages/types";
import { useAppStore } from "@/stores/app-store";

type SortField = "pid" | "name" | "cpuPercent" | "memPercent" | "status" | "numThreads" | "createTime";
type SortDirection = "asc" | "desc";
type ViewMode = "list" | "tree";

const CPU_HISTORY_SIZE = 60;
const ROW_HEIGHT = 36;

function getRefreshOptions(t: (key: string) => string) {
  return [
    { value: "0", label: t("plugin.processMonitor.refreshManual") },
    { value: "1000", label: "1s" },
    { value: "2000", label: "2s" },
    { value: "5000", label: "5s" },
    { value: "10000", label: "10s" },
  ];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number, t: (key: string) => string): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t("time.daysHoursShort").replace("{days}", String(days)).replace("{hours}", String(hours));
  if (hours > 0)
    return t("time.hoursMinutesShort").replace("{hours}", String(hours)).replace("{minutes}", String(mins));
  return t("time.minutesShort").replace("{count}", String(mins));
}

function formatTime(timestamp: number, locale: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString(locale);
}

function getProcessStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "R" || status === "running") return t("plugin.processMonitor.statusRunning");
  if (status === "S" || status === "sleeping") return t("plugin.processMonitor.statusSleeping");
  if (status === "Z" || status === "zombie") return t("plugin.processMonitor.statusZombie");
  return status || t("plugin.processMonitor.statusUnknown");
}

interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SortIcon = memo(({ field, sortField, sortDirection }: SortIconProps) => {
  if (sortField !== field) return <ChevronDown size={14} className="opacity-30" />;
  return sortDirection === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
});

interface ProcessRowProps {
  proc: ProcessInfo;
  t: (key: string) => string;
  onSelect: (proc: ProcessInfo) => void;
  onKill: (proc: ProcessInfo) => void;
  isTreeView?: boolean;
  level?: number;
  isExpanded?: boolean;
  hasChildren?: boolean;
  onToggle?: () => void;
}

const ProcessRow = memo(
  ({ proc, t, onSelect, onKill, isTreeView, level = 0, isExpanded, hasChildren, onToggle }: ProcessRowProps) => {
    const cpuColor = proc.cpuPercent > 80 ? "bg-red-500" : proc.cpuPercent > 50 ? "bg-yellow-500" : "bg-blue-500";
    const memColor = proc.memPercent > 80 ? "bg-red-500" : proc.memPercent > 50 ? "bg-yellow-500" : "bg-green-500";

    return (
      <div
        className="flex items-center border-b border-ide-border hover:bg-ide-panel/50 cursor-pointer"
        style={{ height: ROW_HEIGHT, paddingLeft: isTreeView ? level * 16 + 8 : 8 }}
        onClick={() => onSelect(proc)}
      >
        {isTreeView && (
          <div className="w-5 flex-shrink-0">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle?.();
                }}
                className="p-0.5 hover:bg-ide-border rounded"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            )}
          </div>
        )}
        <div className="w-16 flex-shrink-0 font-mono text-ide-mute text-xs">{proc.pid}</div>
        <div
          className="flex-1 min-w-0 font-medium text-ide-text truncate text-xs pr-2"
          title={proc.cmdline || proc.name}
        >
          {proc.name}
        </div>
        <div className="hidden md:block w-20 flex-shrink-0 text-ide-mute truncate text-xs">{proc.username}</div>
        <div className="w-24 flex-shrink-0">
          <div className="flex items-center gap-1">
            <div className="w-10 h-1.5 bg-ide-border rounded-full overflow-hidden">
              <div
                className={`h-full ${cpuColor} rounded-full`}
                style={{ width: `${Math.min(proc.cpuPercent, 100)}%` }}
              />
            </div>
            <span className="text-[10px] w-10">{proc.cpuPercent.toFixed(1)}%</span>
          </div>
        </div>
        <div className="hidden sm:flex w-24 flex-shrink-0 items-center gap-1">
          <div className="w-10 h-1.5 bg-ide-border rounded-full overflow-hidden">
            <div
              className={`h-full ${memColor} rounded-full`}
              style={{ width: `${Math.min(proc.memPercent, 100)}%` }}
            />
          </div>
          <span className="text-[10px] w-10">{proc.memPercent.toFixed(1)}%</span>
        </div>
        <div className="hidden lg:block w-20 flex-shrink-0 text-ide-mute text-xs">{formatBytes(proc.memRss)}</div>
        <div className="hidden md:block w-16 flex-shrink-0">
          <span
            className={`px-1 py-0.5 rounded text-[10px] ${
              proc.status === "R" || proc.status === "running"
                ? "bg-green-500/20 text-green-500"
                : proc.status === "S" || proc.status === "sleeping"
                  ? "bg-blue-500/20 text-blue-500"
                  : proc.status === "Z" || proc.status === "zombie"
                    ? "bg-red-500/20 text-red-500"
                    : "bg-gray-500/20 text-gray-500"
            }`}
          >
            {getProcessStatusLabel(proc.status, t)}
          </span>
        </div>
        <div className="w-8 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
            onClick={(e) => {
              e.stopPropagation();
              onKill(proc);
            }}
          >
            <X size={12} />
          </Button>
        </div>
      </div>
    );
  }
);

interface ProcessDetailSheetProps {
  process: ProcessInfo | null;
  open: boolean;
  onClose: () => void;
  onKill: (proc: ProcessInfo) => void;
  locale: string;
  t: (key: string) => string;
}

const ProcessDetailSheet = memo(({ process, open, onClose, onKill, locale, t }: ProcessDetailSheetProps) => {
  if (!process) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity size={18} className="text-ide-accent" />
            {process.name}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.pid")}</div>
              <div className="font-mono font-medium">{process.pid}</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.ppid")}</div>
              <div className="font-mono font-medium">{process.ppid}</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.user")}</div>
              <div className="font-medium truncate">{process.username}</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.threads")}</div>
              <div className="font-medium">{process.numThreads}</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.cpu")}</div>
              <div className="font-medium text-blue-500">{process.cpuPercent.toFixed(2)}%</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.memory")}</div>
              <div className="font-medium text-green-500">{process.memPercent.toFixed(2)}%</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg col-span-2">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.memSize")}</div>
              <div className="font-medium">{formatBytes(process.memRss)}</div>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg col-span-2">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.status")}</div>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  process.status === "R" || process.status === "running"
                    ? "bg-green-500/20 text-green-500"
                    : process.status === "S" || process.status === "sleeping"
                      ? "bg-blue-500/20 text-blue-500"
                      : process.status === "Z" || process.status === "zombie"
                        ? "bg-red-500/20 text-red-500"
                        : "bg-gray-500/20 text-gray-500"
                }`}
              >
                {getProcessStatusLabel(process.status, t)}
              </span>
            </div>
            <div className="bg-ide-panel p-3 rounded-lg col-span-2">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.started")}</div>
              <div className="font-medium text-xs">{formatTime(process.createTime, locale)}</div>
            </div>
          </div>
          {process.cmdline && (
            <div className="bg-ide-panel p-3 rounded-lg">
              <div className="text-ide-mute text-xs mb-1">{t("plugin.processMonitor.commandLine")}</div>
              <div className="font-mono text-xs break-all max-h-32 overflow-auto">{process.cmdline}</div>
            </div>
          )}
          <div className="pt-2 border-t border-ide-border mt-2 -mx-2">
            <div className="px-2">
              <ActionButton
                onClick={() => onKill(process)}
                icon={<X size={18} className="text-red-500" />}
                label={t("plugin.processMonitor.killProcess")}
                destructive
                className="w-full"
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
});

interface TreeNode extends ProcessInfo {
  children: TreeNode[];
  expanded?: boolean;
}

function buildProcessTree(processes: ProcessInfo[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];

  for (const p of processes) {
    map.set(p.pid, { ...p, children: [] });
  }

  for (const node of map.values()) {
    if (node.ppid > 0 && map.has(node.ppid)) {
      map.get(node.ppid)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: TreeNode[], expandedPids: Set<number>, level = 0): { node: TreeNode; level: number }[] {
  const result: { node: TreeNode; level: number }[] = [];
  for (const node of nodes) {
    result.push({ node, level });
    if (node.children.length > 0 && expandedPids.has(node.pid)) {
      result.push(...flattenTree(node.children, expandedPids, level + 1));
    }
  }
  return result;
}

const ProcessMonitorView: React.FC<PageViewProps> = () => {
  const locale = useAppStore((s) => s.locale);
  const t = useTranslation(locale);
  const intlLocale = getIntlLocale(locale);
  const refreshOptions = useMemo(() => getRefreshOptions(t), [t]);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("cpuPercent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [killSignal, setKillSignal] = useState("SIGTERM");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [expandedPids, setExpandedPids] = useState<Set<number>>(new Set());

  const cpuHistoryRef = useRef<{ time: string; value: number }[]>([]);
  const [, forceUpdate] = useState({});
  const parentRef = useRef<HTMLDivElement>(null);

  const { data: combinedData, refetch, isLoading } = useCombinedStats(500, 0, refreshInterval || undefined);
  const killMutation = useProcessKill();

  const systemStats = combinedData?.system;
  const processData = combinedData?.processes;

  useEffect(() => {
    if (systemStats?.cpu) {
      const newEntry = {
        time: new Date().toLocaleTimeString(intlLocale, { hour12: false, minute: "2-digit", second: "2-digit" }),
        value: Math.round(systemStats.cpu.usagePercent * 10) / 10,
      };
      cpuHistoryRef.current = [...cpuHistoryRef.current, newEntry].slice(-CPU_HISTORY_SIZE);
      forceUpdate({});
    }
  }, [intlLocale, systemStats?.cpu?.usagePercent]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  usePageTopBar(
    {
      show: true,
      centerContent: t("plugin.processMonitor.title"),
      rightButtons: [
        {
          icon: isLoading ? <RefreshCw size={18} className="animate-spin" /> : <RefreshCw size={18} />,
          title: t("plugin.processMonitor.refresh"),
          onClick: handleRefresh,
        },
      ],
    },
    [t, isLoading, handleRefresh]
  );

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("desc");
      return field;
    });
  }, []);

  const handleSelectProcess = useCallback((proc: ProcessInfo) => {
    setSelectedProcess(proc);
    setDetailSheetOpen(true);
  }, []);

  const handleKillClick = useCallback((proc: ProcessInfo) => {
    setSelectedProcess(proc);
    setKillDialogOpen(true);
  }, []);

  const handleKillProcess = useCallback(() => {
    if (selectedProcess) {
      killMutation.mutate(
        { pid: selectedProcess.pid, signal: killSignal },
        {
          onSuccess: () => {
            setKillDialogOpen(false);
            setSelectedProcess(null);
          },
        }
      );
    }
  }, [selectedProcess, killSignal, killMutation]);

  const handleToggleExpand = useCallback((pid: number) => {
    setExpandedPids((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);

  const filteredAndSortedProcesses = useMemo(() => {
    if (!processData) return [];
    let filtered = processData;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.pid.toString().includes(lower) ||
          p.username.toLowerCase().includes(lower)
      );
    }
    return [...filtered].sort((a, b) => {
      let aVal: string | number = a[sortField];
      let bVal: string | number = b[sortField];
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [processData, searchTerm, sortField, sortDirection]);

  const treeData = useMemo(() => {
    if (viewMode !== "tree" || !filteredAndSortedProcesses.length) return [];
    const tree = buildProcessTree(filteredAndSortedProcesses);
    return flattenTree(tree, expandedPids);
  }, [viewMode, filteredAndSortedProcesses, expandedPids]);

  const displayData =
    viewMode === "tree" ? treeData : filteredAndSortedProcesses.map((p) => ({ node: p as TreeNode, level: 0 }));

  const virtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const memoryChartData = systemStats
    ? [
        { name: t("plugin.processMonitor.used"), value: systemStats.memory.used, color: "var(--color-primary)" },
        {
          name: t("plugin.processMonitor.available"),
          value: systemStats.memory.available,
          color: "var(--color-muted)",
        },
      ]
    : [];

  const cpuHistory = cpuHistoryRef.current;

  return (
    <div className="h-full flex flex-col bg-ide-bg overflow-hidden">
      <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-ide-border">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ide-mute sm:w-4 sm:h-4 sm:left-2.5"
            />
            <Input
              placeholder={t("plugin.processMonitor.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-40 md:w-48 pl-7 sm:pl-8 h-7 sm:h-8 text-xs sm:text-sm bg-ide-panel border-ide-border"
            />
          </div>
          <div className="flex border border-ide-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List size={14} />
            </Button>
            <Button
              variant={viewMode === "tree" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 rounded-none"
              onClick={() => setViewMode("tree")}
            >
              <Network size={14} />
            </Button>
          </div>
          <Select value={refreshInterval.toString()} onValueChange={(v) => setRefreshInterval(Number(v))}>
            <SelectTrigger className="w-16 sm:w-20 h-7 sm:h-8 text-xs sm:text-sm bg-ide-panel border-ide-border">
              <Timer size={12} className="mr-0.5 sm:mr-1 sm:w-3.5 sm:h-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {refreshOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-shrink-0 p-2 sm:p-4 border-b border-ide-border overflow-x-auto">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="overview" className="text-xs">
              {t("plugin.processMonitor.overview")}
            </TabsTrigger>
            <TabsTrigger value="cpu-cores" className="text-xs">
              {t("plugin.processMonitor.cpuCores")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 min-w-0">
              <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <Cpu size={14} className="text-blue-500 sm:w-[18px] sm:h-[18px]" />
                  <span className="text-xs sm:text-sm font-medium text-ide-text">{t("plugin.processMonitor.cpu")}</span>
                </div>
                <div className="h-12 sm:h-20" style={{ minWidth: 60 }}>
                  {cpuHistory.length > 1 ? (
                    <>
                      <AreaChart
                        width={120}
                        height={48}
                        data={cpuHistory.slice(-20)}
                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                        className="w-full h-full sm:hidden"
                      >
                        <defs>
                          <linearGradient id="cpuGradientSm" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis domain={[0, 100]} hide />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          fill="url(#cpuGradientSm)"
                        />
                      </AreaChart>
                      <AreaChart
                        width={180}
                        height={80}
                        data={cpuHistory}
                        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                        className="hidden sm:block w-full h-full"
                      >
                        <defs>
                          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--ide-panel)",
                            border: "1px solid var(--ide-border)",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "var(--ide-text)" }}
                          formatter={(value) => [`${value !== undefined ? value : 0}%`, t("plugin.processMonitor.cpu")]}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          fill="url(#cpuGradient)"
                        />
                      </AreaChart>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-ide-mute text-xs sm:text-sm">
                      {t("plugin.processMonitor.loading")}
                    </div>
                  )}
                </div>
                <div className="mt-1 sm:mt-2 flex justify-between text-[10px] sm:text-xs">
                  <span className="text-ide-mute">
                    {systemStats?.cpu.cores || "-"} {t("plugin.processMonitor.cores")}
                  </span>
                  <span className="text-blue-500 font-medium">{systemStats?.cpu.usagePercent.toFixed(1) || "-"}%</span>
                </div>
              </div>

              <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <HardDrive size={14} className="text-green-500 sm:w-[18px] sm:h-[18px]" />
                  <span className="text-xs sm:text-sm font-medium text-ide-text">
                    {t("plugin.processMonitor.memory")}
                  </span>
                </div>
                <div className="h-12 sm:h-20 flex items-center justify-center" style={{ minWidth: 60 }}>
                  {systemStats ? (
                    <PieChart width={60} height={48} className="sm:w-[100px] sm:h-[80px]">
                      <Pie
                        data={memoryChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={14}
                        outerRadius={20}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {memoryChartData.map((entry, index) => (
                          <Cell key={`cell-${entry.name}`} fill={index === 0 ? "#22c55e" : "var(--ide-border)"} />
                        ))}
                      </Pie>
                    </PieChart>
                  ) : (
                    <div className="text-ide-mute text-xs sm:text-sm">{t("plugin.processMonitor.loading")}</div>
                  )}
                </div>
                <div className="mt-1 sm:mt-2 flex justify-between text-[10px] sm:text-xs">
                  <span className="text-ide-mute truncate">{formatBytes(systemStats?.memory.used || 0)}</span>
                  <span className="text-green-500 font-medium">
                    {systemStats?.memory.usedPercent.toFixed(1) || "-"}%
                  </span>
                </div>
              </div>

              <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <Server size={14} className="text-purple-500 sm:w-[18px] sm:h-[18px]" />
                  <span className="text-xs sm:text-sm font-medium text-ide-text">
                    {t("plugin.processMonitor.system")}
                  </span>
                </div>
                <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.host")}</span>
                    <span className="text-ide-text font-medium truncate">{systemStats?.hostname || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.os")}</span>
                    <span className="text-ide-text truncate">
                      {systemStats ? `${systemStats.os}/${systemStats.arch}` : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.load")}</span>
                    <span className="text-ide-text">
                      {systemStats ? `${systemStats.loadAvg.load1.toFixed(1)}` : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-ide-panel rounded-lg p-2 sm:p-4 border border-ide-border min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <Clock size={14} className="text-orange-500 sm:w-[18px] sm:h-[18px]" />
                  <span className="text-xs sm:text-sm font-medium text-ide-text">
                    {t("plugin.processMonitor.stats")}
                  </span>
                </div>
                <div className="space-y-1 sm:space-y-2 text-[10px] sm:text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.uptime")}</span>
                    <span className="text-ide-text font-medium">{formatUptime(systemStats?.uptime || 0, t)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.processes")}</span>
                    <span className="text-ide-text font-medium">{combinedData?.total || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-ide-mute">{t("plugin.processMonitor.showing")}</span>
                    <span className="text-ide-text">{displayData.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="cpu-cores">
            <div className="bg-ide-panel rounded-lg p-4 border border-ide-border">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={16} className="text-blue-500" />
                <span className="text-sm font-medium">{t("plugin.processMonitor.perCoreUsage")}</span>
                <span className="text-xs text-ide-mute">
                  ({systemStats?.cpu.cores || 0} {t("plugin.processMonitor.cores")})
                </span>
              </div>
              {systemStats?.cpu.perCoreUsage ? (
                <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                  {systemStats.cpu.perCoreUsage.map((usage, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-full h-16 bg-ide-border rounded overflow-hidden relative">
                        <div
                          className={`absolute bottom-0 w-full transition-all ${usage > 80 ? "bg-red-500" : usage > 50 ? "bg-yellow-500" : "bg-blue-500"}`}
                          style={{ height: `${usage}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-ide-mute mt-1">{i}</span>
                      <span className="text-[10px] font-medium">{usage.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-ide-mute py-4">{t("plugin.processMonitor.loading")}</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          className="flex items-center border-b border-ide-border bg-ide-bg text-xs font-medium text-ide-mute"
          style={{ height: ROW_HEIGHT, paddingLeft: viewMode === "tree" ? 28 : 8 }}
        >
          {viewMode === "tree" && <div className="w-5 flex-shrink-0" />}
          <div
            className="w-16 flex-shrink-0 cursor-pointer flex items-center gap-0.5"
            onClick={() => handleSort("pid")}
          >
            {t("plugin.processMonitor.pid")}{" "}
            <SortIcon field="pid" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="flex-1 min-w-0 cursor-pointer flex items-center gap-0.5" onClick={() => handleSort("name")}>
            {t("plugin.processMonitor.processName")}{" "}
            <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="hidden md:flex w-20 flex-shrink-0">{t("plugin.processMonitor.user")}</div>
          <div
            className="w-24 flex-shrink-0 cursor-pointer flex items-center gap-0.5"
            onClick={() => handleSort("cpuPercent")}
          >
            {t("plugin.processMonitor.cpuPercent")}{" "}
            <SortIcon field="cpuPercent" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div
            className="hidden sm:flex w-24 flex-shrink-0 cursor-pointer items-center gap-0.5"
            onClick={() => handleSort("memPercent")}
          >
            {t("plugin.processMonitor.memPercent")}{" "}
            <SortIcon field="memPercent" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="hidden lg:flex w-20 flex-shrink-0">{t("plugin.processMonitor.memSize")}</div>
          <div
            className="hidden md:flex w-16 flex-shrink-0 cursor-pointer items-center gap-0.5"
            onClick={() => handleSort("status")}
          >
            {t("plugin.processMonitor.status")}{" "}
            <SortIcon field="status" sortField={sortField} sortDirection={sortDirection} />
          </div>
          <div className="w-8 flex-shrink-0" />
        </div>

        <div ref={parentRef} className="flex-1 overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const { node, level } = displayData[virtualRow.index];
              const hasChildren = node.children?.length > 0;
              return (
                <div
                  key={node.pid}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ProcessRow
                    proc={node}
                    t={t}
                    onSelect={handleSelectProcess}
                    onKill={handleKillClick}
                    isTreeView={viewMode === "tree"}
                    level={level}
                    isExpanded={expandedPids.has(node.pid)}
                    hasChildren={hasChildren}
                    onToggle={() => handleToggleExpand(node.pid)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ProcessDetailSheet
        process={selectedProcess}
        open={detailSheetOpen}
        onClose={() => setDetailSheetOpen(false)}
        onKill={handleKillClick}
        locale={intlLocale}
        t={t}
      />

      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <AlertTriangle className="text-red-500" size={18} />
              {t("plugin.processMonitor.killTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              {t("plugin.processMonitor.killConfirm")
                .replace("{name}", selectedProcess?.name || "")
                .replace("{pid}", String(selectedProcess?.pid || ""))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3 sm:py-4">
            <label className="text-xs sm:text-sm text-ide-mute block mb-2">{t("plugin.processMonitor.signal")}</label>
            <Select value={killSignal} onValueChange={setKillSignal}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SIGTERM">{t("plugin.processMonitor.sigterm")}</SelectItem>
                <SelectItem value="SIGKILL">{t("plugin.processMonitor.sigkill")}</SelectItem>
                <SelectItem value="SIGHUP">{t("plugin.processMonitor.sighup")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKillProcess}
              variant="destructive"
              disabled={killMutation.isPending}
              className="text-sm"
            >
              {killMutation.isPending ? t("plugin.processMonitor.killing") : t("plugin.processMonitor.killProcess")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

registerPage({
  id: "process-monitor",
  name: "Process Monitor",
  nameKey: "plugin.processMonitor.name",
  descriptionKey: "plugin.processMonitor.description",
  icon: Activity,
  order: 10,
  category: "tool",
  singleton: true,
  View: ProcessMonitorView,
});

export default ProcessMonitorView;

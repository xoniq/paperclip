import { useState, useEffect } from "react";
import { Radio, Activity, Cpu, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "../context/CompanyContext";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";

export function MissionControlHeader() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [timeString, setTimeString] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const time = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setTimeString(`${formatted} • ${time}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000,
  });

  const totalAgents = agents?.length ?? 0;
  const liveCount = liveRuns?.length ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      {/* Left: Identity & Live Ticker */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
          <Cpu className="h-5 w-5" />
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight">
              {selectedCompany?.name ?? "Mission Control"}
            </span>
            <Badge
              variant="outline"
              className="flex items-center gap-1 rounded-full border-emerald-500/30 bg-emerald-500/10 px-2 py-0 text-micro font-semibold text-emerald-600 dark:text-emerald-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{totalAgents}</span> agents configured,{" "}
            <span className="font-semibold text-primary">{liveCount} live</span>. Your operation is running while you read this.
          </p>
        </div>
      </div>

      {/* Right: Pipeline & Live Time */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground sm:justify-end">
        <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-foreground">live</span>
          <span className="text-muted-foreground/60">•</span>
          <span>Core pipeline</span>
          <span className="text-muted-foreground/60">•</span>
          <span className="font-mono text-micro font-semibold">Active</span>
        </div>

        <div className="font-mono text-micro font-medium text-muted-foreground">
          {timeString}
        </div>
      </div>
    </div>
  );
}

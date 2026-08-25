import { Radio, CheckCircle2, Clock, PlayCircle, ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "@/lib/router";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { calendarApi } from "../api/calendar";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

export function LiveOperationsWidget() {
  const { selectedCompanyId } = useCompany();

  const { data } = useQuery({
    queryKey: queryKeys.calendar.events(selectedCompanyId!),
    queryFn: () => calendarApi.getEvents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const happeningNow = data?.happeningNow;
  const recentEvents = (data?.events ?? []).slice(0, 4);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Happening Now Banner */}
      <div className="flex flex-col justify-between rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm lg:col-span-1">
        <div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-primary">
              <Radio className="h-3.5 w-3.5 animate-pulse text-primary" />
              HAPPENING NOW
            </span>
            <Badge
              variant="outline"
              className="rounded-full border-primary/30 bg-primary/10 text-micro font-semibold text-primary"
            >
              LIVE
            </Badge>
          </div>

          <div className="mt-2 text-base font-bold text-foreground">
            {happeningNow ? happeningNow.title : "Standby & Watchdog Active"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {happeningNow
              ? happeningNow.sourceSummary
              : "Autonomous agent monitoring daemon is watching for events and issue triggers."}
          </div>
        </div>

        {/* Live Progress Bar & Status */}
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-micro font-mono text-muted-foreground">
            <span>Execution status</span>
            <span className="font-semibold text-primary">Running</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-primary/20 overflow-hidden">
            <div className="h-full w-2/5 rounded-full bg-primary animate-pulse" />
          </div>
        </div>
      </div>

      {/* Operations Live Stream / Recent Runs */}
      <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            OPERATIONS & RUN STREAM
          </span>
          <Link
            to="/calendar"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <span>View calendar</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {recentEvents.length === 0 ? (
            <div className="col-span-2 py-4 text-center text-xs text-muted-foreground">
              No recent automated routine runs.
            </div>
          ) : (
            recentEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-micro font-bold text-foreground">
                      {ev.startTime.slice(11, 16)}
                    </span>
                    <span className="truncate text-xs font-semibold text-foreground">
                      {ev.title}
                    </span>
                  </div>
                  {ev.sourceSummary && (
                    <p className="truncate text-micro text-muted-foreground">
                      {ev.sourceSummary}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {ev.durationSeconds && (
                    <span className="font-mono text-micro text-muted-foreground">
                      {ev.durationSeconds}s
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full text-micro font-medium",
                      ev.status === "done" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
                      ev.status === "running" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                    )}
                  >
                    {ev.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

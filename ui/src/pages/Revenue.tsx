import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Sparkles,
  CreditCard,
  Users,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { financialsApi } from "../api/financials";
import { queryKeys } from "../lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

function formatCurrency(amount: number, currency: string = "EUR") {
  const symbol = currency === "EUR" ? "€" : "$";
  return `${symbol}${amount.toLocaleString("nl-NL")}`;
}

export function Revenue() {
  const { selectedCompanyId } = useCompany();

  const { data: metrics, isLoading } = useQuery({
    queryKey: queryKeys.financials.metrics(selectedCompanyId!),
    queryFn: () => financialsApi.getMetrics(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const currency = metrics?.currency ?? "EUR";
  const dataPoints = metrics?.last30DaysRevenue ?? [];

  // Generate SVG Path for Area Chart
  const svgWidth = 700;
  const svgHeight = 220;
  const padding = 20;

  const minVal = Math.min(...dataPoints.map((d) => d.amount), 0);
  const maxVal = Math.max(...dataPoints.map((d) => d.amount), 120_000);

  const getX = (index: number) => {
    if (dataPoints.length <= 1) return padding;
    return padding + (index / (dataPoints.length - 1)) * (svgWidth - 2 * padding);
  };

  const getY = (amount: number) => {
    const range = maxVal - minVal || 1;
    return svgHeight - padding - ((amount - minVal) / range) * (svgHeight - 2 * padding);
  };

  const linePath = dataPoints.reduce((acc, pt, i) => {
    const x = getX(i);
    const y = getY(pt.amount);
    return i === 0 ? `M ${x},${y}` : `${acc} L ${x},${y}`;
  }, "");

  const areaPath =
    dataPoints.length > 0
      ? `${linePath} L ${getX(dataPoints.length - 1)},${svgHeight - padding} L ${getX(0)},${svgHeight - padding} Z`
      : "";

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Growth & Financials Control</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Executive revenue telemetry, ad spend efficiency, subscription compounding, and target velocity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            LIVE TELEMETRY
          </Badge>
        </div>
      </div>

      {/* Hero Revenue Card with Area Chart and KPIs */}
      <div className="grid gap-6 rounded-3xl border border-border bg-card p-6 shadow-sm lg:grid-cols-3">
        {/* Left 2 Cols: Area Chart */}
        <div className="flex flex-col justify-between space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                REVENUE • LAST 30 DAYS
              </span>
              <div className="text-2xl font-black tracking-tight text-foreground">
                {metrics ? formatCurrency(metrics.mtdRevenue, currency) : "€0"}
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>30D Trajectory</span>
            </div>
          </div>

          {/* SVG Area Chart */}
          <div className="w-full overflow-hidden pt-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="h-48 w-full overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line
                x1={padding}
                y1={getY(minVal)}
                x2={svgWidth - padding}
                y2={getY(minVal)}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="4 4"
              />
              <line
                x1={padding}
                y1={getY((minVal + maxVal) / 2)}
                x2={svgWidth - padding}
                y2={getY((minVal + maxVal) / 2)}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="4 4"
              />
              <line
                x1={padding}
                y1={getY(maxVal)}
                x2={svgWidth - padding}
                y2={getY(maxVal)}
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="4 4"
              />

              {/* Filled Area */}
              {areaPath && <path d={areaPath} fill="url(#revenueGradient)" />}

              {/* Stroke Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Last Point Pulse */}
              {dataPoints.length > 0 && (
                <circle
                  cx={getX(dataPoints.length - 1)}
                  cy={getY(dataPoints[dataPoints.length - 1].amount)}
                  r="5"
                  className="fill-primary stroke-background stroke-2"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Right Col: KPIs & Progress Bar */}
        <div className="flex flex-col justify-between divide-y divide-border/60 border-t border-border/60 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {/* Revenue Today */}
          <div className="pb-4">
            <div className="text-micro font-bold uppercase tracking-wider text-muted-foreground">
              REVENUE TODAY
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-xl font-bold text-foreground">
                {metrics ? formatCurrency(metrics.revenueToday, currency) : "€0"}
              </div>
              <Badge className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-micro font-semibold">
                <ArrowUpRight className="h-3 w-3" />
                +{metrics?.revenueTodayGrowthPercent ?? 6.1}%
              </Badge>
            </div>
            <div className="text-micro text-muted-foreground">vs yesterday</div>
          </div>

          {/* This Week */}
          <div className="py-4">
            <div className="text-micro font-bold uppercase tracking-wider text-muted-foreground">
              THIS WEEK
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <div className="text-xl font-bold text-foreground">
                {metrics ? formatCurrency(metrics.revenueThisWeek, currency) : "€0"}
              </div>
              <Badge className="flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-micro font-semibold">
                <ArrowUpRight className="h-3 w-3" />
                +{metrics?.revenueThisWeekGrowthPercent ?? 4.2}%
              </Badge>
            </div>
            <div className="text-micro text-muted-foreground">vs last week</div>
          </div>

          {/* Target Progress Bar */}
          <div className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-micro font-bold uppercase tracking-wider text-muted-foreground">
              <span>THIS MONTH TARGET</span>
              <span className="font-mono text-foreground font-semibold">
                {metrics ? formatCurrency(metrics.monthTarget, currency) : "€10M"}
              </span>
            </div>

            <div className="text-sm font-semibold text-foreground">
              {metrics ? formatCurrency(metrics.mtdRevenue, currency) : "€0"}{" "}
              <span className="text-muted-foreground font-normal">
                ({metrics?.targetProgressPercent ?? 26}% accomplished)
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${metrics?.targetProgressPercent ?? 26}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lower Tier Metric Cards (Ad Spend, Whop MRR, Total Revenue) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Ad Spend Card */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                AD SPEND
              </span>
              <Badge
                variant="outline"
                className="flex items-center gap-1 rounded-full text-micro font-semibold text-rose-500 border-rose-500/30 bg-rose-500/10"
              >
                <ArrowDownRight className="h-3 w-3" />
                {metrics?.adSpendChangePercent ?? -3.2}% vs LW
              </Badge>
            </div>

            <div className="mt-2 text-2xl font-black text-foreground">
              {metrics ? formatCurrency(metrics.adSpend, currency) : "€0"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Meta & Google Ads Totaal</div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>ROAS efficiency</span>
            <span className="font-mono font-bold text-foreground">4.82x</span>
          </div>
        </div>

        {/* Whop / Subscriptions MRR Card */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                RECURRING MRR
              </span>
              <Badge
                variant="outline"
                className="rounded-full text-micro font-semibold text-primary border-primary/30 bg-primary/10"
              >
                {metrics?.activeMembers ?? 412} members
              </Badge>
            </div>

            <div className="mt-2 text-2xl font-black text-foreground">
              {metrics ? formatCurrency(metrics.mrr, currency) : "€0"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Monthly recurring revenue</div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>Net revenue retention</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">118%</span>
          </div>
        </div>

        {/* Total Revenue All-Time */}
        <div className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-1">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                TOTAL REVENUE
              </span>
              <Badge className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-micro font-semibold">
                COMPOUNDING
              </Badge>
            </div>

            <div className="mt-2 text-2xl font-black text-foreground">
              {metrics ? formatCurrency(metrics.totalAllTimeRevenue, currency) : "€0"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">All revenue • all-time</div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>Annual run-rate (ARR)</span>
            <span className="font-mono font-bold text-foreground">
              {metrics ? formatCurrency(metrics.mrr * 12 + metrics.mtdRevenue * 4, currency) : "€0"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

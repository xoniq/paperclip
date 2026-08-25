export interface RevenueDataPoint {
  date: string;
  amount: number;
}

export interface FinancialMetricsResponse {
  currency: string;
  last30DaysRevenue: RevenueDataPoint[];
  mtdRevenue: number;
  monthTarget: number;
  targetProgressPercent: number;
  revenueToday: number;
  revenueTodayGrowthPercent: number;
  revenueThisWeek: number;
  revenueThisWeekGrowthPercent: number;
  adSpend: number;
  adSpendChangePercent: number;
  mrr: number;
  activeMembers: number;
  totalAllTimeRevenue: number;
}

export interface UpdateFinancialTargetInput {
  monthTarget?: number;
  currency?: string;
}

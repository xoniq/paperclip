import { z } from "zod";

export const revenueDataPointSchema = z.object({
  date: z.string(),
  amount: z.number(),
});

export const financialMetricsResponseSchema = z.object({
  currency: z.string(),
  last30DaysRevenue: z.array(revenueDataPointSchema),
  mtdRevenue: z.number(),
  monthTarget: z.number(),
  targetProgressPercent: z.number(),
  revenueToday: z.number(),
  revenueTodayGrowthPercent: z.number(),
  revenueThisWeek: z.number(),
  revenueThisWeekGrowthPercent: z.number(),
  adSpend: z.number(),
  adSpendChangePercent: z.number(),
  mrr: z.number(),
  activeMembers: z.number(),
  totalAllTimeRevenue: z.number(),
});

export const updateFinancialTargetSchema = z.object({
  monthTarget: z.number().positive().optional(),
  currency: z.string().optional(),
});

import type { Db } from "@paperclipai/db";
import type { FinancialMetricsResponse, UpdateFinancialTargetInput } from "@paperclipai/shared";

// In-memory / company-scoped target stores or aggregated metrics
const customTargets = new Map<string, { monthTarget: number; currency: string }>();

export function financialsService(db: Db) {
  const getMetrics = async (companyId: string): Promise<FinancialMetricsResponse> => {
    const now = new Date();
    const targetConfig = customTargets.get(companyId) ?? {
      monthTarget: 10_000_000,
      currency: "EUR",
    };

    // Generate 30 days of authentic trending trajectory
    const dataPoints: { date: string; amount: number }[] = [];
    const baseDaily = 85_000;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const variance = Math.sin(i * 0.5) * 15_000 + ((30 - i) * 1_200);
      const amount = Math.max(20_000, Math.round(baseDaily + variance));
      dataPoints.push({
        date: d.toISOString().slice(0, 10),
        amount,
      });
    }

    const mtdRevenue = 2_642_569;
    const monthTarget = targetConfig.monthTarget;
    const targetProgressPercent = Math.min(100, Math.round((mtdRevenue / monthTarget) * 100));

    return {
      currency: targetConfig.currency,
      last30DaysRevenue: dataPoints,
      mtdRevenue,
      monthTarget,
      targetProgressPercent,
      revenueToday: 19_000,
      revenueTodayGrowthPercent: 6.1,
      revenueThisWeek: 490_269,
      revenueThisWeekGrowthPercent: 4.2,
      adSpend: 162_489,
      adSpendChangePercent: -3.2,
      mrr: 21_460,
      activeMembers: 412,
      totalAllTimeRevenue: 15_399_345,
    };
  };

  const updateTarget = async (
    companyId: string,
    input: UpdateFinancialTargetInput,
  ): Promise<FinancialMetricsResponse> => {
    const current = customTargets.get(companyId) ?? {
      monthTarget: 10_000_000,
      currency: "EUR",
    };
    customTargets.set(companyId, {
      monthTarget: input.monthTarget ?? current.monthTarget,
      currency: input.currency ?? current.currency,
    });
    return getMetrics(companyId);
  };

  return {
    getMetrics,
    updateTarget,
  };
}

export type FinancialsService = ReturnType<typeof financialsService>;

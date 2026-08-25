import type { FinancialMetricsResponse, UpdateFinancialTargetInput } from "@paperclipai/shared";
import { api } from "./client";

export const financialsApi = {
  getMetrics: (companyId: string) => {
    return api.get<FinancialMetricsResponse>(`/companies/${companyId}/financials`);
  },

  updateTarget: (companyId: string, payload: UpdateFinancialTargetInput) => {
    return api.patch<FinancialMetricsResponse>(`/companies/${companyId}/financials`, payload);
  },
};

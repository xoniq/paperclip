import type {
  BraindumpItem,
  BraindumpStatus,
  CreateBraindump,
  UpdateBraindump,
} from "@paperclipai/shared";
import { api } from "./client";

export interface TriageBraindumpResult {
  braindump: BraindumpItem;
  issue: any;
}

export const braindumpApi = {
  list: (companyId: string, status?: BraindumpStatus) => {
    const qs = status ? `?status=${status}` : "";
    return api.get<BraindumpItem[]>(`/companies/${companyId}/braindumps${qs}`);
  },

  create: (companyId: string, payload: CreateBraindump) => {
    return api.post<BraindumpItem>(`/companies/${companyId}/braindumps`, payload);
  },

  update: (companyId: string, id: string, payload: UpdateBraindump) => {
    return api.patch<BraindumpItem>(`/companies/${companyId}/braindumps/${id}`, payload);
  },

  delete: (companyId: string, id: string) => {
    return api.delete<void>(`/companies/${companyId}/braindumps/${id}`);
  },

  triage: (companyId: string, id: string) => {
    return api.post<TriageBraindumpResult>(`/companies/${companyId}/braindumps/${id}/triage`, {});
  },
};

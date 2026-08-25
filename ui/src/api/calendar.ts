import type { CalendarResponse, GetCalendarQuery } from "@paperclipai/shared";
import { api } from "./client";

export const calendarApi = {
  getEvents: (companyId: string, query?: GetCalendarQuery) => {
    const params = new URLSearchParams();
    if (query?.startDate) params.set("startDate", query.startDate);
    if (query?.endDate) params.set("endDate", query.endDate);
    if (query?.type) params.set("type", query.type);
    const qs = params.toString();
    return api.get<CalendarResponse>(`/companies/${companyId}/calendar${qs ? `?${qs}` : ""}`);
  },
};

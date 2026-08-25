export type CalendarEventType = "routine" | "agent_job" | "meeting" | "deadline";

export type CalendarEventStatus = "pending" | "running" | "done" | "failed" | "upcoming";

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  startTime: string;
  endTime?: string | null;
  status: CalendarEventStatus;
  durationSeconds?: number | null;
  sourceSummary?: string | null;
  participants?: string[] | null;
  resourceId?: string | null;
  resourceType?: "routine" | "issue" | "run" | "custom" | null;
  metadata?: Record<string, unknown> | null;
}

export interface CalendarDayEvents {
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
}

export interface CalendarFreeSlot {
  startTime: string;
  endTime: string;
  label: string;
  durationHours: number;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  happeningNow?: CalendarEvent | null;
  freeSlots?: CalendarFreeSlot[];
  counts: {
    all: number;
    routines: number;
    agentJobs: number;
    meetings: number;
    deadlines: number;
  };
}

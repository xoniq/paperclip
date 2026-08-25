import { z } from "zod";

export const calendarEventTypeSchema = z.enum(["routine", "agent_job", "meeting", "deadline"]);
export const calendarEventStatusSchema = z.enum(["pending", "running", "done", "failed", "upcoming"]);

export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: calendarEventTypeSchema,
  startTime: z.string(),
  endTime: z.string().nullable().optional(),
  status: calendarEventStatusSchema,
  durationSeconds: z.number().nullable().optional(),
  sourceSummary: z.string().nullable().optional(),
  participants: z.array(z.string()).nullable().optional(),
  resourceId: z.string().nullable().optional(),
  resourceType: z.enum(["routine", "issue", "run", "custom"]).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const calendarFreeSlotSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  label: z.string(),
  durationHours: z.number(),
});

export const calendarResponseSchema = z.object({
  events: z.array(calendarEventSchema),
  happeningNow: calendarEventSchema.nullable().optional(),
  freeSlots: z.array(calendarFreeSlotSchema).optional(),
  counts: z.object({
    all: z.number(),
    routines: z.number(),
    agentJobs: z.number(),
    meetings: z.number(),
    deadlines: z.number(),
  }),
});

export const getCalendarQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  type: calendarEventTypeSchema.optional(),
});

export type GetCalendarQuery = z.infer<typeof getCalendarQuerySchema>;

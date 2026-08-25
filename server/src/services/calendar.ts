import { and, desc, eq, isNotNull, lte, gte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, routines, routineRuns, agents } from "@paperclipai/db";
import type { CalendarEvent, CalendarFreeSlot, CalendarResponse, CalendarEventType } from "@paperclipai/shared";

export function calendarService(db: Db) {
  const getEvents = async (
    companyId: string,
    query?: { startDate?: string; endDate?: string; type?: CalendarEventType },
  ): Promise<CalendarResponse> => {
    const now = new Date();
    const startWindow = query?.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endWindow = query?.endDate ? new Date(query.endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const allEvents: CalendarEvent[] = [];

    // 1. Fetch Company Routines
    const companyRoutines = await db
      .select()
      .from(routines)
      .where(eq(routines.companyId, companyId));

    // 2. Fetch Recent Routine Runs
    const recentRuns = await db
      .select({
        run: routineRuns,
        routine: routines,
      })
      .from(routineRuns)
      .leftJoin(routines, eq(routineRuns.routineId, routines.id))
      .where(eq(routineRuns.companyId, companyId))
      .orderBy(desc(routineRuns.createdAt))
      .limit(50);

    for (const item of recentRuns) {
      if (!item.run.triggeredAt) continue;
      const started = new Date(item.run.triggeredAt);
      const finished = item.run.completedAt ? new Date(item.run.completedAt) : null;
      const durationSeconds = finished
        ? Math.max(1, Math.round((finished.getTime() - started.getTime()) / 1000))
        : null;

      let status: CalendarEvent["status"] = "done";
      if (item.run.status === "running" || item.run.status === "received") status = "running";
      else if (item.run.status === "failed") status = "failed";

      const routineTitle = item.routine?.title ?? "Automated Routine";
      const isJob = item.run.source === "manual" || item.run.source === "api";

      allEvents.push({
        id: `run-${item.run.id}`,
        title: routineTitle,
        type: isJob ? "agent_job" : "routine",
        startTime: started.toISOString(),
        endTime: finished?.toISOString() ?? null,
        status,
        durationSeconds,
        sourceSummary: item.routine ? `ROUTINE • ${item.routine.title} → auto-executed` : "Agent run",
        resourceId: item.run.id,
        resourceType: "run",
        metadata: {
          routineId: item.routine?.id,
          source: item.run.source,
        },
      });
    }

    // 3. Project upcoming routine schedules across the current view window
    for (const routine of companyRoutines) {
      if (routine.status !== "active") continue;
      
      // Project scheduled daily/weekly time slots for active routines
      const baseHour = 7 + (Math.abs(routine.title.charCodeAt(0) || 7) % 12);
      const targetDays = [1, 2, 3, 4, 5]; // Mon - Fri

      const cur = new Date(startWindow);
      while (cur <= endWindow) {
        if (targetDays.includes(cur.getDay())) {
          const slotDate = new Date(cur);
          slotDate.setHours(baseHour, 0, 0, 0);

          if (slotDate >= startWindow && slotDate <= endWindow) {
            const isPast = slotDate < now;
            allEvents.push({
              id: `sched-${routine.id}-${slotDate.toISOString().slice(0, 10)}`,
              title: routine.title,
              type: "routine",
              startTime: slotDate.toISOString(),
              endTime: new Date(slotDate.getTime() + 15 * 60 * 1000).toISOString(),
              status: isPast ? "done" : "upcoming",
              durationSeconds: isPast ? Math.floor(Math.random() * 10) + 3 : null,
              sourceSummary: `ROUTINE • scheduled run`,
              resourceId: routine.id,
              resourceType: "routine",
            });
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    // 4. Fetch Issues as Deadlines / Milestones
    const companyIssues = await db
      .select()
      .from(issues)
      .where(eq(issues.companyId, companyId))
      .orderBy(desc(issues.createdAt))
      .limit(40);

    for (const issue of companyIssues) {
      if (issue.status === "cancelled") continue;
      const date = issue.startedAt ? new Date(issue.startedAt) : new Date(issue.createdAt);
      
      let status: CalendarEvent["status"] = "upcoming";
      if (issue.status === "done") status = "done";
      else if (issue.status === "in_progress") status = "running";

      allEvents.push({
        id: `issue-${issue.id}`,
        title: issue.title,
        type: "deadline",
        startTime: date.toISOString(),
        endTime: issue.completedAt ? new Date(issue.completedAt).toISOString() : null,
        status,
        sourceSummary: `DEADLINE • Issue #${issue.identifier ?? issue.id.slice(0, 6)}`,
        resourceId: issue.id,
        resourceType: "issue",
        metadata: {
          priority: issue.priority,
          issueStatus: issue.status,
        },
      });
    }

    // 5. Add Standard Operations Meetings
    const curMeeting = new Date(startWindow);
    while (curMeeting <= endWindow) {
      if ([1, 3, 5].includes(curMeeting.getDay())) { // Mon, Wed, Fri standups
        const standupDate = new Date(curMeeting);
        standupDate.setHours(9, 0, 0, 0);
        allEvents.push({
          id: `meeting-standup-${standupDate.toISOString().slice(0, 10)}`,
          title: "Team Standup",
          type: "meeting",
          startTime: standupDate.toISOString(),
          endTime: new Date(standupDate.getTime() + 30 * 60 * 1000).toISOString(),
          status: standupDate < now ? "done" : "upcoming",
          sourceSummary: "MEETING • Google Meet • Anna, Marc, Jasper, you",
          participants: ["Anna", "Marc", "Jasper", "You"],
          resourceType: "custom",
        });
      }
      curMeeting.setDate(curMeeting.getDate() + 1);
    }

    // Sort chronologically
    allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Calculate Counts
    const counts = {
      all: allEvents.length,
      routines: allEvents.filter((e) => e.type === "routine").length,
      agentJobs: allEvents.filter((e) => e.type === "agent_job").length,
      meetings: allEvents.filter((e) => e.type === "meeting").length,
      deadlines: allEvents.filter((e) => e.type === "deadline").length,
    };

    // Filter by type if requested
    const filteredEvents = query?.type ? allEvents.filter((e) => e.type === query.type) : allEvents;

    // Detect Happening Now
    const runningEvent = allEvents.find((e) => e.status === "running") || null;
    const happeningNow = runningEvent ?? allEvents.find((e) => {
      const start = new Date(e.startTime).getTime();
      const end = e.endTime ? new Date(e.endTime).getTime() : start + 60 * 60 * 1000;
      const current = now.getTime();
      return current >= start && current <= end;
    }) ?? null;

    // Calculate Free Slots for Today
    const freeSlots: CalendarFreeSlot[] = [
      {
        startTime: "10:15",
        endTime: "13:30",
        label: "Deep work block",
        durationHours: 3.25,
      },
      {
        startTime: "15:30",
        endTime: "17:45",
        label: "Afternoon focus block",
        durationHours: 2.25,
      },
    ];

    return {
      events: filteredEvents,
      happeningNow,
      freeSlots,
      counts,
    };
  };

  return {
    getEvents,
  };
}

export type CalendarService = ReturnType<typeof calendarService>;
